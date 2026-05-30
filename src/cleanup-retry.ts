#!/usr/bin/env bun
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { colors, log, symbols } from "./utils";

const MANIFEST_PATH = join(import.meta.dir, "..", "startup.manifest.json");
const ACCOUNT_ID = "8f0203259905d8923687286c84921e6c";

type Json = unknown;
type Obj = Record<string, Json>;

interface Manifest {
  services: Record<string, { originalConfig: Obj }>;
}

const getOAuthToken = (): string => {
  const tomlPath = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  if (!existsSync(tomlPath)) throw new Error(`No wrangler OAuth token at ${tomlPath}`);
  const text = readFileSync(tomlPath, "utf-8");
  const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`Couldn't extract oauth_token from ${tomlPath}`);
  return m[1];
};

const TOKEN = getOAuthToken();

const cfApi = async <T = any>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T; errors: any[]; raw: string }> => {
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const raw = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(raw); } catch {}
  return { ok: r.ok && parsed.success !== false, status: r.status, data: parsed.result as T, errors: parsed.errors ?? [], raw };
};

const cleanEnv = (() => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "CLOUDFLARE_API_TOKEN" || k === "CF_API_TOKEN") continue;
    env[k] = v;
  }
  env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
  return env;
})();

const runWrangler = async (args: string[]): Promise<{ ok: boolean; output: string }> => {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], {
    env: cleanEnv, stdout: "pipe", stderr: "pipe", stdin: "ignore", cwd: "/tmp",
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { ok: code === 0, output: (stdout + "\n" + stderr).trim() };
};

const isAlreadyGone = (o: string) => /not found|does not exist|no such|couldn't find|could not find|not exist|404/i.test(o);

const formatErr = (o: string) => o.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("⛅") && !l.includes("Wrangler") && !l.startsWith("─") && !l.includes("agent skills")).slice(-2).join(" | ").slice(0, 220);

interface Counters { ok: number; gone: number; failed: { name: string; err: string }[]; }

// ───────────────────────────────────────────────────────────── queue consumers
interface QueueListItem { queue_id: string; queue_name: string; consumers?: { consumer_id: string; script_name?: string; type?: string }[]; }

const removeAllQueueConsumers = async (queueNames: Set<string>, counters: Counters) => {
  console.log(`${colors.bold}── Unbinding queue consumers via Cloudflare API ──${colors.reset}`);
  const list = await cfApi<QueueListItem[]>(`/accounts/${ACCOUNT_ID}/queues?per_page=1000`);
  if (!list.ok) {
    log.error(`Couldn't list queues: ${list.raw.slice(0, 200)}`);
    return;
  }
  const queues = list.data ?? [];
  const byName = new Map<string, QueueListItem>();
  for (const q of queues) byName.set(q.queue_name, q);

  for (const qname of queueNames) {
    const q = byName.get(qname);
    if (!q) {
      console.log(`  ${colors.dim}${qname} not present on Cloudflare${colors.reset}`);
      continue;
    }
    // Get full details including consumers
    const detail = await cfApi<QueueListItem>(`/accounts/${ACCOUNT_ID}/queues/${q.queue_id}`);
    const consumers = detail.data?.consumers ?? [];
    if (consumers.length === 0) {
      console.log(`  ${colors.dim}${qname}: no consumers to remove${colors.reset}`);
      continue;
    }
    for (const c of consumers) {
      process.stdout.write(`  ${colors.yellow}UNBIND${colors.reset} ${qname.padEnd(40)} ← ${(c.script_name ?? c.consumer_id).padEnd(40)} ... `);
      const del = await cfApi(`/accounts/${ACCOUNT_ID}/queues/${q.queue_id}/consumers/${c.consumer_id}`, { method: "DELETE" });
      if (del.ok) {
        console.log(`${colors.green}${symbols.success}${colors.reset}`);
        counters.ok++;
      } else {
        console.log(`${colors.red}${symbols.error}${colors.reset}`);
        const err = (del.errors?.[0]?.message ?? del.raw).slice(0, 180);
        console.log(`    ${colors.dim}${err}${colors.reset}`);
        counters.failed.push({ name: `consumer:${qname}/${c.consumer_id}`, err });
      }
    }
  }
};

// ───────────────────────────────────────────────────────────── R2 emptying via S3
const getR2Client = (): S3Client | null => {
  const ak = process.env.R2_ACCESS_KEY_ID;
  const sk = process.env.R2_SECRET_ACCESS_KEY;
  if (!ak || !sk) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ak, secretAccessKey: sk },
  });
};

const emptyAndDeleteR2 = async (buckets: string[], counters: Counters) => {
  console.log(`\n${colors.bold}── R2 buckets: empty via S3 + delete via wrangler ──${colors.reset}`);
  const client = getR2Client();
  if (!client) {
    log.error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not in env — skipping R2 retry");
    return;
  }
  for (const bucket of buckets) {
    process.stdout.write(`  ${colors.cyan}EMPTY${colors.reset} ${bucket.padEnd(50)} ... `);
    let total = 0;
    let token: string | undefined;
    try {
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
        const objs = r.Contents ?? [];
        if (objs.length === 0) break;
        await client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objs.filter(o => o.Key).map(o => ({ Key: o.Key! })), Quiet: true },
        }));
        total += objs.length;
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      console.log(`${colors.green}${total} obj(s)${colors.reset}`);
    } catch (e) {
      console.log(`${colors.red}${symbols.error} list/empty failed${colors.reset}`);
      console.log(`    ${colors.dim}${(e as Error).message.slice(0, 200)}${colors.reset}`);
      counters.failed.push({ name: `r2-empty:${bucket}`, err: (e as Error).message });
      continue;
    }
    process.stdout.write(`  ${colors.red}DEL${colors.reset}   ${bucket.padEnd(50)} ... `);
    const del = await runWrangler(["r2", "bucket", "delete", bucket]);
    if (del.ok) { console.log(`${colors.green}${symbols.success}${colors.reset}`); counters.ok++; }
    else if (isAlreadyGone(del.output)) { console.log(`${colors.dim}already gone${colors.reset}`); counters.gone++; }
    else { console.log(`${colors.red}${symbols.error}${colors.reset}`); const err = formatErr(del.output); console.log(`    ${colors.dim}${err}${colors.reset}`); counters.failed.push({ name: `r2:${bucket}`, err }); }
  }
};

