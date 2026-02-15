#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { colors, log, printHeader } from "./utils";

type Environment = "dev" | "prod";

const ACCOUNT_ID = "8f0203259905d8923687286c84921e6c";

const argv = await yargs(hideBin(process.argv))
	.usage("Usage: $0 --env [dev|prod]")
	.option("env", {
		alias: "e",
		type: "string",
		choices: ["dev", "prod"] as const,
		demandOption: true,
		description: "Environment to clean up",
	})
	.option("yes", {
		alias: "y",
		type: "boolean",
		default: false,
		description: "Skip confirmation prompts",
	})
	.help()
	.alias("help", "h")
	.parse();

const environment: Environment = argv.env as Environment;
const skipConfirmation = argv.yes;

// Set account ID for wrangler commands
process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;

const confirm = async (message: string): Promise<boolean> => {
	if (skipConfirmation) return true;

	console.log(`\n${colors.yellow}${message}${colors.reset}`);
	console.log(`${colors.dim}Type 'yes' to continue, anything else to skip:${colors.reset} `);

	for await (const line of console) {
		const input = line.trim().toLowerCase();
		return input === "yes";
	}

	return false;
};

const getTables = async (dbName: string, servicePath: string): Promise<string[]> => {
	try {
		const result = await $`npx wrangler d1 execute ${dbName} --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_cf_%'"`.cwd(servicePath).quiet().nothrow();

		if (result.exitCode !== 0) return [];

		const output = result.stdout.toString();
		const tables: string[] = [];

		// Parse wrangler output to extract table names
		const lines = output.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && trimmed !== 'name' && trimmed !== '────' && !trimmed.includes('🌀') && !trimmed.includes('Results')) {
				tables.push(trimmed);
			}
		}

		return tables;
	} catch {
		return [];
	}
};

const truncateTable = async (dbName: string, servicePath: string, tableName: string): Promise<boolean> => {
	try {
		const result = await $`npx wrangler d1 execute ${dbName} --remote --command="DELETE FROM ${tableName}"`.cwd(servicePath).nothrow();
		return result.exitCode === 0;
	} catch {
		return false;
	}
};

const cleanDatabase = async (service: { name: string; db: string }, servicePath: string): Promise<number> => {
	log.info(`Cleaning ${service.name}...`);

	const tables = await getTables(service.db, servicePath);

	if (tables.length === 0) {
		log.dim(`  No tables found in ${service.name}`);
		return 0;
	}

	console.log(`${colors.dim}  Found ${tables.length} table(s): ${tables.join(', ')}${colors.reset}`);

	let cleaned = 0;
	for (const table of tables) {
		const success = await truncateTable(service.db, servicePath, table);
		if (success) {
			log.success(`  ✓ Truncated ${table}`);
			cleaned++;
		} else {
			log.error(`  ✗ Failed to truncate ${table}`);
		}
	}

	return cleaned;
};

const main = async () => {
	printHeader(`Table Cleanup - ${environment.toUpperCase()}`);

	console.log(`${colors.yellow}⚠️  This will DELETE ALL DATA from tables in the ${environment} environment!${colors.reset}`);
	console.log(`${colors.yellow}⚠️  Databases and schemas will remain intact.${colors.reset}\n`);

	if (!skipConfirmation) {
		const shouldProceed = await confirm("Are you sure you want to continue?");
		if (!shouldProceed) {
			log.warn("Cleanup cancelled");
			process.exit(0);
		}
	}

	const services = [
		{ name: "core-auth-service", db: `crow-core-auth-service-db-${environment}` },
		{ name: "core-user-service", db: `crow-core-user-service-db-${environment}` },
		{ name: "core-organization-service", db: `crow-core-organization-service-db-${environment}` },
		{ name: "core-product-service", db: `crow-core-product-service-db-${environment}` },
		{ name: "core-billing-service", db: `crow-core-billing-service-db-${environment}` },
	];

	const workspaceRoot = join(process.cwd(), "..");
	let totalTables = 0;
	let totalCleaned = 0;

	for (const service of services) {
		const servicePath = join(workspaceRoot, service.name);

		if (!existsSync(servicePath)) {
			log.warn(`Skipping ${service.name} (directory not found)`);
			continue;
		}

		const cleaned = await cleanDatabase(service, servicePath);
		totalTables += cleaned;
		if (cleaned > 0) totalCleaned++;

		console.log("");
	}

	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`${colors.bold}  CLEANUP SUMMARY${colors.reset}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`  Tables Truncated: ${colors.green}${totalTables}${colors.reset}`);
	console.log(`  Services Cleaned: ${colors.green}${totalCleaned}${colors.reset}/${services.length}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}\n`);

	if (totalTables > 0) {
		log.success("All tables cleaned! Environment is ready for fresh testing.");
	} else {
		log.warn("No tables were cleaned");
	}
};

main().catch((error) => {
	log.error(`Cleanup failed: ${error.message}`);
	process.exit(1);
});
