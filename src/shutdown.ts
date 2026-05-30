#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, type ParseError } from "jsonc-parser";
import { colors, getWorkspaceRoot, log, symbols } from "./utils";

const MANIFEST_PATH = join(import.meta.dir, "..", "startup.manifest.json");

const SKIP_DIRS = new Set([
  "local-dev",
  "cloudflare-opennext-nextjs-template",
  "cloudflare-workers-containers-go-template",
  "cloudflare-workers-containers-hono-template",
  "cloudflare-workers-containers-python-template",
  "npm-sdk-template",
]);

const KEEP_KEYS = [
  "$schema",
  "name",
  "account_id",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "observability",
] as const;

const RESOURCE_KEYS = [
  "triggers",
  "queues",
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "ai",
  "vectorize",
  "durable_objects",
  "containers",
  "migrations",
  "vars",
  "routes",
  "services",
  "assets",
  "placement",
  "logpush",
  "dev",
  "env",
  "tail_consumers",
  "analytics_engine_datasets",
  "hyperdrive",
  "browser",
  "images",
  "send_email",
  "workflows",
  "pipelines",
  "dispatch_namespaces",
  "mtls_certificates",
  "version_metadata",
  "unsafe",
] as const;

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

const parseJsonc = (path: string): Obj => {
  const text = readFileSync(path, "utf-8");
  const errors: ParseError[] = [];
  const result = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    log.warn(`${path}: parsed with ${errors.length} JSONC warnings (ignored)`);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`did not parse to a JSON object`);
  }
  return result as Obj;
};

const isAlreadyStripped = (config: Obj): boolean =>
  !RESOURCE_KEYS.some(k => k in config);

const stripConfig = (config: Obj): Obj => {
  const stub: Obj = {};
  for (const key of KEEP_KEYS) {
    if (key in config) stub[key] = config[key];
  }
  return stub;
};

const summarizeResources = (config: Obj): string[] => {
  const present = new Set<string>();
  const walk = (obj: Obj) => {
    for (const k of RESOURCE_KEYS) {
      if (k === "env") continue;
      if (k in obj) present.add(k);
    }
  };
  walk(config);
  const env = config.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const envCfg of Object.values(env as Obj)) {
      if (envCfg && typeof envCfg === "object" && !Array.isArray(envCfg)) {
        walk(envCfg as Obj);
      }
    }
  }
  return [...present].sort();
};

const collectEnvs = (config: Obj): string[] => {
  const env = config.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) return [];
  return Object.keys(env as Obj).sort();
};

const discoverServices = (workspaceRoot: string): string[] => {
  const entries = readdirSync(workspaceRoot, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => !SKIP_DIRS.has(name) && !name.startsWith("."))
    .filter(name => existsSync(join(workspaceRoot, name, "wrangler.jsonc")))
    .sort();
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const force = args.has("--force");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace: ${workspaceRoot}`);
  log.info(`Manifest:  ${MANIFEST_PATH}`);
  if (dryRun) log.warn(`Dry run — no files will be modified`);

  if (existsSync(MANIFEST_PATH) && !force && !dryRun) {
    log.error(`Manifest already exists at ${MANIFEST_PATH}`);
    log.error(`Refusing to overwrite. Pass --force only if you know what you're doing.`);
    log.error(`(Re-extracting after a strip would replace the manifest with empty stubs and lose original config.)`);
    process.exit(1);
  }

  const services = discoverServices(workspaceRoot);
  log.info(`Found ${services.length} service dirs with wrangler.jsonc`);
  console.log("");

  const manifest: Manifest = {
    extractedAt: new Date().toISOString(),
    version: 1,
    workspaceRoot,
    services: {},
  };

  let stripped = 0;
  let alreadyStrippedCount = 0;
  let errors = 0;

  for (const svc of services) {
    const wranglerPath = join(workspaceRoot, svc, "wrangler.jsonc");
    let original: Obj;
    try {
      original = parseJsonc(wranglerPath);
    } catch (e) {
      log.error(`${svc.padEnd(40)} ${symbols.error} parse failed: ${(e as Error).message}`);
      errors++;
      continue;
    }

    if (isAlreadyStripped(original)) {
      log.warn(`${svc.padEnd(40)} ${symbols.warning} already stripped — skipping`);
      alreadyStrippedCount++;
      continue;
    }

    const resourcesPresent = summarizeResources(original);
    const envsPresent = collectEnvs(original);

    manifest.services[svc] = {
      wranglerRelPath: `../${svc}/wrangler.jsonc`,
      resourcesPresent,
      envsPresent,
      originalConfig: original,
    };

    if (!dryRun) {
      const stub = stripConfig(original);
      writeFileSync(wranglerPath, JSON.stringify(stub, null, 2) + "\n", "utf-8");
    }
    const envLabel = envsPresent.length ? `envs=[${envsPresent.join(",")}]` : "";
    const resLabel = resourcesPresent.length ? `keys=[${resourcesPresent.join(",")}]` : "no-resources";
    console.log(
      `  ${colors.green}${symbols.success}${colors.reset} ${svc.padEnd(40)} ` +
      `${colors.dim}${resLabel} ${envLabel}${colors.reset}`
    );
    stripped++;
  }

  if (!dryRun) {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    console.log("");
    log.success(`Manifest written → ${MANIFEST_PATH}`);
  } else {
    console.log("");
    log.warn(`[dry-run] Manifest NOT written`);
  }

  console.log("");
  log.info(`Summary`);
  console.log(`  Stripped:         ${stripped}`);
  console.log(`  Already stripped: ${alreadyStrippedCount}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`  Total:            ${services.length}`);
  console.log("");
  log.info(`When ready to bring things back up: ${colors.cyan}bun run startup${colors.reset}`);

  if (errors > 0) process.exit(1);
};

main().catch(e => {
  log.error(String(e));
  process.exit(1);
});