const tryWranglerDelete = async (kind: string, name: string, args: string[], counters: Counters) => {
  process.stdout.write(`  ${colors.red}DEL${colors.reset} ${kind.padEnd(10)} ${name.padEnd(50)} ... `);
  const r = await runWrangler(args);
  if (r.ok) { console.log(`${colors.green}${symbols.success}${colors.reset}`); counters.ok++; }
  else if (isAlreadyGone(r.output)) { console.log(`${colors.dim}already gone${colors.reset}`); counters.gone++; }
  else { console.log(`${colors.red}${symbols.error}${colors.reset}`); const err = formatErr(r.output); console.log(`    ${colors.dim}${err}${colors.reset}`); counters.failed.push({ name: `${kind}:${name}`, err }); }
};

// ───────────────────────────────────────────────────────────── main
const main = async () => {
  log.info(`Retry cleanup for failed resources`);
  log.info(`OAuth token loaded; account ${ACCOUNT_ID}`);
  console.log("");

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;

  // Collect all queues from manifest so we can sweep consumers
  const queueNames = new Set<string>();
  const workerNames = new Set<string>();
  const vectorize = new Set<string>();
  const r2Buckets = new Set<string>();
  for (const [svc, entry] of Object.entries(manifest.services)) {
    const cfg = entry.originalConfig;
    const topName = typeof cfg.name === "string" ? cfg.name : null;
    if (topName) workerNames.add(topName);
    const levels: Obj[] = [cfg];
    if (cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env)) {
      for (const [envName, envCfg] of Object.entries(cfg.env as Obj)) {
        if (envCfg && typeof envCfg === "object" && !Array.isArray(envCfg)) {
          levels.push(envCfg as Obj);
          const explicit = (envCfg as Obj).name;
          if (typeof explicit === "string") workerNames.add(explicit);
          else if (topName) workerNames.add(`${topName}-${envName}`);
        }
      }
    }
    for (const level of levels) {
      const q = level.queues;
      if (q && typeof q === "object" && !Array.isArray(q)) {
        const qObj = q as Obj;
        for (const p of (Array.isArray(qObj.producers) ? qObj.producers as Obj[] : [])) if (typeof p.queue === "string") queueNames.add(p.queue);
        for (const c of (Array.isArray(qObj.consumers) ? qObj.consumers as Obj[] : [])) if (typeof c.queue === "string") queueNames.add(c.queue);
      }
      for (const v of (Array.isArray(level.vectorize) ? level.vectorize as Obj[] : [])) if (typeof v.index_name === "string") vectorize.add(v.index_name);
      for (const b of (Array.isArray(level.r2_buckets) ? level.r2_buckets as Obj[] : [])) if (typeof b.bucket_name === "string") r2Buckets.add(b.bucket_name);
    }
  }

  const counters: Counters = { ok: 0, gone: 0, failed: [] };

  // Step 1: Unbind queue consumers (lets workers + queues delete cleanly)
  await removeAllQueueConsumers(queueNames, counters);

  // Step 2: Retry worker deletes (now consumer-free)
  console.log(`\n${colors.bold}── Retry worker deletes ──${colors.reset}`);
  for (const name of [...workerNames].sort()) {
    await tryWranglerDelete("worker", name, ["delete", "--name", name, "--force"], counters);
  }

  // Step 3: Retry queue deletes
  console.log(`\n${colors.bold}── Retry queue deletes ──${colors.reset}`);
  for (const name of [...queueNames].sort()) {
    await tryWranglerDelete("queue", name, ["queues", "delete", name], counters);
  }

  // Step 4: Retry Vectorize with correct flag (-y, not -f)
  console.log(`\n${colors.bold}── Retry Vectorize deletes (-y) ──${colors.reset}`);
  for (const name of [...vectorize].sort()) {
    await tryWranglerDelete("vectorize", name, ["vectorize", "delete", name, "-y"], counters);
  }

  // Step 5: Empty non-empty R2 buckets via S3 SDK, then delete
  // From the first pass we know these were the holdouts:
  const nonEmptyBuckets = ["crow-core-interaction-service-store", "crow-web-ingest-service-store-dev"];
  await emptyAndDeleteR2(nonEmptyBuckets, counters);

  console.log("");
  log.info(`Retry summary`);
  console.log(`  OK / deleted: ${counters.ok}`);
  console.log(`  Already gone: ${counters.gone}`);
  console.log(`  Still failed: ${counters.failed.length}`);
  if (counters.failed.length) {
    console.log("");
    log.warn(`Still failing:`);
    for (const f of counters.failed) console.log(`  ${colors.red}${f.name}${colors.reset}  ${colors.dim}${f.err}${colors.reset}`);
    process.exit(1);
  }
  log.success(`All retries succeeded.`);
};

main().catch(e => { log.error(String(e)); process.exit(1); });
