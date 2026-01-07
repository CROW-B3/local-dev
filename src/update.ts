#!/usr/bin/env bun

import { $ } from "bun";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone } from "../repos.config";
import {
  colors,
  detectPackageManager,
  getRepoPath,
  getWorkspaceRoot,
  log,
  printHeader,
  printSummary,
  repoExists,
  symbols,
} from "./utils";

interface UpdateResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

const updateRepo = async (repoName: string): Promise<UpdateResult> => {
  const repoPath = getRepoPath(repoName);

  if (!repoExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Not cloned" };
  }

  const pm = detectPackageManager(repoPath);
  if (pm === "none") {
    return { name: repoName, success: false, skipped: true, reason: "No package.json" };
  }

  if (pm !== "bun") {
    return { name: repoName, success: false, skipped: true, reason: `Uses ${pm}` };
  }

  try {
    const result = await $`bun update`.cwd(repoPath).nothrow();
    if (result.exitCode === 0) {
      return { name: repoName, success: true, skipped: false };
    } else {
      return { name: repoName, success: false, skipped: false, reason: "Update failed" };
    }
  } catch {
    return { name: repoName, success: false, skipped: false, reason: "Update failed" };
  }
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("update")
    .usage("$0 [options]")
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Update ALL repositories (including optional ones)",
      default: false,
    })
    .option("only", {
      alias: "o",
      type: "array",
      string: true,
      description: "Update only specific repo(s)",
      default: [] as string[],
    })
    .example("$0", "Update all default repos")
    .example("$0 --all", "Update all repos including optional")
    .example("$0 --only core-auth-service", "Update specific repo")
    .help()
    .alias("help", "h")
    .parse();

  const only = argv.only as string[];

  printHeader("Update Bun Dependencies");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace: ${colors.yellow}${workspaceRoot}${colors.reset}`);

  let repos = getReposToClone(argv.all);

  if (only.length > 0) {
    repos = repos.filter(r => only.includes(r.name));
    log.info(`Filter: ${colors.cyan}${only.join(", ")}${colors.reset}`);
  }

  if (repos.length === 0) {
    log.error(`No matching repositories: ${only.join(", ")}`);
    process.exit(1);
  }

  log.info(`Repositories: ${colors.cyan}${repos.length}${colors.reset}\n`);

  const results = { success: [] as string[], failed: [] as string[], skipped: [] as string[] };

  for (const repo of repos) {
    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

    const result = await updateRepo(repo.name);

    if (result.skipped) {
      console.log(`${colors.yellow}[SKIP]${colors.reset} ${result.reason}`);
      results.skipped.push(repo.name);
    } else if (result.success) {
      console.log(`${colors.green}[OK]${colors.reset}`);
      results.success.push(repo.name);
    } else {
      console.log(`${colors.red}[FAIL]${colors.reset} ${result.reason}`);
      results.failed.push(repo.name);
    }
  }

  printSummary(results);
  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
