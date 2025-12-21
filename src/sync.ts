#!/usr/bin/env bun
/**
 * Sync Script
 *
 * Synchronizes all CROW-B3 repositories:
 * 1. Checks for uncommitted changes
 * 2. If clean: checkout main, pull, install dependencies
 * 3. If dirty: skip with warning (unless --force)
 *
 * Usage:
 *   bun run sync           # Sync repos (skip dirty ones)
 *   bun run sync --force   # Stash changes and sync anyway
 *   bun run sync --help    # Show help
 */

import { $ } from "bun";
import { getReposToClone, getStats } from "../repos.config";
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
  log,
  parseArgs,
  printHeader,
  printSummary,
  pullLatest,
  repoExists,
  runInstall,
  symbols,
} from "./utils";

const showHelp = () => {
  console.log(`
${colors.bold}CROW-B3 Sync Script${colors.reset}

${colors.cyan}USAGE:${colors.reset}
  bun run sync [options]

${colors.cyan}OPTIONS:${colors.reset}
  --force, -f    Stash changes and sync anyway
  --all, -a      Sync ALL repositories (including optional ones)
  --help, -h     Show this help message
  --verbose, -v  Show detailed output

${colors.cyan}DESCRIPTION:${colors.reset}
  For each repository:
  1. Check for uncommitted changes
  2. If clean: checkout main ${symbols.arrow} pull ${symbols.arrow} install deps
  3. If dirty: skip (or stash with --force)

${colors.cyan}REPOSITORIES:${colors.reset}
  Syncs ${colors.green}${getStats().defaultClone}${colors.reset} repositories by default.
  With --all, syncs ${colors.yellow}${getStats().defaultClone + getStats().optional}${colors.reset} repositories.
`);
};

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
    return {
      name: repoName,
      success: false,
      skipped: true,
      reason: `Has uncommitted changes on ${currentBranch}`,
    };
  }

  if (hasChanges && force) {
    log.dim(`  Stashing changes...`);
    await $`git -C ${repoPath} stash push -m "local-dev sync stash"`.quiet().nothrow();
  }

  log.dim(`  Fetching...`);
  await fetchRemote(repoPath);

  const defaultBranch = await getDefaultBranch(repoPath);
  if (currentBranch !== defaultBranch) {
    log.dim(`  Checking out ${defaultBranch}...`);
    const checkoutSuccess = await checkoutBranch(repoPath, defaultBranch);
    if (!checkoutSuccess) {
      return { name: repoName, success: false, skipped: false, reason: `Failed to checkout ${defaultBranch}` };
    }
  }

  log.dim(`  Pulling...`);
  const pullSuccess = await pullLatest(repoPath);
  if (!pullSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Failed to pull" };
  }

  const pm = detectPackageManager(repoPath);
  if (pm !== "none") {
    log.dim(`  Installing dependencies (${pm})...`);
    const installSuccess = await runInstall(repoPath);
    if (!installSuccess) {
      return { name: repoName, success: false, skipped: false, reason: "Install failed" };
    }
  }

  return { name: repoName, success: true, skipped: false };
};

const main = async () => {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  printHeader("CROW-B3 Repository Sync");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace root: ${colors.yellow}${workspaceRoot}${colors.reset}`);

  if (args.force) {
    log.warn(`Force mode enabled - will stash uncommitted changes`);
  }

  const repos = getReposToClone(args.all);
  log.info(`Repositories to sync: ${colors.cyan}${repos.length}${colors.reset}`);
  console.log("");

  const results = {
    success: [] as string[],
    failed: [] as string[],
    skipped: [] as string[],
  };

  for (const repo of repos) {
    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

    const result = await syncRepo(repo.name, args.force);

    if (result.skipped) {
      console.log(`${colors.yellow}[SKIP]${colors.reset} ${result.reason}`);
      results.skipped.push(`${repo.name}: ${result.reason}`);
    } else if (result.success) {
      console.log(`${colors.green}[OK]${colors.reset} Synced`);
      results.success.push(repo.name);
    } else {
      console.log(`${colors.red}[FAIL]${colors.reset} ${result.reason}`);
      results.failed.push(`${repo.name}: ${result.reason}`);
    }
  }

  printSummary(results);

  if (results.failed.length > 0) {
    process.exit(1);
  }
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
