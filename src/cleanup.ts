#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { colors, log, symbols } from "./utils";

const MANIFEST_PATH = join(import.meta.dir, "..", "startup.manifest.json");
const BITBYBIT_ACCOUNT_ID = "8f0203259905d8923687286c84921e6c";

type Json = unknown;
type Obj = Record<string, Json>;

interface ServiceEntry {
  wranglerRelPath: string;
  resourcesPresent: string[];
  envsPresent: string[];
  originalConfig: Obj;
}

interface Manifest {
  extractedAt: string;
  version: 1;
  workspaceRoot: string;
  services: Record<string, ServiceEntry>;
}

const cleanEnv = (() => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "CLOUDFLARE_API_TOKEN" || k === "CF_API_TOKEN") continue;
    env[k] = v;
  }
  env.CLOUDFLARE_ACCOUNT_ID = BITBYBIT_ACCOUNT_ID;
  return env;
})();

const runWrangler = async (args: string[]): Promise<{ ok: boolean; output: string; }> => {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], {
    env: cleanEnv,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    cwd: "/tmp",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  const output = (stdout + "\n" + stderr).trim();
  return { ok: code === 0, output };
};

const formatErr = (output: string): string => {
  const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
  const meaningful = lines.filter(l =>
    !l.startsWith("⛅") &&
    !l.includes("Wrangler") &&
    !l.startsWith("─") &&
    !l.includes("agent skills")
  );
  return (meaningful.slice(-3).join(" | ") || lines.slice(-2).join(" | ")).slice(0, 240);
};

const isAlreadyGone = (output: string): boolean =>
  /not found|does not exist|no such|couldn't find|could not find|not exist/i.test(output);

interface Counters { deleted: number; alreadyGone: number; failed: { name: string; err: string }[]; }

const tryDelete = async (kind: string, name: string, args: string[], counters: Counters): Promise<void> => {
  process.stdout.write(`  ${colors.red}DEL${colors.reset} ${kind.padEnd(10)} ${name.padEnd(50)} ... `);
  const r = await runWrangler(args);
  if (r.ok) {
    console.log(`${colors.green}${symbols.success}${colors.reset}`);
    counters.deleted++;
  } else if (isAlreadyGone(r.output)) {
    console.log(`${colors.dim}already gone${colors.reset}`);
    counters.alreadyGone++;
  } else {
    console.log(`${colors.red}${symbols.error}${colors.reset}`);
    const err = formatErr(r.output);
    console.log(`      ${colors.dim}${err}${colors.reset}`);
    counters.failed.push({ name: `${kind}:${name}`, err });
  }
};

const emptyR2Bucket = async (name: string): Promise<number> => {
  let deleted = 0;
  for (let page = 0; page < 100; page++) {
    const list = await runWrangler(["r2", "object", "list", name]);
    if (!list.ok) break;
    const keys = list.output
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("Listing") && !l.includes("Key") && !l.startsWith("─") && !l.startsWith("│"))
      .map(l => l.split(/\s+/)[0])
      .filter(k => k && k !== "Key" && !k.startsWith("⛅"));
    if (keys.length === 0) break;
    for (const key of keys) {
      const d = await runWrangler(["r2", "object", "delete", `${name}/${key}`]);
      if (d.ok) deleted++;
    }
  }
  return deleted;
};

const collectTargets = (manifest: Manifest) => {
  const d1: Set<string> = new Set();
  const r2: Set<string> = new Set();
  const kv: { id: string; binding: string; service: string }[] = [];
  const queues: Set<string> = new Set();
  const vectorize: Set<string> = new Set();
  const workers: Set<string> = new Set();

  for (const [svcName, entry] of Object.entries(manifest.services)) {
    const cfg = entry.originalConfig;
    const topName = typeof cfg.name === "string" ? cfg.name : null;
    if (topName) workers.add(topName);

    const levels: Obj[] = [cfg];
    if (cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env)) {
      for (const [envName, envCfg] of Object.entries(cfg.env as Obj)) {
        if (envCfg && typeof envCfg === "object" && !Array.isArray(envCfg)) {
          levels.push(envCfg as Obj);
          const explicit = (envCfg as Obj).name;
          if (typeof explicit === "string") workers.add(explicit);
          else if (topName) workers.add(`${topName}-${envName}`);
        }
      }
    }

    for (const level of levels) {
      const dbs = Array.isArray(level.d1_databases) ? level.d1_databases as Obj[] : [];
      for (const db of dbs) if (typeof db.database_name === "string") d1.add(db.database_name);

      const buckets = Array.isArray(level.r2_buckets) ? level.r2_buckets as Obj[] : [];
      for (const b of buckets) if (typeof b.bucket_name === "string") r2.add(b.bucket_name);

      const kvs = Array.isArray(level.kv_namespaces) ? level.kv_namespaces as Obj[] : [];
      for (const k of kvs) {
        if (typeof k.id === "string") {
          const binding = typeof k.binding === "string" ? k.binding : "?";
          if (!kv.some(x => x.id === k.id)) kv.push({ id: k.id, binding, service: svcName });
        }
      }

      const q = level.queues;
      if (q && typeof q === "object" && !Array.isArray(q)) {
        const qObj = q as Obj;
        const producers = Array.isArray(qObj.producers) ? qObj.producers as Obj[] : [];
        const consumers = Array.isArray(qObj.consumers) ? qObj.consumers as Obj[] : [];
        for (const p of producers) if (typeof p.queue === "string") queues.add(p.queue);
        for (const c of consumers) if (typeof c.queue === "string") queues.add(c.queue);
      }

      const vec = Array.isArray(level.vectorize) ? level.vectorize as Obj[] : [];
      for (const v of vec) if (typeof v.index_name === "string") vectorize.add(v.index_name);
    }
  }

  return { d1, r2, kv, queues, vectorize, workers };
};

