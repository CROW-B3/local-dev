#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { colors, getWorkspaceRoot, log, symbols } from "./utils";

const MANIFEST_PATH = join(import.meta.dir, "..", "startup.manifest.json");

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

interface RunResult { ok: boolean; output: string; alreadyExists: boolean; }

const ALREADY_EXISTS_RE = /already exists|already taken|duplicate/i;

const runWrangler = async (args: string[], execute: boolean): Promise<RunResult> => {
  if (!execute) {
    console.log(`    ${colors.dim}[dry-run] wrangler ${args.join(" ")}${colors.reset}`);
    return { ok: true, output: "[dry-run]", alreadyExists: false };
  }
  const result = await $`wrangler ${args}`.quiet().nothrow();
  const output = (result.stdout.toString() + "\n" + result.stderr.toString()).trim();
  const alreadyExists = ALREADY_EXISTS_RE.test(output);
  return {
    ok: result.exitCode === 0 || alreadyExists,
    output,
    alreadyExists,
  };
};

// Parse `wrangler d1 create` output to extract the new database_id.
// Output looks like: ... "database_id": "abc-123-...", ...
const extractDatabaseId = (output: string): string | null => {
  const m = output.match(/database_id\s*[:=]\s*"?([0-9a-f-]{36})"?/i);
  return m ? m[1] : null;
};

// Parse `wrangler kv namespace create` output to extract the new id.
const extractKvId = (output: string): string | null => {
  const m = output.match(/id\s*[:=]\s*"?([0-9a-f]{32,})"?/i);
  return m ? m[1] : null;
};

type Level = { config: Obj; label: string };

// Returns all config levels to process: top-level and each env.
const levels = (cfg: Obj): Level[] => {
  const out: Level[] = [{ config: cfg, label: "top" }];
  const env = cfg.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [envName, envCfg] of Object.entries(env as Obj)) {
      if (envCfg && typeof envCfg === "object" && !Array.isArray(envCfg)) {
        out.push({ config: envCfg as Obj, label: `env.${envName}` });
      }
    }
  }
  return out;
};

const asArray = (v: unknown): Obj[] => Array.isArray(v) ? v as Obj[] : [];

const provisionService = async (
  svcName: string,
  entry: ServiceEntry,
  options: { execute: boolean; createdQueues: Set<string>; onlyKinds: Set<string> | null; },
): Promise<{ config: Obj; failures: string[]; }> => {
  const cfg = structuredClone(entry.originalConfig);
  const failures: string[] = [];
  const want = (k: string) => !options.onlyKinds || options.onlyKinds.has(k);

  for (const { config, label } of levels(cfg)) {
    // D1 databases — create + capture new ID
    if (want("d1")) {
      for (const db of asArray(config.d1_databases)) {
        const name = String(db.database_name ?? "");
        if (!name) continue;
        console.log(`  ${colors.cyan}d1${colors.reset}  [${label}] ${name}`);
        const r = await runWrangler(["d1", "create", name], options.execute);
        if (!r.ok) { failures.push(`d1 ${name}: ${r.output.split("\n").pop()}`); continue; }
        if (options.execute && !r.alreadyExists) {
          const newId = extractDatabaseId(r.output);
          if (newId) {
            db.database_id = newId;
            console.log(`    ${colors.green}${symbols.success}${colors.reset} new id: ${newId}`);
          } else {
            console.log(`    ${colors.yellow}${symbols.warning}${colors.reset} couldn't parse new id — kept old id (verify manually)`);
          }
        } else if (r.alreadyExists) {
          console.log(`    ${colors.dim}already exists — kept existing id${colors.reset}`);
        }
      }
    }

    // R2 buckets
    if (want("r2")) {
      for (const bucket of asArray(config.r2_buckets)) {
        const name = String(bucket.bucket_name ?? "");
        if (!name) continue;
        console.log(`  ${colors.cyan}r2${colors.reset}  [${label}] ${name}`);
        const r = await runWrangler(["r2", "bucket", "create", name], options.execute);
        if (!r.ok) failures.push(`r2 ${name}: ${r.output.split("\n").pop()}`);
        else if (r.alreadyExists) console.log(`    ${colors.dim}already exists${colors.reset}`);
      }
    }

    // KV namespaces — name not in config; derive from service + binding + env label
    if (want("kv")) {
      for (const kv of asArray(config.kv_namespaces)) {
        const binding = String(kv.binding ?? "KV");
        const derivedName = `${svcName}-${binding.toLowerCase().replace(/_/g, "-")}-${label.replace(/^env\./, "")}`;
        console.log(`  ${colors.cyan}kv${colors.reset}  [${label}] ${derivedName} (binding=${binding})`);
        const r = await runWrangler(["kv", "namespace", "create", derivedName], options.execute);
        if (!r.ok) { failures.push(`kv ${derivedName}: ${r.output.split("\n").pop()}`); continue; }
        if (options.execute && !r.alreadyExists) {
          const newId = extractKvId(r.output);
          if (newId) {
            kv.id = newId;
            console.log(`    ${colors.green}${symbols.success}${colors.reset} new id: ${newId}`);
          } else {
            console.log(`    ${colors.yellow}${symbols.warning}${colors.reset} couldn't parse new id — kept old id (verify manually)`);
          }
        }
      }
    }

    // Queues — producers AND consumers (de-duped globally)
    if (want("queues")) {
      const queues = config.queues;
      if (queues && typeof queues === "object" && !Array.isArray(queues)) {
        const q = queues as Obj;
        const allQueueNames = new Set<string>();
        for (const p of asArray(q.producers)) {
          if (typeof p.queue === "string") allQueueNames.add(p.queue);
        }
        for (const c of asArray(q.consumers)) {
          if (typeof c.queue === "string") allQueueNames.add(c.queue);
        }
        for (const qname of allQueueNames) {
          if (options.createdQueues.has(qname)) continue;
          options.createdQueues.add(qname);
          console.log(`  ${colors.cyan}queue${colors.reset} [${label}] ${qname}`);
          const r = await runWrangler(["queues", "create", qname], options.execute);
          if (!r.ok) failures.push(`queue ${qname}: ${r.output.split("\n").pop()}`);
          else if (r.alreadyExists) console.log(`    ${colors.dim}already exists${colors.reset}`);
        }
      }
    }

    // Vectorize indexes
    if (want("vectorize")) {
      for (const idx of asArray(config.vectorize)) {
        const name = String(idx.index_name ?? "");
        if (!name) continue;
        const dims = idx.dimensions;
        const metric = idx.metric;
        if (typeof dims !== "number" || typeof metric !== "string") {
          console.log(`  ${colors.yellow}vec${colors.reset} [${label}] ${name} — ${colors.yellow}skipped: missing dimensions/metric in manifest${colors.reset}`);
          failures.push(`vectorize ${name}: missing dimensions/metric — create manually with: wrangler vectorize create ${name} --dimensions=<N> --metric=<cosine|euclidean|dot-product>`);
          continue;
        }
        console.log(`  ${colors.cyan}vec${colors.reset} [${label}] ${name} (dim=${dims}, metric=${metric})`);
        const r = await runWrangler(["vectorize", "create", name, `--dimensions=${dims}`, `--metric=${metric}`], options.execute);
        if (!r.ok) failures.push(`vectorize ${name}: ${r.output.split("\n").pop()}`);
        else if (r.alreadyExists) console.log(`    ${colors.dim}already exists${colors.reset}`);
      }
    }
  }

  return { config: cfg, failures };
};

