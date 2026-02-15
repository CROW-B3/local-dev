#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { colors, log, printHeader } from "./utils";

interface ResourceCounts {
	d1: number;
	r2: number;
	kv: number;
	queues: number;
}

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

const getPattern = (env: Environment): string => {
	return env === "dev" ? "crow-.*-dev" : "crow-(?!.*-dev$).*";
};

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

const listD1Databases = async (pattern: string): Promise<Array<{ name: string; uuid: string }>> => {
	try {
		const result = await $`npx wrangler d1 list --json`.quiet().nothrow();
		if (result.exitCode !== 0) return [];

		const databases = JSON.parse(result.stdout.toString());
		const regex = new RegExp(pattern);

		return databases.filter((db: any) => regex.test(db.name));
	} catch {
		return [];
	}
};

const deleteD1Database = async (name: string): Promise<boolean> => {
	try {
		const result = await $`npx wrangler d1 delete ${name} --skip-confirmation`.nothrow();
		return result.exitCode === 0;
	} catch {
		return false;
	}
};

const listR2Buckets = async (pattern: string): Promise<Array<{ name: string }>> => {
	try {
		const result = await $`npx wrangler r2 bucket list --json`.quiet().nothrow();
		if (result.exitCode !== 0) return [];

		const buckets = JSON.parse(result.stdout.toString());
		const regex = new RegExp(pattern);

		return buckets.filter((bucket: any) => regex.test(bucket.name));
	} catch {
		return [];
	}
};

const deleteR2Bucket = async (name: string): Promise<boolean> => {
	try {
		const result = await $`npx wrangler r2 bucket delete ${name}`.nothrow();
		return result.exitCode === 0;
	} catch {
		return false;
	}
};

const listKVNamespaces = async (pattern: string): Promise<Array<{ title: string; id: string }>> => {
	try {
		const result = await $`npx wrangler kv namespace list`.quiet().nothrow();
		if (result.exitCode !== 0) return [];

		const namespaces = JSON.parse(result.stdout.toString());
		const regex = new RegExp(pattern);

		return namespaces.filter((ns: any) => regex.test(ns.title));
	} catch {
		return [];
	}
};

const deleteKVNamespace = async (id: string): Promise<boolean> => {
	try {
		const result = await $`npx wrangler kv namespace delete --namespace-id=${id}`.nothrow();
		return result.exitCode === 0;
	} catch {
		return false;
	}
};

const listQueues = async (pattern: string): Promise<Array<{ queue_name: string }>> => {
	try {
		const result = await $`npx wrangler queues list`.quiet().nothrow();
		if (result.exitCode !== 0) return [];

		const queues = JSON.parse(result.stdout.toString());
		const regex = new RegExp(pattern);

		return queues.filter((queue: any) => regex.test(queue.queue_name));
	} catch {
		return [];
	}
};

const deleteQueue = async (name: string): Promise<boolean> => {
	try {
		const result = await $`npx wrangler queues delete ${name}`.nothrow();
		return result.exitCode === 0;
	} catch {
		return false;
	}
};

const cleanupD1Databases = async (pattern: string): Promise<number> => {
	const databases = await listD1Databases(pattern);

	if (databases.length === 0) {
		log.dim("  No D1 databases found");
		return 0;
	}

	console.log(`\n${colors.red}Found ${databases.length} D1 database(s):${colors.reset}`);
	for (const db of databases) {
		console.log(`  ${colors.dim}•${colors.reset} ${db.name} ${colors.dim}(${db.uuid})${colors.reset}`);
	}

	const shouldDelete = await confirm("Delete these D1 databases?");
	if (!shouldDelete) {
		log.warn("Skipped D1 databases");
		return 0;
	}

	let deleted = 0;
	for (const db of databases) {
		const success = await deleteD1Database(db.name);
		if (success) {
			log.success(`Deleted D1: ${db.name}`);
			deleted++;
		} else {
			log.error(`Failed to delete D1: ${db.name}`);
		}
	}

	return deleted;
};

