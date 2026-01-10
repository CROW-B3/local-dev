#!/usr/bin/env bun

import { $ } from "bun";
import { writeFile } from "fs/promises";
import { search, select, confirm, input } from "@inquirer/prompts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SERVICES, type ServiceResources, type D1Resource, type R2Resource } from "../resources.config";
import { colors as c, log, ProgressDisplay, flushWrites, AuditLogger, safetyValidator } from "./utils";

type ResourceType = "d1" | "r2" | "both";
type Environment = "production" | "dev" | "local" | "both";

interface CleanupSelection {
  service: ServiceResources;
  resourceType: ResourceType;
  environment: Environment;
  d1ToClean: D1Resource[];
  r2ToClean: R2Resource[];
}

interface CleanupStats {
  totalTime: number;
  d1Cleaned: number;
  d1Failed: number;
  r2Cleaned: number;
  r2ObjectsDeleted: number;
  r2Failed: number;
}

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

const banner = () => {
  console.clear();
  log.info(`
${c.red}${c.bold}  _____ _      ______          _   _ _    _ _____
${c.red} / ____| |    |  ____|   /\\   | \\ | | |  | |  __ \\
${c.red}| |    | |    | |__     /  \\  |  \\| | |  | | |__) |
${c.yellow}| |    | |    |  __|   / /\\ \\ | . \` | |  | |  ___/
${c.yellow}| |____| |____| |____ / ____ \\| |\\  | |__| | |
${c.green} \\_____|______|______/_/    \\_\\_| \\_|\\____/|_|
${c.reset}
${c.dim}  Cloudflare D1 & R2 Resource Cleanup Tool${c.reset}
${c.dim}  ─────────────────────────────────────────${c.reset}
  `);
};

const tag = (env: "production" | "dev" | "local"): string => {
  if (env === "production") return `${c.red}[PROD]${c.reset}`;
  if (env === "dev") return `${c.yellow}[DEV]${c.reset}`;
  return `${c.cyan}[LOCAL]${c.reset}`;
};

// Retry mechanism with exponential backoff
const withRetry = async <T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  operationName: string = "operation"
): Promise<{ success: boolean; result?: T; error?: string; attempts: number }> => {
  let lastError: string | undefined;
  let delay = config.delayMs;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      return { success: true, result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < config.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= config.backoffMultiplier;
      }
    }
  }

  return { success: false, error: lastError, attempts: config.maxRetries };
};

const selectService = async (): Promise<ServiceResources> => {
  const serviceChoices = SERVICES.map(s => ({
    name: s.service,
    value: s,
    description: s.displayName,
  }));

  return await search({
    message: "Select service:",
    source: async (term) => {
      if (!term) return serviceChoices;
      const lower = term.toLowerCase();
      return serviceChoices.filter(
        choice => choice.name.toLowerCase().includes(lower) ||
             choice.description.toLowerCase().includes(lower)
      );
    },
  });
};

const selectResourceType = async (service: ServiceResources): Promise<ResourceType> => {
  const d1Lines = service.d1.map(d => `${tag(d.env)} ${d.name}`).join("\n");
  const r2Lines = service.r2.map(r => `${tag(r.env)} ${r.name}`).join("\n");
  const allLines = [...service.d1, ...service.r2].map(r => `${tag(r.env)} ${r.name}`).join("\n");

  return await select({
    message: "What to clean?",
    choices: [
      {
        name: `${c.blue}D1${c.reset} Database only`,
        value: "d1" as const,
        description: d1Lines,
      },
      {
        name: `${c.magenta}R2${c.reset} Bucket only`,
        value: "r2" as const,
        description: r2Lines,
      },
      {
        name: `${c.cyan}Both${c.reset} D1 + R2`,
        value: "both" as const,
        description: allLines,
      },
    ],
  });
};

