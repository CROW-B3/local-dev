#!/usr/bin/env bun

import { $ } from "bun";
import { search, select, checkbox, confirm } from "@inquirer/prompts";
import { SERVICES, type ServiceResources, type D1Resource, type R2Resource } from "../resources.config";
import { colors, log, printHeader } from "./utils";

type ResourceType = "d1" | "r2" | "both";
type Environment = "production" | "dev" | "both";

interface CleanupSelection {
  service: ServiceResources;
  resourceType: ResourceType;
  environment: Environment;
  d1ToClean: D1Resource[];
  r2ToClean: R2Resource[];
}

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
};

const banner = () => {
  console.clear();
  console.log(`
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

const formatEnvBadge = (env: "production" | "dev"): string => {
  return env === "production"
    ? `${c.bgRed}${c.bold} PROD ${c.reset}`
    : `${c.bgYellow}${c.bold} DEV ${c.reset}`;
};

const selectService = async (): Promise<ServiceResources> => {
  const serviceChoices = SERVICES.map(s => ({
    name: `${s.service}`,
    value: s,
    description: s.displayName,
  }));

  return await search({
    message: `${c.cyan}Select service to clean:${c.reset}`,
    source: async (input) => {
      if (!input) return serviceChoices;
      const lower = input.toLowerCase();
      return serviceChoices.filter(
        c => c.name.toLowerCase().includes(lower) ||
             c.description.toLowerCase().includes(lower)
      );
    },
  });
};

const selectResourceType = async (): Promise<ResourceType> => {
  return await select({
    message: `${c.cyan}What to clean?${c.reset}`,
    choices: [
      { name: `${c.blue}D1${c.reset} Database only`, value: "d1" as const },
      { name: `${c.magenta}R2${c.reset} Bucket only`, value: "r2" as const },
      { name: `${c.yellow}Both${c.reset} D1 + R2`, value: "both" as const },
    ],
  });
};

const selectEnvironment = async (): Promise<Environment> => {
  return await select({
    message: `${c.cyan}Which environment?${c.reset}`,
    choices: [
      { name: `${c.yellow}Dev${c.reset} only (safe)`, value: "dev" as const },
      { name: `${c.red}Production${c.reset} only ${c.dim}(dangerous!)${c.reset}`, value: "production" as const },
      { name: `${c.red}${c.bold}Both${c.reset} ${c.dim}(very dangerous!)${c.reset}`, value: "both" as const },
    ],
  });
};

const selectSpecificResources = async (
  service: ServiceResources,
  resourceType: ResourceType,
  environment: Environment
): Promise<{ d1: D1Resource[]; r2: R2Resource[] }> => {
  const result: { d1: D1Resource[]; r2: R2Resource[] } = { d1: [], r2: [] };

  const envFilter = (env: "production" | "dev") =>
    environment === "both" || environment === env;

  if (resourceType === "d1" || resourceType === "both") {
    const d1Choices = service.d1
      .filter(d => envFilter(d.env))
      .map(d => ({
        name: `${formatEnvBadge(d.env)} ${d.name}`,
        value: d,
        checked: true,
      }));

    if (d1Choices.length > 0) {
      result.d1 = await checkbox({
        message: `${c.blue}Select D1 databases to clean:${c.reset}`,
        choices: d1Choices,
      });
    }
  }

  if (resourceType === "r2" || resourceType === "both") {
    const r2Choices = service.r2
      .filter(r => envFilter(r.env))
      .map(r => ({
        name: `${formatEnvBadge(r.env)} ${r.name}`,
        value: r,
        checked: true,
      }));

    if (r2Choices.length > 0) {
      result.r2 = await checkbox({
        message: `${c.magenta}Select R2 buckets to clean:${c.reset}`,
        choices: r2Choices,
      });
    }
  }

  return result;
};

const printConfirmation = (selection: CleanupSelection): void => {
  console.log(`\n${c.bold}${c.yellow}${"=".repeat(50)}${c.reset}`);
  console.log(`${c.bold}${c.yellow}  CLEANUP CONFIRMATION${c.reset}`);
  console.log(`${c.bold}${c.yellow}${"=".repeat(50)}${c.reset}\n`);

  console.log(`${c.bold}Service:${c.reset} ${c.cyan}${selection.service.service}${c.reset}`);
  console.log(`${c.bold}Display:${c.reset} ${selection.service.displayName}\n`);

  if (selection.d1ToClean.length > 0) {
    console.log(`${c.blue}${c.bold}D1 Databases to wipe:${c.reset}`);
    for (const d1 of selection.d1ToClean) {
      console.log(`  ${formatEnvBadge(d1.env)} ${d1.name}`);
      console.log(`  ${c.dim}ID: ${d1.id}${c.reset}`);
    }
    console.log();
  }

  if (selection.r2ToClean.length > 0) {
    console.log(`${c.magenta}${c.bold}R2 Buckets to empty:${c.reset}`);
    for (const r2 of selection.r2ToClean) {
      console.log(`  ${formatEnvBadge(r2.env)} ${r2.name}`);
    }
    console.log();
  }

  const hasProd = [...selection.d1ToClean, ...selection.r2ToClean].some(r => r.env === "production");
  if (hasProd) {
    console.log(`${c.bgRed}${c.bold} WARNING: This includes PRODUCTION resources! ${c.reset}\n`);
  }
};

const cleanD1Database = async (d1: D1Resource): Promise<boolean> => {
  try {
    // First, get all table names
    const tablesResult = await $`npx wrangler d1 execute ${d1.name} --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';" --json`.quiet().nothrow();

    if (tablesResult.exitCode !== 0) {
      return false;
    }

    const output = tablesResult.stdout.toString();
    let tables: string[] = [];

    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed) && parsed[0]?.results) {
        tables = parsed[0].results.map((r: { name: string }) => r.name);
      }
    } catch {
      return true; // No tables or empty database
    }

    if (tables.length === 0) {
      return true; // Already clean
    }

    // Drop each table
    for (const table of tables) {
      const dropResult = await $`npx wrangler d1 execute ${d1.name} --command "DROP TABLE IF EXISTS ${table};" --json`.quiet().nothrow();
      if (dropResult.exitCode !== 0) {
        log.warn(`Failed to drop table: ${table}`);
      }
    }

    return true;
  } catch (err) {
    return false;
  }
};