const cleanupR2Buckets = async (pattern: string): Promise<number> => {
	const buckets = await listR2Buckets(pattern);

	if (buckets.length === 0) {
		log.dim("  No R2 buckets found");
		return 0;
	}

	console.log(`\n${colors.red}Found ${buckets.length} R2 bucket(s):${colors.reset}`);
	for (const bucket of buckets) {
		console.log(`  ${colors.dim}•${colors.reset} ${bucket.name}`);
	}

	const shouldDelete = await confirm("Delete these R2 buckets?");
	if (!shouldDelete) {
		log.warn("Skipped R2 buckets");
		return 0;
	}

	let deleted = 0;
	for (const bucket of buckets) {
		const success = await deleteR2Bucket(bucket.name);
		if (success) {
			log.success(`Deleted R2: ${bucket.name}`);
			deleted++;
		} else {
			log.error(`Failed to delete R2: ${bucket.name}`);
		}
	}

	return deleted;
};

const cleanupKVNamespaces = async (pattern: string): Promise<number> => {
	const namespaces = await listKVNamespaces(pattern);

	if (namespaces.length === 0) {
		log.dim("  No KV namespaces found");
		return 0;
	}

	console.log(`\n${colors.red}Found ${namespaces.length} KV namespace(s):${colors.reset}`);
	for (const ns of namespaces) {
		console.log(`  ${colors.dim}•${colors.reset} ${ns.title} ${colors.dim}(${ns.id})${colors.reset}`);
	}

	const shouldDelete = await confirm("Delete these KV namespaces?");
	if (!shouldDelete) {
		log.warn("Skipped KV namespaces");
		return 0;
	}

	let deleted = 0;
	for (const ns of namespaces) {
		const success = await deleteKVNamespace(ns.id);
		if (success) {
			log.success(`Deleted KV: ${ns.title}`);
			deleted++;
		} else {
			log.error(`Failed to delete KV: ${ns.title}`);
		}
	}

	return deleted;
};

const cleanupQueues = async (pattern: string): Promise<number> => {
	const queues = await listQueues(pattern);

	if (queues.length === 0) {
		log.dim("  No queues found");
		return 0;
	}

	console.log(`\n${colors.red}Found ${queues.length} queue(s):${colors.reset}`);
	for (const queue of queues) {
		console.log(`  ${colors.dim}•${colors.reset} ${queue.queue_name}`);
	}

	const shouldDelete = await confirm("Delete these queues?");
	if (!shouldDelete) {
		log.warn("Skipped queues");
		return 0;
	}

	let deleted = 0;
	for (const queue of queues) {
		const success = await deleteQueue(queue.queue_name);
		if (success) {
			log.success(`Deleted Queue: ${queue.queue_name}`);
			deleted++;
		} else {
			log.error(`Failed to delete Queue: ${queue.queue_name}`);
		}
	}

	return deleted;
};