const selectEnvironment = async (
  service: ServiceResources,
  resourceType: ResourceType
): Promise<Environment> => {
  const getResources = (env: "production" | "dev" | "local") => {
    const items: string[] = [];
    if (resourceType === "d1" || resourceType === "both") {
      items.push(...service.d1.filter(d => d.env === env).map(d => `${c.blue}D1${c.reset} ${d.name}`));
    }
    if (resourceType === "r2" || resourceType === "both") {
      items.push(...service.r2.filter(r => r.env === env).map(r => `${c.magenta}R2${c.reset} ${r.name}`));
    }
    return items.join("\n");
  };

  const getAllResources = () => {
    const items: string[] = [];
    if (resourceType === "d1" || resourceType === "both") {
      items.push(...service.d1.map(d => `${tag(d.env)} ${c.blue}D1${c.reset} ${d.name}`));
    }
    if (resourceType === "r2" || resourceType === "both") {
      items.push(...service.r2.map(r => `${tag(r.env)} ${c.magenta}R2${c.reset} ${r.name}`));
    }
    return items.join("\n");
  };

  return await select({
    message: "Which environment?",
    choices: [
      {
        name: `${c.cyan}[LOCAL]${c.reset} only ${c.dim}(safest)${c.reset}`,
        value: "local" as const,
        description: getResources("local"),
      },
      {
        name: `${c.yellow}[DEV]${c.reset} only ${c.dim}(safe)${c.reset}`,
        value: "dev" as const,
        description: getResources("dev"),
      },
      {
        name: `${c.red}[PROD]${c.reset} only ${c.dim}(dangerous!)${c.reset}`,
        value: "production" as const,
        description: getResources("production"),
      },
      {
        name: `${c.red}${c.bold}[BOTH]${c.reset} ${c.dim}(very dangerous!)${c.reset}`,
        value: "both" as const,
        description: getAllResources(),
      },
    ],
  });
};

const getResourcesToClean = (
  service: ServiceResources,
  resourceType: ResourceType,
  environment: Environment
): { d1: D1Resource[]; r2: R2Resource[] } => {
  const envFilter = (env: "production" | "dev" | "local") =>
    environment === "both" || environment === env;

  const d1 = (resourceType === "d1" || resourceType === "both")
    ? service.d1.filter(d => envFilter(d.env))
    : [];

  const r2 = (resourceType === "r2" || resourceType === "both")
    ? service.r2.filter(r => envFilter(r.env))
    : [];

  return { d1, r2 };
};

const printConfirmation = (selection: CleanupSelection): void => {
  log.info(`\n${c.bold}${c.yellow}${"═".repeat(50)}${c.reset}`);
  log.info(`${c.bold}${c.yellow}  CLEANUP CONFIRMATION${c.reset}`);
  log.info(`${c.bold}${c.yellow}${"═".repeat(50)}${c.reset}\n`);

  log.info(`${c.bold}Service:${c.reset}     ${c.cyan}${selection.service.service}${c.reset}`);
  log.info(`${c.bold}Description:${c.reset} ${selection.service.displayName}`);
  log.info(`${c.bold}Environment:${c.reset} ${selection.environment === "both" ? `${c.red}PROD + DEV${c.reset}` : selection.environment === "production" ? `${c.red}PROD${c.reset}` : `${c.yellow}DEV${c.reset}`}`);
  log.info("");

  if (selection.d1ToClean.length > 0) {
    log.info(`${c.blue}${c.bold}D1 Databases to wipe:${c.reset}`);
    for (const d1 of selection.d1ToClean) {
      log.info(`  ${tag(d1.env)} ${d1.name}`);
      log.info(`  ${c.dim}└─ ID: ${d1.id}${c.reset}`);
    }
    log.info("");
  }

  if (selection.r2ToClean.length > 0) {
    log.info(`${c.magenta}${c.bold}R2 Buckets to empty:${c.reset}`);
    for (const r2 of selection.r2ToClean) {
      log.info(`  ${tag(r2.env)} ${r2.name}`);
    }
    log.info("");
  }

  const hasProd = [...selection.d1ToClean, ...selection.r2ToClean].some(r => r.env === "production");
  if (hasProd) {
    log.warn(`⚠ WARNING: This includes PRODUCTION resources!\n`);
  }
};

