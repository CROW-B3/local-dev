#!/usr/bin/env bun

import { $ } from "bun";
import { search, select, confirm, input } from "@inquirer/prompts";
import { SERVICES, type ServiceResources, type D1Resource, type R2Resource } from "../resources.config";
import { colors as c } from "./utils";

type ResourceType = "d1" | "r2" | "both";
type Environment = "production" | "dev" | "both";

interface CleanupSelection {
  service: ServiceResources;
  resourceType: ResourceType;
  environment: Environment;
  d1ToClean: D1Resource[];
  r2ToClean: R2Resource[];
}

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

const tag = (env: "production" | "dev"): string => {
  return env === "production"
    ? `${c.red}[PROD]${c.reset}`
    : `${c.yellow}[DEV]${c.reset}`;
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
  const getResources = (env: "production" | "dev") => {
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
  const envFilter = (env: "production" | "dev") =>
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
  console.log(`\n${c.bold}${c.yellow}${"═".repeat(50)}${c.reset}`);
  console.log(`${c.bold}${c.yellow}  CLEANUP CONFIRMATION${c.reset}`);
  console.log(`${c.bold}${c.yellow}${"═".repeat(50)}${c.reset}\n`);

  console.log(`${c.bold}Service:${c.reset}     ${c.cyan}${selection.service.service}${c.reset}`);
  console.log(`${c.bold}Description:${c.reset} ${selection.service.displayName}`);
  console.log(`${c.bold}Environment:${c.reset} ${selection.environment === "both" ? `${c.red}PROD + DEV${c.reset}` : selection.environment === "production" ? `${c.red}PROD${c.reset}` : `${c.yellow}DEV${c.reset}`}`);
  console.log();

  if (selection.d1ToClean.length > 0) {
    console.log(`${c.blue}${c.bold}D1 Databases to wipe:${c.reset}`);
    for (const d1 of selection.d1ToClean) {
      console.log(`  ${tag(d1.env)} ${d1.name}`);
      console.log(`  ${c.dim}└─ ID: ${d1.id}${c.reset}`);
    }
    console.log();
  }

  if (selection.r2ToClean.length > 0) {
    console.log(`${c.magenta}${c.bold}R2 Buckets to empty:${c.reset}`);
    for (const r2 of selection.r2ToClean) {
      console.log(`  ${tag(r2.env)} ${r2.name}`);
    }
    console.log();
  }

  const hasProd = [...selection.d1ToClean, ...selection.r2ToClean].some(r => r.env === "production");
  if (hasProd) {
    console.log(`${c.bgRed}${c.bold} ⚠ WARNING: This includes PRODUCTION resources! ${c.reset}\n`);
  }
};

const cleanD1Database = async (d1: D1Resource): Promise<boolean> => {
  try {
    const tablesResult = await $`bunx wrangler d1 execute ${d1.name} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';" --json`.quiet().nothrow();

    if (tablesResult.exitCode !== 0) {
      console.log(`\n${c.red}D1 Error: ${tablesResult.stderr.toString() || tablesResult.stdout.toString()}${c.reset}`);
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
      return true;
    }

    if (tables.length === 0) {
      return true;
    }

    for (const table of tables) {
      await $`bunx wrangler d1 execute ${d1.name} --remote --command "DROP TABLE IF EXISTS ${table};" --json`.quiet().nothrow();
    }

    return true;
  } catch {
    return false;
  }
};

const CLOUDFLARE_API_TOKEN = "45kkzhpOUI74XMpwlD8R3mtePSfsBG7yo1mhPEcH";
const CLOUDFLARE_ACCOUNT_ID = "8f0203259905d8923687286c84921e6c";

type CleanResult = { success: boolean; count?: number };

const cleanR2Bucket = async (r2: R2Resource): Promise<CleanResult> => {
  try {
    // List objects using Cloudflare API
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
      console.log(`\n${c.red}R2 API Error (${listResponse.status}): ${errText}${c.reset}`);
      return { success: false };
    }

    const listData = await listResponse.json() as { result?: { key: string }[] };
    const objects = listData.result || [];

    if (objects.length === 0) {
      return { success: true, count: 0 };
    }

    // Delete each object using wrangler (which has auth context)
    for (const obj of objects) {
      await $`bunx wrangler r2 object delete ${r2.name}/${obj.key} --remote`.quiet().nothrow();
    }

    return { success: true, count: objects.length };
  } catch {
    return { success: false };
  }
};

const executeCleanup = async (selection: CleanupSelection): Promise<void> => {
  console.log(`\n${c.bold}Starting cleanup...${c.reset}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const d1 of selection.d1ToClean) {
    process.stdout.write(`  ${c.blue}[D1]${c.reset} ${tag(d1.env)} ${d1.name} ... `);
    const success = await cleanD1Database(d1);
    if (success) {
      console.log(`${c.green}CLEANED${c.reset}`);
      successCount++;
    } else {
      console.log(`${c.red}FAILED${c.reset}`);
      failCount++;
    }
  }

  for (const r2 of selection.r2ToClean) {
    process.stdout.write(`  ${c.magenta}[R2]${c.reset} ${tag(r2.env)} ${r2.name} ... `);
    const result = await cleanR2Bucket(r2);
    if (result.success) {
      console.log(`${c.green}CLEANED${c.reset}`);
      successCount++;
    } else {
      console.log(`${c.red}FAILED${c.reset}`);
      failCount++;
    }
  }

  console.log(`\n${c.bold}${"─".repeat(40)}${c.reset}`);
  const summary = `  ${c.green}✓ Success: ${successCount}${c.reset}  ${c.red}✗ Failed: ${failCount}${c.reset}`;
  console.log(summary);
  console.log(`${c.bold}${"─".repeat(40)}${c.reset}\n`);
};

const main = async () => {
  try {
    banner();

    // Step 1: Select service (with fuzzy search)
    const service = await selectService();
    console.log();

    // Step 2: Select resource type (D1, R2, or both) - shows relevant names
    const resourceType = await selectResourceType(service);
    console.log();

    // Step 3: Select environment - shows what will be cleaned
    const environment = await selectEnvironment(service, resourceType);
    console.log();

    // Step 4: Auto-select resources based on choices (no extra prompts!)
    const { d1, r2 } = getResourcesToClean(service, resourceType, environment);

    if (d1.length === 0 && r2.length === 0) {
      console.log(`\n${c.yellow}No resources found. Exiting.${c.reset}\n`);
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

    if (hasProd) {
      const typed = await input({
        message: `${c.red}${c.bold}Type "DELETE" to confirm:${c.reset}`
      });
      if (typed !== "DELETE") {
        console.log(`\n${c.yellow}Aborted.${c.reset}\n`);
        process.exit(0);
      }
    } else {
      const confirmed = await confirm({
        message: `${c.yellow}Proceed with cleanup?${c.reset}`,
        default: false
      });
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
