#!/usr/bin/env bun

import { $ } from "bun";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone } from "../repos.config";
import {
  checkoutBranch,
  colors,
  detectPackageManager,
  fetchRemote,
  getCurrentBranch,
  getDefaultBranch,
  getRepoPath,
  getWorkspaceRoot,
  hasUncommittedChanges,
  initializeHusky,
  isRemoteEmpty,
  log,
  printHeader,
  printSummary,
  pullLatest,
  repoExists,
  runInstall,
  symbols,
} from "./utils";

interface SyncResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

const syncRepo = async (repoName: string, force: boolean): Promise<SyncResult> => {
  const repoPath = getRepoPath(repoName);

  if (!repoExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Not cloned" };
  }

  const hasChanges = await hasUncommittedChanges(repoPath);
  const currentBranch = await getCurrentBranch(repoPath);

  if (hasChanges && !force) {
    return { name: repoName, success: false, skipped: true, reason: `Dirty (${currentBranch})` };
  }

  if (hasChanges && force) {
    await $`git -C ${repoPath} stash push -m "local-dev sync"`.quiet().nothrow();
  }

  await fetchRemote(repoPath);

  // Skip empty repositories (no branches on remote)
  if (await isRemoteEmpty(repoPath)) {
    return { name: repoName, success: false, skipped: true, reason: "Remote is empty" };
  }

  const defaultBranch = await getDefaultBranch(repoPath);
  if (currentBranch !== defaultBranch) {
    const checkoutSuccess = await checkoutBranch(repoPath, defaultBranch);
    if (!checkoutSuccess) {
      return { name: repoName, success: false, skipped: false, reason: `Checkout ${defaultBranch} failed` };
    }
  }

  const pullSuccess = await pullLatest(repoPath);
  if (!pullSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Pull failed" };
  }

  const pm = detectPackageManager(repoPath);
  if (pm === "none") {
    return { name: repoName, success: true, skipped: false };
  }

  const installSuccess = await runInstall(repoPath);
  if (!installSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Install failed" };
  }

  // Initialize Husky if repo has .husky directory
  const huskySuccess = await initializeHusky(repoPath);
  if (!huskySuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Husky init failed" };
  }

  return { name: repoName, success: true, skipped: false };
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("sync")
    .usage("$0 [options]")
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Stash changes and sync anyway",
      default: false,
    })
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Sync ALL repositories (including optional ones)",
      default: false,
    })
    .option("only", {
      alias: "o",
      type: "array",
      string: true,
      description: "Sync only specific repo(s)",
      default: [] as string[],
    })
    .example("$0", "Sync default repos")
    .example("$0 --force", "Stash changes and sync")
    .example("$0 --only core-auth-service", "Sync specific repo")
    .help()
    .alias("help", "h")
    .parse();

  const only = argv.only as string[];

  printHeader("Sync");

  if (argv.force) log.warn("Force mode - will stash uncommitted changes");

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

    const result = await syncRepo(repo.name, argv.force);

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