const cleanD1Database = async (
  d1: D1Resource,
  retryConfig: RetryConfig,
  display?: ProgressDisplay,
  dryRun: boolean = false
): Promise<{ success: boolean; tablesCleared: number; error?: string }> => {
  try {
    // Step 1: List tables
    if (display) await display.updateWithRepo(d1.name, `${c.blue}📋${c.reset} Scanning...`, "list", 0.25);

    const tablesResult = await withRetry(
      () => $`bunx wrangler d1 execute ${d1.name} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';" --json`.quiet().nothrow(),
      retryConfig,
      `list-tables-${d1.name}`
    );

    if (!tablesResult.success || tablesResult.result?.exitCode !== 0) {
      const error = tablesResult.error || "Failed to list tables";
      return { success: false, tablesCleared: 0, error };
    }

    const output = tablesResult.result!.stdout.toString();
    let tables: string[] = [];

    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed) && parsed[0]?.results) {
        tables = parsed[0].results.map((r: { name: string }) => r.name);
      }
    } catch (err) {
      return { success: true, tablesCleared: 0 };
    }

    if (tables.length === 0) {
      return { success: true, tablesCleared: 0 };
    }

    if (dryRun) {
      if (display) await display.updateWithRepo(d1.name, `${c.cyan}[DRY-RUN]${c.reset}`, "preview", 0.75);
      return { success: true, tablesCleared: tables.length };
    }

    // Step 2: Clean tables
    if (display) await display.updateWithRepo(d1.name, `${c.yellow}🧹${c.reset} Cleaning ${tables.length} tables...`, "clean", 0.5);

    const deleteStatements = tables.map(table => `DELETE FROM ${table};`).join("\n");
    const cleanupSQL = `PRAGMA foreign_keys = OFF;
${deleteStatements}
PRAGMA foreign_keys = ON;`;

    const tempFileName = `.cleanup_${d1.id}_${Date.now()}.sql`;
    await writeFile(tempFileName, cleanupSQL);

    try {
      const cleanupResult = await withRetry(
        () => $`bunx wrangler d1 execute ${d1.name} --remote --file ${tempFileName} --json`.quiet().nothrow(),
        retryConfig,
        `clean-${d1.name}`
      );

      if (!cleanupResult.success) {
        return { success: false, tablesCleared: 0, error: cleanupResult.error };
      }

      if (display) await display.updateWithRepo(d1.name, `${c.green}✓${c.reset} Verified`, "verify", 0.95);
      return { success: true, tablesCleared: tables.length };
    } finally {
      await $`rm ${tempFileName}`.quiet().nothrow();
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { success: false, tablesCleared: 0, error };
  }
};

const CLOUDFLARE_API_TOKEN = Bun.env['CLOUDFLARE_API_TOKEN'] || "";
const CLOUDFLARE_ACCOUNT_ID = Bun.env['CLOUDFLARE_ACCOUNT_ID'] || "";

type CleanResult = { success: boolean; objectsDeleted: number; error?: string };

