#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone, getRepoUrl } from "../repos.config";
import {
  cloneRepo,
  colors,
  detectPackageManager,
  getRepoPath,
  getWorkspaceRoot,
  log,
  printHeader,
  printSummary,
  repoExists,
  runInstall,
  symbols,
} from "./utils";

interface CloneResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

const cloneRepoWithDeps = async (repoName: string, repoUrl: string): Promise<CloneResult> => {
  const repoPath = getRepoPath(repoName);

  if (repoExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Already exists" };
  }

  const cloneSuccess = await cloneRepo(repoUrl, repoPath);
  if (!cloneSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Clone failed" };
  }

  const pm = detectPackageManager(repoPath);
  if (pm !== "none") {
    const installSuccess = await runInstall(repoPath);
    if (!installSuccess) {
      return { name: repoName, success: true, skipped: false, reason: `Cloned (${pm} install failed)` };
    }
  }

  return { name: repoName, success: true, skipped: false };
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("clone")
    .usage("$0 [options]")
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Clone ALL repositories (including optional ones)",
      default: false,
    })
    .option("only", {
      alias: "o",
      type: "array",
      string: true,
      description: "Clone only specific repo(s)",
      default: [] as string[],
    })
    .option("dry-run", {
      alias: "n",
      type: "boolean",
      description: "Show what would be cloned without doing it",
      default: false,
    })
    .example("$0", "Clone default repos")
    .example("$0 --all", "Clone all repos including optional")
    .example("$0 --only core-auth-service", "Clone specific repo")
    .example("$0 --dry-run", "Preview what would be cloned")
    .help()
    .alias("help", "h")
    .parse();

  const dryRun = argv["dry-run"] as boolean;
  const only = argv.only as string[];

  printHeader(dryRun ? "Clone (DRY RUN)" : "Clone");

  if (dryRun) log.warn("Dry run mode - no changes will be made");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace: ${colors.yellow}${workspaceRoot}${colors.reset}`);

  let repos = getReposToClone(argv.all);

  if (only.length > 0) {
    repos = repos.filter(r => only.includes(r.name));
    if (repos.length === 0) {
      log.error(`No matching repositories: ${only.join(", ")}`);
      process.exit(1);
    }
    log.info(`Filter: ${colors.cyan}${only.join(", ")}${colors.reset}`);
  }

  log.info(`Repositories: ${colors.cyan}${repos.length}${colors.reset}\n`);

  const results = { success: [] as string[], failed: [] as string[], skipped: [] as string[] };

  for (const repo of repos) {
    const repoUrl = getRepoUrl(repo.name);
    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

    if (dryRun) {
      if (repoExists(repo.name)) {
        console.log(`${colors.yellow}[SKIP]${colors.reset} Already exists`);
        results.skipped.push(repo.name);
      } else {
        console.log(`${colors.cyan}[WOULD CLONE]${colors.reset}`);
        results.success.push(repo.name);
      }
      continue;
    }

    const result = await cloneRepoWithDeps(repo.name, repoUrl);

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