const main = async () => {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const onlySvcArg = args.find(a => a.startsWith("--only="));
  const onlySvc = onlySvcArg ? onlySvcArg.split("=")[1] : null;
  const onlyKindsArg = args.find(a => a.startsWith("--kinds="));
  const onlyKinds = onlyKindsArg ? new Set(onlyKindsArg.split("=")[1].split(",")) : null;
  const restoreOnly = args.includes("--restore-only");

  if (!existsSync(MANIFEST_PATH)) {
    log.error(`Manifest not found: ${MANIFEST_PATH}`);
    log.error(`Run \`bun run shutdown\` first (which produces it).`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  const workspaceRoot = getWorkspaceRoot();

  log.info(`Manifest:  ${MANIFEST_PATH}`);
  log.info(`Workspace: ${workspaceRoot}`);
  log.info(`Extracted: ${manifest.extractedAt}`);
  log.info(`Services:  ${Object.keys(manifest.services).length}`);
  if (!execute) log.warn(`DRY RUN — pass --execute to actually invoke wrangler. Configs will not be written either.`);
  if (restoreOnly) log.warn(`--restore-only — skipping wrangler calls; only restoring wrangler.jsonc files from manifest as-is.`);
  if (onlySvc) log.info(`--only=${onlySvc}`);
  if (onlyKinds) log.info(`--kinds=${[...onlyKinds].join(",")}`);
  console.log("");

  const createdQueues = new Set<string>();
  const allFailures: { svc: string; failures: string[] }[] = [];

  for (const [svcName, entry] of Object.entries(manifest.services)) {
    if (onlySvc && svcName !== onlySvc) continue;
    console.log(`${colors.bold}${colors.cyan}━━ ${svcName} ━━${colors.reset}`);

    let finalConfig: Obj;
    if (restoreOnly) {
      finalConfig = structuredClone(entry.originalConfig);
    } else {
      const { config, failures } = await provisionService(svcName, entry, {
        execute,
        createdQueues,
        onlyKinds,
      });
      finalConfig = config;
      if (failures.length) allFailures.push({ svc: svcName, failures });
    }

    const wranglerPath = join(workspaceRoot, svcName, "wrangler.jsonc");
    if (!existsSync(wranglerPath)) {
      log.warn(`  ${svcName}: ${wranglerPath} not found — skipping config restore`);
      continue;
    }
    if (execute || restoreOnly) {
      writeFileSync(wranglerPath, JSON.stringify(finalConfig, null, 2) + "\n", "utf-8");
      console.log(`  ${colors.green}${symbols.success}${colors.reset} restored ${wranglerPath}`);
    } else {
      console.log(`  ${colors.dim}[dry-run] would restore ${wranglerPath}${colors.reset}`);
    }
    console.log("");
  }

  if (allFailures.length) {
    log.warn(`Completed with failures:`);
    for (const { svc, failures } of allFailures) {
      console.log(`  ${colors.red}${svc}${colors.reset}`);
      for (const f of failures) console.log(`    ${colors.dim}- ${f}${colors.reset}`);
    }
    process.exit(1);
  }

  log.success(`Done. Next: \`wrangler deploy\` in each service, and re-run any drizzle migrations.`);
};

main().catch(e => {
  log.error(String(e));
  process.exit(1);
});