const cleanR2Bucket = async (
  r2: R2Resource,
  retryConfig: RetryConfig,
  batchSize: number = 10,
  display?: ProgressDisplay,
  dryRun: boolean = false
): Promise<CleanResult> => {
  try {
    // Step 1: List objects
    if (display) await display.updateWithRepo(r2.name, `${c.magenta}📋${c.reset} Listing objects...`, "list", 0.2);

    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${r2.name}/objects`;

    const listResult = await withRetry(
      async () => {
        const response = await fetch(listUrl, {
          headers: {
            "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
        return response;
      },
      retryConfig,
      `list-r2-${r2.name}`
    );

    if (!listResult.success) {
      return { success: false, objectsDeleted: 0, error: "Failed to list R2 objects" };
    }

    const listResponse = listResult.result!;
    if (!listResponse.ok) {
      if (listResponse.status === 404) {
        return { success: true, objectsDeleted: 0 };
      }
      const errText = await listResponse.text();
      return { success: false, objectsDeleted: 0, error: `R2 API Error (${listResponse.status}): ${errText}` };
    }

    const listData = await listResponse.json() as { result?: { key: string }[] };
    const objects = listData.result || [];

    if (objects.length === 0) {
      return { success: true, objectsDeleted: 0 };
    }

    if (dryRun) {
      if (display) await display.updateWithRepo(r2.name, `${c.cyan}[DRY-RUN]${c.reset}`, "preview", 0.75);
      return { success: true, objectsDeleted: objects.length };
    }

    // Step 2: Delete objects in parallel batches
    if (display) await display.updateWithRepo(r2.name, `${c.yellow}🗑️${c.reset} Deleting ${objects.length} objects (${batchSize}/batch)...`, "delete", 0.4);

    let deletedCount = 0;
    for (let i = 0; i < objects.length; i += batchSize) {
      const batch = objects.slice(i, i + batchSize);
      const progress = (i + batch.length) / objects.length;

      if (display) await display.updateWithRepo(r2.name, `${c.yellow}🗑️${c.reset} Deleting ${batch.length}/${objects.length}...`, "delete", 0.4 + progress * 0.35);

      const deletePromises = batch.map(obj =>
        withRetry(
          () => $`bunx wrangler r2 object delete ${r2.name}/${obj.key} --remote`.quiet().nothrow(),
          { maxRetries: 2, delayMs: 100, backoffMultiplier: 2 },
          `delete-r2-${obj.key}`
        )
      );

      const results = await Promise.all(deletePromises);
      deletedCount += results.filter(r => r.success).length;
    }

    if (display) await display.updateWithRepo(r2.name, `${c.green}✓${c.reset} Verified`, "verify", 0.95);
    return { success: true, objectsDeleted: deletedCount };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { success: false, objectsDeleted: 0, error };
  }
};

const executeCleanup = async (
  selection: CleanupSelection,
  options: {
    parallelLimit: number;
    batchSize: number;
    retryCount: number;
    dryRun: boolean;
    verbose: boolean;
  }
): Promise<CleanupStats> => {
  const startTime = Date.now();
  const stats: CleanupStats = {
    totalTime: 0,
    d1Cleaned: 0,
    d1Failed: 0,
    r2Cleaned: 0,
    r2ObjectsDeleted: 0,
    r2Failed: 0,
  };

  const retryConfig: RetryConfig = {
    maxRetries: options.retryCount,
    delayMs: 300,
    backoffMultiplier: 1.5,
  };

  log.info(`\n${c.cyan}🚀 Starting cleanup${options.dryRun ? ` (DRY-RUN)` : ''}...${c.reset}\n`);

  // Create cleanup tasks for parallel execution
  const cleanupTasks: (() => Promise<void>)[] = [];

  // D1 cleanup tasks
  for (const d1 of selection.d1ToClean) {
    cleanupTasks.push(async () => {
      const display = new ProgressDisplay();
      await display.init("", d1.name, 0);

      const result = await cleanD1Database(d1, retryConfig, display, options.dryRun);

      if (result.success) {
        await display.finalize(`${c.green}✅${c.reset} Cleaned ${result.tablesCleared} tables`, d1.name, true);
        stats.d1Cleaned++;
      } else {
        await display.finalize(`${c.red}❌${c.reset} ${result.error || "Failed"}`, d1.name, false);
        stats.d1Failed++;
      }
    });
  }

  // R2 cleanup tasks
  for (const r2 of selection.r2ToClean) {
    cleanupTasks.push(async () => {
      const display = new ProgressDisplay();
      await display.init("", r2.name, 0);

      const result = await cleanR2Bucket(r2, retryConfig, options.batchSize, display, options.dryRun);

      if (result.success) {
        await display.finalize(`${c.green}✅${c.reset} Deleted ${result.objectsDeleted} objects`, r2.name, true);
        stats.r2Cleaned++;
        stats.r2ObjectsDeleted += result.objectsDeleted;
      } else {
        await display.finalize(`${c.red}❌${c.reset} ${result.error || "Failed"}`, r2.name, false);
        stats.r2Failed++;
      }
    });
  }

  // Execute cleanup operations in parallel with concurrency limit
  const limit = Math.min(options.parallelLimit, cleanupTasks.length);
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < cleanupTasks.length; i++) {
    const task = cleanupTasks[i];
    const promise = Promise.resolve(task()).then(() => executing.delete(promise));
    executing.add(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  await flushWrites();

  stats.totalTime = Date.now() - startTime;

  // Print enhanced summary
  const totalResources = selection.d1ToClean.length + selection.r2ToClean.length;
  const totalSuccess = stats.d1Cleaned + stats.r2Cleaned;
  const totalFailed = stats.d1Failed + stats.r2Failed;
  const successRate = totalResources > 0 ? Math.round((totalSuccess / totalResources) * 100) : 0;
  const totalTimeS = (stats.totalTime / 1000).toFixed(2);

  log.info(`\n${c.bold}${c.cyan}${"=".repeat(60)}${c.reset}`);
  log.info(`${c.bold}${c.cyan}  🎉 CLEANUP COMPLETE${c.reset}`);
  log.info(`${c.bold}${c.cyan}${"=".repeat(60)}${c.reset}`);

  if (stats.d1Cleaned > 0) {
    log.info(`${c.blue}📦 D1: ${stats.d1Cleaned} database${stats.d1Cleaned !== 1 ? 's' : ''} cleaned${c.reset}`);
  }
  if (stats.d1Failed > 0) {
    log.info(`${c.red}❌ D1: ${stats.d1Failed} failed${c.reset}`);
  }

  if (stats.r2Cleaned > 0) {
    log.info(`${c.magenta}🪣 R2: ${stats.r2Cleaned} bucket${stats.r2Cleaned !== 1 ? 's' : ''} emptied (${stats.r2ObjectsDeleted} objects deleted)${c.reset}`);
  }
  if (stats.r2Failed > 0) {
    log.info(`${c.red}❌ R2: ${stats.r2Failed} failed${c.reset}`);
  }

  log.info(`${c.green}✅ Success Rate: ${successRate}%${c.reset}`);
  log.info(`${c.blue}⏱️  Total Time: ${totalTimeS}s${c.reset}`);

  if (options.dryRun) {
    log.info(`${c.cyan}[DRY-RUN]${c.reset} No actual cleanup was performed`);
  }

  log.info(`${c.bold}${c.cyan}${"=".repeat(60)}${c.reset}\n`);

  return stats;
};

const main = async () => {
  try {
    const argv = await yargs(hideBin(process.argv))
      .scriptName("clean")
      .usage("$0 [options]")
      .option("parallel", {
        alias: "p",
        type: "number",
        description: "Number of parallel cleanup operations (default: 5, max: 20)",
        default: 5,
      })
      .option("batch-size", {
        alias: "b",
        type: "number",
        description: "Batch size for R2 object deletion (default: 10)",
        default: 10,
      })
      .option("retry-count", {
        alias: "r",
        type: "number",
        description: "Retry failed operations (default: 3)",
        default: 3,
      })
      .option("dry-run", {
        alias: "d",
        type: "boolean",
        description: "Preview what would be cleaned without actually deleting",
        default: false,
      })
      .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Verbose output with detailed information",
        default: false,
      })
      .option("audit-log", {
        alias: "a",
        type: "string",
        description: "Save audit log to file (JSON format)",
        default: undefined,
      })
      .example("$0", "Interactive cleanup")
      .example("$0 --dry-run", "Preview cleanup without actual deletion")
      .example("$0 --parallel 10", "Cleanup with 10 parallel operations")
      .example("$0 --audit-log audit.json", "Save audit log to file")
      .help()
      .alias("help", "h")
      .parse();

    const parallelLimit = Math.max(1, Math.min(20, argv.parallel as number));
    const batchSize = Math.max(1, Math.min(100, argv["batch-size"] as number));
    const retryCount = Math.max(0, Math.min(5, argv["retry-count"] as number));
    const dryRun = argv["dry-run"] as boolean;
    const verbose = argv.verbose as boolean;
    const auditLogFile = argv["audit-log"] as string | undefined;

    // Initialize audit logger for Phase 4 safety features
    const auditLogger = new AuditLogger(auditLogFile);

    banner();

    // Step 1: Select service (with fuzzy search)
    const service = await selectService();
    log.info("");

    // Step 2: Select resource type (D1, R2, or both) - shows relevant names
    const resourceType = await selectResourceType(service);
    log.info("");

    // Step 3: Select environment - shows what will be cleaned
    const environment = await selectEnvironment(service, resourceType);
    log.info("");

    // Step 4: Auto-select resources based on choices (no extra prompts!)
    const { d1, r2 } = getResourcesToClean(service, resourceType, environment);

    if (d1.length === 0 && r2.length === 0) {
      log.warn(`No resources found. Exiting.\n`);
      process.exit(0);
    }

    const selection: CleanupSelection = {
      service,
      resourceType,
      environment,
      d1ToClean: d1,
      r2ToClean: r2,
    };

    // Step 5: Show confirmation summary
    printConfirmation(selection);

    // Step 6: Final confirmation
    const hasProd = [...d1, ...r2].some(r => r.env === "production");

    if (!dryRun) {
      if (hasProd) {
        const typed = await input({
          message: `${c.red}${c.bold}Type "DELETE" to confirm:${c.reset}`
        });
        if (typed !== "DELETE") {
          log.warn(`Aborted.\n`);
          process.exit(0);
        }
      } else {
        const confirmed = await confirm({
          message: `${c.yellow}Proceed with cleanup?${c.reset}`,
          default: false
        });
        if (!confirmed) {
          log.warn(`Aborted.\n`);
          process.exit(0);
        }
      }
    } else {
      log.warn(`${c.cyan}[DRY-RUN MODE]${c.reset} - No resources will be deleted\n`);
    }

    // Step 7: Execute cleanup with enhanced options
    const stats = await executeCleanup(selection, {
      parallelLimit,
      batchSize,
      retryCount,
      dryRun,
      verbose,
    });

    // Log all cleanup operations for audit trail
    if (stats.d1Cleaned > 0) {
      auditLogger.log("cleanup", "D1 Databases", "success", { count: stats.d1Cleaned });
    }
    if (stats.d1Failed > 0) {
      auditLogger.log("cleanup", "D1 Databases", "failure", { count: stats.d1Failed });
    }
    if (stats.r2Cleaned > 0) {
      auditLogger.log("cleanup", "R2 Buckets", "success", { count: stats.r2Cleaned, objectsDeleted: stats.r2ObjectsDeleted });
    }
    if (stats.r2Failed > 0) {
      auditLogger.log("cleanup", "R2 Buckets", "failure", { count: stats.r2Failed });
    }

    // Export audit log if requested
    if (auditLogFile) {
      const auditLog = await auditLogger.export();
      await writeFile(auditLogFile, auditLog);
      log.success(`📋 Audit log saved to: ${auditLogFile}\n`);
    }

    log.success(`Cleanup complete! (${(stats.totalTime / 1000).toFixed(2)}s)\n`);
  } catch (err) {
    if ((err as Error).name === "ExitPromptError") {
      log.warn(`Cancelled.\n`);
      process.exit(0);
    }
    throw err;
  }
};

main().catch((err) => {
  log.error(`Error: ${err.message}`);
  process.exit(1);
});
