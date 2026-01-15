#!/usr/bin/env bun

import { $ } from "bun";
import { writeFile } from "fs/promises";
import { search, select, confirm, input } from "@inquirer/prompts";
import { SERVICES, type ServiceResources, type D1Resource, type R2Resource } from "../resources.config";
import { colors as c, log, printSummary, symbols } from "./utils";

type ResourceType = "d1" | "r2" | "both";
type Environment = "production" | "dev" | "local" | "both";

interface CleanupSelection {
  service: ServiceResources;
  resourceType: ResourceType;
  environment: Environment;
  d1ToClean: D1Resource[];
  r2ToClean: R2Resource[];
}

const printCleanBanner = () => {
  console.log(`
${c.cyan}${c.bold}  _____ _      ______          _   _ _    _ _____
${c.cyan} / ____| |    |  ____|   /\\   | \\ | | |  | |  __ \\
${c.cyan}| |    | |    | |__     /  \\  |  \\| | |  | | |__) |
${c.yellow}| |    | |    |  __|   / /\\ \\ | . \` | |  | |  ___/
${c.yellow}| |____| |____| |____ / ____ \\| |\\  | |__| | |
${c.green} \\_____|______|______/_/    \\_\\_| \\_|\\____/|_|${c.reset}
${c.bold}${c.red}  CLEAN${c.reset}
${c.dim}  Resource Cleanup Tool${c.reset}
  `);
};

const printCleanHeader = () => {
  console.log(`\n${c.bold}${c.cyan}${"=".repeat(50)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  Clean${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"=".repeat(50)}${c.reset}\n`);
};