const cleanR2Bucket = async (r2: R2Resource): Promise<boolean> => {
  try {
    // List all objects in the bucket
    const listResult = await $`npx wrangler r2 object list ${r2.name} --json`.quiet().nothrow();

    if (listResult.exitCode !== 0) {
      return true; // Bucket might be empty or not exist
    }

    const output = listResult.stdout.toString();
    let objects: { key: string }[] = [];

    try {
      const parsed = JSON.parse(output);
      objects = parsed.objects || [];
    } catch {
      return true; // Empty or no objects
    }

    if (objects.length === 0) {
      return true; // Already clean
    }

    // Delete each object
    for (const obj of objects) {
      await $`npx wrangler r2 object delete ${r2.name}/${obj.key}`.quiet().nothrow();
    }

    return true;
  } catch {
    return false;
  }
};

const executeCleanup = async (selection: CleanupSelection): Promise<void> => {
  console.log(`\n${c.bold}Starting cleanup...${c.reset}\n`);

  let successCount = 0;
  let failCount = 0;

  // Clean D1 databases
  for (const d1 of selection.d1ToClean) {
    process.stdout.write(`${c.blue}[D1]${c.reset} ${d1.name} ... `);
    const success = await cleanD1Database(d1);
    if (success) {
      console.log(`${c.green}CLEANED${c.reset}`);
      successCount++;
    } else {
      console.log(`${c.red}FAILED${c.reset}`);
      failCount++;
    }
  }

  // Clean R2 buckets
  for (const r2 of selection.r2ToClean) {
    process.stdout.write(`${c.magenta}[R2]${c.reset} ${r2.name} ... `);
    const success = await cleanR2Bucket(r2);
    if (success) {
      console.log(`${c.green}CLEANED${c.reset}`);
      successCount++;
    } else {
      console.log(`${c.red}FAILED${c.reset}`);
      failCount++;
    }
  }

  // Summary
  console.log(`\n${c.bold}${"─".repeat(40)}${c.reset}`);
  console.log(`${c.green}Success: ${successCount}${c.reset} | ${c.red}Failed: ${failCount}${c.reset}`);
  console.log(`${c.bold}${"─".repeat(40)}${c.reset}\n`);
};

const main = async () => {
  try {
    banner();

    // Step 1: Select service
    const service = await selectService();
    console.log();

    // Step 2: Select resource type (D1, R2, or both)
    const resourceType = await selectResourceType();
    console.log();

    // Step 3: Select environment
    const environment = await selectEnvironment();
    console.log();

    // Step 4: Select specific resources
    const { d1, r2 } = await selectSpecificResources(service, resourceType, environment);

    if (d1.length === 0 && r2.length === 0) {
      console.log(`\n${c.yellow}No resources selected. Exiting.${c.reset}\n`);
      process.exit(0);
    }

    const selection: CleanupSelection = {
      service,
      resourceType,
      environment,
      d1ToClean: d1,
      r2ToClean: r2,
    };

    // Step 5: Show confirmation
    printConfirmation(selection);

    // Step 6: Final confirmation
    const hasProd = [...d1, ...r2].some(r => r.env === "production");
    const confirmMessage = hasProd
      ? `${c.red}${c.bold}Type "DELETE PRODUCTION" to confirm:${c.reset}`
      : `${c.yellow}Proceed with cleanup?${c.reset}`;

    if (hasProd) {
      const { input } = await import("@inquirer/prompts");
      const typed = await input({ message: confirmMessage });
      if (typed !== "DELETE PRODUCTION") {
        console.log(`\n${c.yellow}Aborted.${c.reset}\n`);
        process.exit(0);
      }
    } else {
      const confirmed = await confirm({ message: confirmMessage, default: false });
      if (!confirmed) {
        console.log(`\n${c.yellow}Aborted.${c.reset}\n`);
        process.exit(0);
      }
    }

    // Step 7: Execute cleanup
    await executeCleanup(selection);

    console.log(`${c.green}${c.bold}Cleanup complete!${c.reset}\n`);
  } catch (err) {
    if ((err as Error).name === "ExitPromptError") {
      console.log(`\n${c.yellow}Cancelled.${c.reset}\n`);
      process.exit(0);
    }
    throw err;
  }
};

main().catch((err) => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