const main = async () => {
  if (!existsSync(MANIFEST_PATH)) {
    log.error(`Manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;

  log.warn("==================================================================");
  log.warn("  IRREVERSIBLE: deleting ALL crow-* Cloudflare resources (dev+prod)");
  log.warn("==================================================================");

  const whoami = await runWrangler(["whoami"]);
  if (!whoami.ok) {
    log.error(`wrangler whoami failed:\n${whoami.output}`);
    process.exit(1);
  }
  console.log(whoami.output.split("\n").filter(l => l.includes("logged in") || l.includes("Account ID") || l.includes("BitByBit")).join("\n"));
  console.log("");

  const targets = collectTargets(manifest);
  log.info(`Targets:`);
  console.log(`  Workers:        ${targets.workers.size}`);
  console.log(`  Queues:         ${targets.queues.size}`);
  console.log(`  D1:             ${targets.d1.size}`);
  console.log(`  Vectorize:      ${targets.vectorize.size}`);
  console.log(`  KV namespaces:  ${targets.kv.length}`);
  console.log(`  R2 buckets:     ${targets.r2.size}`);
  console.log("");

  const counters: Counters = { deleted: 0, alreadyGone: 0, failed: [] };

  // Order: workers first (stop new writes), then queues, then data resources, R2 last (slowest).
  console.log(`${colors.bold}── Deployed workers (${targets.workers.size}) ──${colors.reset}`);
  for (const name of [...targets.workers].sort()) {
    await tryDelete("worker", name, ["delete", "--name", name, "--force"], counters);
  }

  console.log(`\n${colors.bold}── Queues (${targets.queues.size}) ──${colors.reset}`);
  for (const name of [...targets.queues].sort()) {
    await tryDelete("queue", name, ["queues", "delete", name], counters);
  }

  console.log(`\n${colors.bold}── D1 databases (${targets.d1.size}) ──${colors.reset}`);
  for (const name of [...targets.d1].sort()) {
    await tryDelete("d1", name, ["d1", "delete", name, "-y"], counters);
  }

  console.log(`\n${colors.bold}── Vectorize indexes (${targets.vectorize.size}) ──${colors.reset}`);
  for (const name of [...targets.vectorize].sort()) {
    await tryDelete("vectorize", name, ["vectorize", "delete", name, "-f"], counters);
  }

  console.log(`\n${colors.bold}── KV namespaces (${targets.kv.length}) ──${colors.reset}`);
  for (const { id, binding, service } of targets.kv) {
    await tryDelete("kv", `${binding}@${service} (${id})`, ["kv", "namespace", "delete", "--namespace-id", id], counters);
  }

  console.log(`\n${colors.bold}── R2 buckets (${targets.r2.size}) ──${colors.reset}`);
  for (const name of [...targets.r2].sort()) {
    process.stdout.write(`  ${colors.red}DEL${colors.reset} r2bucket   ${name.padEnd(50)} ... `);
    let r = await runWrangler(["r2", "bucket", "delete", name]);
    if (!r.ok && /not empty|objects/i.test(r.output)) {
      console.log(`${colors.yellow}emptying first${colors.reset}`);
      const purged = await emptyR2Bucket(name);
      console.log(`      ${colors.dim}emptied ${purged} object(s), retrying delete${colors.reset}`);
      process.stdout.write(`  ${colors.red}DEL${colors.reset} r2bucket   ${name.padEnd(50)} ... `);
      r = await runWrangler(["r2", "bucket", "delete", name]);
    }
    if (r.ok) { console.log(`${colors.green}${symbols.success}${colors.reset}`); counters.deleted++; }
    else if (isAlreadyGone(r.output)) { console.log(`${colors.dim}already gone${colors.reset}`); counters.alreadyGone++; }
    else {
      console.log(`${colors.red}${symbols.error}${colors.reset}`);
      const err = formatErr(r.output);
      console.log(`      ${colors.dim}${err}${colors.reset}`);
      counters.failed.push({ name: `r2:${name}`, err });
    }
  }

  console.log("");
  log.info(`Summary`);
  console.log(`  Deleted:      ${counters.deleted}`);
  console.log(`  Already gone: ${counters.alreadyGone}`);
  console.log(`  Failed:       ${counters.failed.length}`);
  if (counters.failed.length > 0) {
    console.log("");
    log.warn(`Failed resources (delete manually):`);
    for (const f of counters.failed) console.log(`  ${colors.red}${f.name}${colors.reset}  ${colors.dim}${f.err}${colors.reset}`);
    process.exit(1);
  }
  log.success("Wipe complete.");
};

main().catch(e => { log.error(String(e)); process.exit(1); });
