#!/usr/bin/env bun

import { $ } from "bun";
import { writeFile, unlink } from "fs/promises";
import { search, select, confirm, input, checkbox } from "@inquirer/prompts";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { SERVICES, type ServiceResources, type D1Resource, type R2Resource } from "../resources.config";
import { colors as c, log, printSummary, symbols } from "./utils";

type ResourceType = "d1" | "r2" | "both";
type Environment = "production" | "dev" | "local" | "both";

interface TableInfo {
  name: string;
  count: number;
}

interface D1CleanupConfig {
  resource: D1Resource;
  tables: string[];
  allTables: boolean;
}

interface CleanupSelection {
  service: ServiceResources;
  resourceType: ResourceType;
  environment: Environment;
  d1ToClean: D1Resource[];
  r2ToClean: R2Resource[];
  d1Configs?: D1CleanupConfig[];
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
        name: `${c.red}${c.bold}[ALL ENVS]${c.reset} ${c.dim}(very dangerous!)${c.reset}`,
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
  const envLabel = selection.environment === "both"
    ? `${c.red}ALL ENVS${c.reset}`
    : selection.environment === "production"
      ? `${c.red}PROD${c.reset}`
      : selection.environment === "dev"
        ? `${c.yellow}DEV${c.reset}`
        : `${c.cyan}LOCAL${c.reset}`;
  log.info(`${c.bold}Environment:${c.reset} ${envLabel}`);
  log.info("");