const main = async () => {
	printHeader(`Environment Cleanup - ${environment.toUpperCase()}`);

	console.log(`${colors.red}⚠️  WARNING: This will DELETE ALL DATA in the ${environment} environment!${colors.reset}`);
	console.log(`${colors.red}⚠️  This action is IRREVERSIBLE!${colors.reset}\n`);

	if (!skipConfirmation) {
		const shouldProceed = await confirm("Are you sure you want to continue?");
		if (!shouldProceed) {
			log.warn("Cleanup cancelled");
			process.exit(0);
		}
	}

	const pattern = getPattern(environment);
	log.info(`Using pattern: ${pattern}\n`);

	const counts: ResourceCounts = {
		d1: 0,
		r2: 0,
		kv: 0,
		queues: 0,
	};

	// D1 Databases
	console.log(`${colors.bold}${colors.cyan}D1 Databases${colors.reset}`);
	console.log(`${colors.dim}${"─".repeat(40)}${colors.reset}`);
	counts.d1 = await cleanupD1Databases(pattern);

	// R2 Buckets
	console.log(`\n${colors.bold}${colors.cyan}R2 Buckets${colors.reset}`);
	console.log(`${colors.dim}${"─".repeat(40)}${colors.reset}`);
	counts.r2 = await cleanupR2Buckets(pattern);

	// KV Namespaces
	console.log(`\n${colors.bold}${colors.cyan}KV Namespaces${colors.reset}`);
	console.log(`${colors.dim}${"─".repeat(40)}${colors.reset}`);
	counts.kv = await cleanupKVNamespaces(pattern);

	// Queues
	console.log(`\n${colors.bold}${colors.cyan}Queues${colors.reset}`);
	console.log(`${colors.dim}${"─".repeat(40)}${colors.reset}`);
	counts.queues = await cleanupQueues(pattern);

	// Summary
	const total = counts.d1 + counts.r2 + counts.kv + counts.queues;

	console.log(`\n${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`${colors.bold}  CLEANUP SUMMARY${colors.reset}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`  D1 Databases:  ${colors.green}${counts.d1}${colors.reset}`);
	console.log(`  R2 Buckets:    ${colors.green}${counts.r2}${colors.reset}`);
	console.log(`  KV Namespaces: ${colors.green}${counts.kv}${colors.reset}`);
	console.log(`  Queues:        ${colors.green}${counts.queues}${colors.reset}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`  ${colors.bold}Total Deleted: ${colors.green}${total}${colors.reset}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}\n`);

	if (total > 0) {
		log.success(`Cleanup complete for ${environment} environment!`);
	} else {
		log.info("No resources were deleted");
	}

	// Phase 2: Recreate databases and run migrations
	await recreateDatabases();
};

const recreateDatabases = async () => {
	printHeader("Recreating Databases");

	log.info("Running migrations to recreate databases with empty schema...\n");

	const services = [
		{ name: "core-auth-service", db: "crow-core-auth-service-db" },
		{ name: "core-user-service", db: "crow-core-user-service-db" },
		{ name: "core-organization-service", db: "crow-core-organization-service-db" },
		{ name: "core-product-service", db: "crow-core-product-service-db" },
		{ name: "core-billing-service", db: "crow-core-billing-service-db" },
	];

	const workspaceRoot = join(process.cwd(), "..");
	const suffix = environment === "dev" ? "-dev" : "";
	let migrated = 0;

	for (const service of services) {
		const servicePath = join(workspaceRoot, service.name);
		const dbName = `${service.db}${suffix}`;

		// Check if service directory exists
		if (!existsSync(servicePath)) {
			log.warn(`Skipping ${service.name} (directory not found)`);
			continue;
		}

		// Check if migrations directory exists
		const migrationsDir = join(servicePath, "drizzle", "migrations");
		if (!existsSync(migrationsDir)) {
			log.warn(`Skipping ${service.name} (no migrations found)`);
			continue;
		}

		try {
			log.info(`Applying migrations for ${service.name}...`);
			const result = await $`npx wrangler d1 migrations apply ${dbName} --remote`.cwd(servicePath).nothrow();

			if (result.exitCode === 0) {
				log.success(`✓ ${service.name} migrations applied`);
				migrated++;
			} else {
				log.error(`✗ ${service.name} migrations failed`);
			}
		} catch (error) {
			log.error(`✗ ${service.name} error: ${error}`);
		}
	}

	console.log(`\n${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`${colors.bold}  RECREATION SUMMARY${colors.reset}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
	console.log(`  Services Migrated: ${colors.green}${migrated}${colors.reset}/${services.length}`);
	console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}\n`);

	if (migrated === services.length) {
		log.success("All databases recreated with clean schema!");
	} else if (migrated > 0) {
		log.warn(`Only ${migrated}/${services.length} databases recreated`);
	} else {
		log.error("No databases were recreated");
	}
};

main().catch((error) => {
	log.error(`Cleanup failed: ${error.message}`);
	process.exit(1);
});