const tag = (env: "production" | "dev" | "local"): string => {
  if (env === "production") return `${c.red}[PROD]${c.reset}`;
  if (env === "dev") return `${c.yellow}[DEV]${c.reset}`;
  return `${c.cyan}[LOCAL]${c.reset}`;
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

const queryDatabaseTables = async (d1Name: string): Promise<string[] | null> => {
  const tablesResult = await $`bunx wrangler d1 execute ${d1Name} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';" --json`.quiet().nothrow();

  if (tablesResult.exitCode !== 0) {
    log.error(`D1 Error: ${tablesResult.stderr.toString() || tablesResult.stdout.toString()}`);
    return null;
  }

  try {
    const parsed = JSON.parse(tablesResult.stdout.toString());
    if (Array.isArray(parsed) && parsed[0]?.results) {
      return parsed[0].results.map((r: { name: string }) => r.name);
    }
  } catch {
    return [];
  }

  return [];
};

const verifyAllTablesEmpty = async (d1Name: string, tables: string[]): Promise<boolean> => {
  for (const table of tables) {
    const countResult = await $`bunx wrangler d1 execute ${d1Name} --remote --command "SELECT COUNT(*) as cnt FROM ${table};" --json`.quiet().nothrow();

    if (countResult.exitCode === 0) {
      try {
        const parsed = JSON.parse(countResult.stdout.toString());
        if (Array.isArray(parsed) && parsed[0]?.results?.[0]?.cnt > 0) {
          log.error(`Table ${table} still has ${parsed[0].results[0].cnt} rows after cleanup`);
          return false;
        }
      } catch {
        return false;
      }
    }
  }

  return true;
};

const executeDatabaseCleanup = async (d1Name: string, d1Id: string, tables: string[]): Promise<boolean> => {
  const deleteStatements = tables.map(table => `DELETE FROM ${table};`).join("\n");
  const cleanupSQL = `PRAGMA foreign_keys = OFF;
${deleteStatements}
PRAGMA foreign_keys = ON;`;

  const tempFileName = `.cleanup_${d1Id}_${Date.now()}.sql`;
  await writeFile(tempFileName, cleanupSQL);

  try {
    const cleanupResult = await $`bunx wrangler d1 execute ${d1Name} --remote --file ${tempFileName} --json`.quiet().nothrow();

    if (cleanupResult.exitCode !== 0) {
      const errorOutput = cleanupResult.stderr.toString() || cleanupResult.stdout.toString();
      log.error(`Failed to clean database: ${errorOutput}`);
      return false;
    }

    return await verifyAllTablesEmpty(d1Name, tables);
  } finally {
    await $`rm ${tempFileName}`.quiet().nothrow();
  }
};

const cleanD1Database = async (d1: D1Resource): Promise<boolean> => {
  try {
    const tables = await queryDatabaseTables(d1.name);

    if (tables === null) {
      return false;
    }

    if (tables.length === 0) {
      return true;
    }

    return await executeDatabaseCleanup(d1.name, d1.id, tables);
  } catch {
    return false;
  }
};

const CLOUDFLARE_API_TOKEN = Bun.env['CLOUDFLARE_API_TOKEN'] || "";
const CLOUDFLARE_ACCOUNT_ID = Bun.env['CLOUDFLARE_ACCOUNT_ID'] || "";

type CleanResult = { success: boolean; count?: number };

const cleanR2Bucket = async (r2: R2Resource): Promise<CleanResult> => {
  try {
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${r2.name}/objects`;
    const listResponse = await fetch(listUrl, {
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!listResponse.ok) {
      if (listResponse.status === 404) {
        return { success: true, count: 0 };
      }
      const errText = await listResponse.text();
      log.error(`R2 API Error (${listResponse.status}): ${errText}`);
      return { success: false };
    }

    const listData = await listResponse.json() as { result?: { key: string }[] };
    const objects = listData.result || [];

    if (objects.length === 0) {
      return { success: true, count: 0 };
    }

    for (const obj of objects) {
      await $`bunx wrangler r2 object delete ${r2.name}/${obj.key} --remote`.quiet().nothrow();
    }

    return { success: true, count: objects.length };
  } catch {
    return { success: false };
  }
};

const executeCleanup = async (selection: CleanupSelection): Promise<{ success: string[]; failed: string[] }> => {
  log.info(`\nStarting cleanup...\n`);

  const success: string[] = [];
  const failed: string[] = [];

  for (const d1 of selection.d1ToClean) {
    process.stdout.write(`${symbols.arrow} ${c.bold}${d1.name}${c.reset} `);
    const isSuccess = await cleanD1Database(d1);
    if (isSuccess) {
      console.log(`${c.green}[OK]${c.reset}`);
      success.push(d1.name);
    } else {
      console.log(`${c.red}[FAIL]${c.reset}`);
      failed.push(d1.name);
    }
  }

  for (const r2 of selection.r2ToClean) {
    process.stdout.write(`${symbols.arrow} ${c.bold}${r2.name}${c.reset} `);
    const result = await cleanR2Bucket(r2);
    if (result.success) {
      console.log(`${c.green}[OK]${c.reset}`);
      success.push(r2.name);
    } else {
      console.log(`${c.red}[FAIL]${c.reset}`);
      failed.push(r2.name);
    }
  }

  return { success, failed };
};

const getConfirmationFromUser = async (hasProd: boolean): Promise<boolean> => {
  if (hasProd) {
    const typed = await input({
      message: `${c.red}${c.bold}Type "DELETE" to confirm:${c.reset}`
    });
    return typed === "DELETE";
  }

  return await confirm({
    message: `${c.yellow}Proceed with cleanup?${c.reset}`,
    default: false
  });
};

const selectAndValidateResources = async (
  service: ServiceResources,
  resourceType: ResourceType,
  environment: Environment
): Promise<CleanupSelection> => {
  const { d1, r2 } = getResourcesToClean(service, resourceType, environment);

  if (d1.length === 0 && r2.length === 0) {
    log.warn(`No resources found. Exiting.\n`);
    process.exit(0);
  }

  return {
    service,
    resourceType,
    environment,
    d1ToClean: d1,
    r2ToClean: r2,
  };
};

const main = async () => {
  try {
    printCleanBanner();
    printCleanHeader();

    const service = await selectService();
    console.log();

    const resourceType = await selectResourceType(service);
    console.log();

    const environment = await selectEnvironment(service, resourceType);
    console.log();

    const selection = await selectAndValidateResources(service, resourceType, environment);
    printConfirmation(selection);

    const hasProd = [...selection.d1ToClean, ...selection.r2ToClean].some(r => r.env === "production");
    const isConfirmed = await getConfirmationFromUser(hasProd);

    if (!isConfirmed) {
      log.warn(`Aborted.\n`);
      process.exit(0);
    }

    const cleanupResult = await executeCleanup(selection);
    printSummary({ success: cleanupResult.success, failed: cleanupResult.failed, skipped: [] });
    log.success(`Cleanup complete!\n`);
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