  if (selection.d1Configs && selection.d1Configs.length > 0) {
    log.info(`${c.blue}${c.bold}D1 Tables to delete:${c.reset}`);
    for (const config of selection.d1Configs) {
      log.info(`  ${tag(config.resource.env)} ${config.resource.name}`);
      log.info(`  ${c.dim}└─ ID: ${config.resource.id}${c.reset}`);
      log.info(`  ${c.dim}└─ Tables: ${config.tables.join(", ")}${c.reset}`);
    }
    log.info("");
  } else if (selection.d1ToClean.length > 0) {
    log.info(`${c.blue}${c.bold}D1 Databases to wipe (all tables):${c.reset}`);
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

  const resourcesList = selection.d1Configs
    ? selection.d1Configs.map(c => c.resource)
    : selection.d1ToClean;
  const hasProd = [...resourcesList, ...selection.r2ToClean].some(r => r.env === "production");
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

const getTableCounts = async (d1Name: string, tables: string[]): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();

  if (tables.length === 0) return counts;

  // Query tables individually to avoid D1's compound SELECT limit
  for (const table of tables) {
    const countQuery = `SELECT COUNT(*) as cnt FROM ${table}`;
    const countResult = await $`bunx wrangler d1 execute ${d1Name} --remote --command ${countQuery} --json`.quiet().nothrow();

    if (countResult.exitCode !== 0) {
      log.error(`Failed to get count for table ${table}: ${countResult.stderr.toString() || countResult.stdout.toString()}`);
      counts.set(table, 0);
      continue;
    }

    try {
      const parsed = JSON.parse(countResult.stdout.toString());
      if (Array.isArray(parsed) && parsed[0]?.results && parsed[0].results[0]) {
        counts.set(table, parsed[0].results[0].cnt);
      } else {
        counts.set(table, 0);
      }
    } catch (err) {
      log.error(`Failed to parse count for table ${table}: ${(err as Error).message}`);
      counts.set(table, 0);
    }
  }

  return counts;
};

const selectTablesToClean = async (d1: D1Resource): Promise<string[] | null> => {
  log.info(`\n${c.bold}Fetching tables from ${c.blue}${d1.name}${c.reset}${c.bold}...${c.reset}`);

  const tables = await queryDatabaseTables(d1.name);

  if (tables === null) {
    log.error(`Failed to fetch tables from ${d1.name}`);
    return null;
  }

  if (tables.length === 0) {
    log.info(`${c.dim}No tables found in ${d1.name}${c.reset}`);
    return [];
  }

  log.info(`${c.dim}Fetching record counts...${c.reset}`);
  const counts = await getTableCounts(d1.name, tables);

  const totalRecords = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

  const choices = tables.map(table => {
    const count = counts.get(table) ?? 0;
    return {
      name: `${table}`,
      value: table,
      description: `${c.dim}${count.toLocaleString()} record${count !== 1 ? 's' : ''}${c.reset}`,
      checked: false,
    };
  });

  choices.unshift({
    name: `${c.cyan}[Select All]${c.reset}`,
    value: "__SELECT_ALL__",
    description: `${c.dim}${tables.length} tables, ${totalRecords.toLocaleString()} total records${c.reset}`,
    checked: false,
  });

  const selected = await checkbox({
    message: `${c.bold}Select tables to delete from ${tag(d1.env)} ${d1.name}:${c.reset}\n  ${c.dim}(Use ${c.cyan}Space${c.reset}${c.dim} to select, ${c.cyan}Enter${c.reset}${c.dim} to confirm)${c.reset}`,
    choices,
    pageSize: 15,
    validate: (answer: string[]) => {
      if (answer.length === 0) {
        return 'Please select at least one table, or press Ctrl+C to cancel';
      }
      return true;
    },
  });

  if (selected.includes("__SELECT_ALL__")) {
    return tables;
  }

  return selected;
};

const verifyAllTablesEmpty = async (d1Name: string, tables: string[]): Promise<boolean> => {
  if (tables.length === 0) return true;

  const unionQuery = tables
    .map(t => `SELECT '${t}' as tbl, COUNT(*) as cnt FROM ${t}`)
    .join(" UNION ALL ");

  const countResult = await $`bunx wrangler d1 execute ${d1Name} --remote --command ${unionQuery} --json`.quiet().nothrow();

  if (countResult.exitCode !== 0) return false;

  try {
    const parsed = JSON.parse(countResult.stdout.toString());
    if (Array.isArray(parsed) && parsed[0]?.results) {
      for (const row of parsed[0].results) {
        if (row.cnt > 0) {
          log.error(`Table ${row.tbl} still has ${row.cnt} rows after cleanup`);
          return false;
        }
      }
    }
  } catch {
    return false;
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
    await unlink(tempFileName).catch(() => {});
  }
};

const cleanD1Database = async (d1: D1Resource, tablesToClean?: string[]): Promise<boolean> => {
  try {
    let tables: string[];

    if (tablesToClean !== undefined) {
      tables = tablesToClean;
    } else {
      const allTables = await queryDatabaseTables(d1.name);
      if (allTables === null) {
        return false;
      }
      tables = allTables;
    }

    if (tables.length === 0) {
      return true;
    }

    return await executeDatabaseCleanup(d1.name, d1.id, tables);
  } catch {
    return false;
  }
};

const CLOUDFLARE_ACCOUNT_ID = Bun.env['CLOUDFLARE_ACCOUNT_ID'] || "";
const R2_ACCESS_KEY_ID = Bun.env['R2_ACCESS_KEY_ID'] || "";
const R2_SECRET_ACCESS_KEY = Bun.env['R2_SECRET_ACCESS_KEY'] || "";

type CleanResult = { success: boolean; count?: number };

const getR2Client = (): S3Client => {
  return new S3Client({
    region: "auto",
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
};

const cleanR2Bucket = async (r2: R2Resource): Promise<CleanResult> => {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CLOUDFLARE_ACCOUNT_ID) {
    log.error("Missing R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or CLOUDFLARE_ACCOUNT_ID env vars");
    return { success: false };
  }

  try {
    const client = getR2Client();
    let totalDeleted = 0;
    let continuationToken: string | undefined;

    do {
      const listResponse = await client.send(new ListObjectsV2Command({
        Bucket: r2.name,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }));

      const objects = listResponse.Contents || [];
      if (objects.length === 0) break;

      const keysToDelete = objects
        .map(obj => obj.Key)
        .filter((key): key is string => !!key);

      if (keysToDelete.length > 0) {
        await client.send(new DeleteObjectsCommand({
          Bucket: r2.name,
          Delete: {
            Objects: keysToDelete.map(Key => ({ Key })),
            Quiet: true,
          },
        }));
      }

      totalDeleted += keysToDelete.length;
      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    return { success: true, count: totalDeleted };
  } catch (err) {
    log.error(`R2 error: ${(err as Error).message}`);
    return { success: false };
  }
};

const executeCleanup = async (selection: CleanupSelection): Promise<{ success: string[]; failed: string[] }> => {
  log.info(`\nStarting cleanup...\n`);

  const success: string[] = [];
  const failed: string[] = [];

  if (selection.d1Configs && selection.d1Configs.length > 0) {
    for (const config of selection.d1Configs) {
      const tableInfo = config.allTables
        ? `${c.dim}all tables${c.reset}`
        : `${c.dim}${config.tables.length} selected table${config.tables.length !== 1 ? 's' : ''}${c.reset}`;

      process.stdout.write(`${symbols.arrow} ${c.bold}${config.resource.name}${c.reset} ${tableInfo} `);

      const isSuccess = await cleanD1Database(config.resource, config.tables);
      if (isSuccess) {
        console.log(`${c.green}[OK]${c.reset}`);
        success.push(config.resource.name);
      } else {
        console.log(`${c.red}[FAIL]${c.reset}`);
        failed.push(config.resource.name);
      }
    }
  } else {
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
  }

  for (const r2 of selection.r2ToClean) {
    process.stdout.write(`${symbols.arrow} ${c.bold}${r2.name}${c.reset} `);
    const result = await cleanR2Bucket(r2);
    if (result.success) {
      console.log(`${c.green}[OK]${c.reset} ${c.dim}(${result.count ?? 0} objects deleted)${c.reset}`);
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

  let d1Configs: D1CleanupConfig[] | undefined;

  if (d1.length > 0) {
    console.log();
    const cleanupMode = await select({
      message: "D1 cleanup mode:",
      choices: [
        {
          name: `${c.cyan}Select specific tables${c.reset} ${c.dim}(recommended)${c.reset}`,
          value: "selective" as const,
          description: "Choose which tables to delete from each database",
        },
        {
          name: `${c.red}Delete all tables${c.reset}`,
          value: "all" as const,
          description: "Delete all data from all tables in selected databases",
        },
      ],
    });

    if (cleanupMode === "selective") {
      d1Configs = [];

      for (const d1Resource of d1) {
        const selectedTables = await selectTablesToClean(d1Resource);

        if (selectedTables === null) {
          log.error(`Skipping ${d1Resource.name} due to errors`);
          continue;
        }

        if (selectedTables.length > 0) {
          d1Configs.push({
            resource: d1Resource,
            tables: selectedTables,
            allTables: false,
          });
        }
      }

      if (d1Configs.length === 0 && r2.length === 0) {
        log.warn(`No resources selected for cleanup. Exiting.\n`);
        process.exit(0);
      }
    }
  }

  return {
    service,
    resourceType,
    environment,
    d1ToClean: d1,
    r2ToClean: r2,
    d1Configs,
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
