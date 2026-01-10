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
  flushWrites,
  formatProgressLine,
  getGitInfo,
  getRepoPath,
  getWorkspaceRoot,
  initializeHusky,
  log,
  printHeader,
  printSummary,
  ProgressDisplay,
  pullLatest,
  repoExists,
  ResultDetail,
  runInstall,
  symbols,
  withConcurrency,
} from "./utils";

interface SyncResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
  timing?: {
    total: number;
    checkout: number;
    fetch: number;
    pull: number;
    install: number;
    husky: number;
  };
}

const SYNC_STEPS = [
  { name: "Checking", icon: "🔍", color: colors.blue, key: "check" },
  { name: "Fetching", icon: "📡", color: colors.cyan, key: "fetch" },
  { name: "Checkout", icon: "🌿", color: colors.yellow, key: "checkout" },
  { name: "Pulling", icon: "⬇️", color: colors.magenta, key: "pull" },
  { name: "Installing", icon: "📦", color: colors.yellow, key: "install" },
  { name: "Husky", icon: "🪝", color: colors.green, key: "husky" },
  { name: "Complete", icon: "✅", color: colors.green, key: "complete" },
];

const syncRepo = async (repoName: string, force: boolean, display?: ProgressDisplay, verbose?: boolean): Promise<SyncResult> => {
  const repoPath = getRepoPath(repoName);
  const timing = { total: 0, checkout: 0, fetch: 0, pull: 0, install: 0, husky: 0 };
  const startTime = Date.now();

  if (!repoExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Not cloned" };
  }

  // Step 1: Get all git info in consolidated call
  await display?.updateWithRepo(repoName, `${SYNC_STEPS[0].color}${SYNC_STEPS[0].icon}${colors.reset} ${SYNC_STEPS[0].name}`, "check", 0.1);
  const gitInfo = await getGitInfo(repoPath);

  if (gitInfo.hasChanges && !force) {
    return { name: repoName, success: false, skipped: true, reason: `Dirty (${gitInfo.currentBranch})` };
  }

  if (gitInfo.hasChanges && force) {
    await $`git -C ${repoPath} stash push -m "local-dev sync"`.quiet().nothrow();
  }

  // Step 2: Fetch remote
  const fetchStart = Date.now();
  await display?.updateWithRepo(repoName, `${SYNC_STEPS[1].color}${SYNC_STEPS[1].icon}${colors.reset} ${SYNC_STEPS[1].name}`, "fetch", 0.25);
  await fetchRemote(repoPath);
  timing.fetch = Date.now() - fetchStart;

  if (gitInfo.isRemoteEmpty) {
    return { name: repoName, success: false, skipped: true, reason: "Remote is empty" };
  }

  // Step 3: Checkout branch if needed
  let checkoutTime = 0;
  if (gitInfo.currentBranch !== gitInfo.defaultBranch) {
    const checkoutStart = Date.now();
    await display?.updateWithRepo(repoName, `${SYNC_STEPS[2].color}${SYNC_STEPS[2].icon}${colors.reset} ${SYNC_STEPS[2].name}`, "checkout", 0.4);
    const checkoutSuccess = await checkoutBranch(repoPath, gitInfo.defaultBranch);
    checkoutTime = Date.now() - checkoutStart;
    if (!checkoutSuccess) {
      return { name: repoName, success: false, skipped: false, reason: `Checkout ${gitInfo.defaultBranch} failed`, timing: { ...timing, checkout: checkoutTime, total: Date.now() - startTime } };
    }
    timing.checkout = checkoutTime;
  }

  // Step 4: Pull latest
  const pullStart = Date.now();
  await display?.updateWithRepo(repoName, `${SYNC_STEPS[3].color}${SYNC_STEPS[3].icon}${colors.reset} ${SYNC_STEPS[3].name}`, "pull", 0.55);
  const pullSuccess = await pullLatest(repoPath);
  timing.pull = Date.now() - pullStart;
  if (!pullSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Pull failed", timing: { ...timing, total: Date.now() - startTime } };
  }

  // Step 5: Install dependencies
  const pm = detectPackageManager(repoPath);
  let installTime = 0;
  if (pm !== "none") {
    const installStart = Date.now();
    await display?.updateWithRepo(repoName, `${SYNC_STEPS[4].color}${SYNC_STEPS[4].icon}${colors.reset} Installing ${pm} deps...`, "install", 0.75);
    const installSuccess = await runInstall(repoPath);
    installTime = Date.now() - installStart;
    if (!installSuccess) {
      return { name: repoName, success: false, skipped: false, reason: "Install failed", timing: { ...timing, install: installTime, total: Date.now() - startTime } };
    }
    timing.install = installTime;
  }

  // Step 6: Initialize Husky if repo has .husky directory
  const huskyStart = Date.now();
  await display?.updateWithRepo(repoName, `${SYNC_STEPS[5].color}${SYNC_STEPS[5].icon}${colors.reset} ${SYNC_STEPS[5].name}`, "husky", 0.9);
  const huskySuccess = await initializeHusky(repoPath);
  timing.husky = Date.now() - huskyStart;
  if (!huskySuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Husky init failed", timing: { ...timing, total: Date.now() - startTime } };
  }

  timing.total = Date.now() - startTime;
  if (verbose) {
    log.dim(`  Details: fetch=${timing.fetch}ms, pull=${timing.pull}ms, install=${timing.install}ms, husky=${timing.husky}ms`);
  }

  return { name: repoName, success: true, skipped: false, timing };
};

const main = async () => {
  const startTime = Date.now();

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
    .option("parallel", {
      alias: "p",
      type: "number",
      description: "Number of parallel syncs (default: 5, max: 10)",
      default: 5,
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      description: "Verbose output with detailed step information",
      default: false,
    })
    .example("$0", "Sync default repos")
    .example("$0 --force", "Stash changes and sync")
    .example("$0 --only core-auth-service", "Sync specific repo")
    .example("$0 --parallel 10", "Sync with 10 parallel processes")
    .example("$0 --verbose", "Show detailed timing information")
    .help()
    .alias("help", "h")
    .parse();

  const only = (argv.only as string[]).flatMap((item: string) => item.split(',').map(s => s.trim()));
  const parallelLimit = Math.max(1, Math.min(10, argv.parallel as number));
  const verbose = argv.verbose as boolean;

  console.clear();
  printHeader("⚡ Sync Repositories");

  if (argv.force) log.warn("Force mode - will stash uncommitted changes");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`📁 Workspace: ${colors.yellow}${workspaceRoot}${colors.reset}`);
  log.info(`⚡ Parallel: ${colors.cyan}${parallelLimit}${colors.reset} concurrent processes`);

  let repos = getReposToClone(argv.all);

  if (only.length > 0) {
    repos = repos.filter(r => only.includes(r.name));
    log.info(`🎯 Filter: ${colors.cyan}${only.join(", ")}${colors.reset}`);
  }

  if (repos.length === 0) {
    log.error(`❌ No matching repositories: ${only.join(", ")}`);
    process.exit(1);
  }

  log.info(`📦 Repositories: ${colors.cyan}${repos.length}${colors.reset}`);
  log.info(`⏱️  Started: ${colors.dim}${new Date().toLocaleTimeString()}${colors.reset}\n`);

  const results = { success: [] as string[], failed: [] as ResultDetail[], skipped: [] as ResultDetail[] };
  const timings: Record<string, number> = {};

  // Sync repos with enhanced concurrency control
  const syncTasks = repos.map((repo) => async () => {
    const display = new ProgressDisplay();

    // Initialize display with repo name
    await display.init("", repo.name, 0);

    const result = await syncRepo(repo.name, argv.force, display, verbose);

    // Track timing
    if (result.timing) {
      timings[repo.name] = result.timing.total;
    }

    // Finalize with result
    if (result.skipped) {
      await display.finalize(`${colors.yellow}[SKIP]${colors.reset} ${result.reason}`, repo.name, false);
      results.skipped.push({ name: repo.name, reason: result.reason || "Unknown" });
    } else if (result.success) {
      await display.finalize(`${colors.green}[OK]${colors.reset}`, repo.name, true);
      results.success.push(repo.name);
    } else {
      await display.finalize(`${colors.red}[FAIL]${colors.reset} ${result.reason}`, repo.name, false);
      results.failed.push({ name: repo.name, reason: result.reason || "Unknown" });
    }

    return result;
  });

  log.info(`🔄 Starting parallel sync...\n`);
  await withConcurrency(syncTasks, parallelLimit);

  // Wait for all writes to finish before printing summary
  await flushWrites();

  // Calculate stats
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgTimePerRepo = Object.values(timings).length > 0 ? (Object.values(timings).reduce((a, b) => a + b) / Object.values(timings).length / 1000).toFixed(2) : "0";
  const successRate = repos.length > 0 ? Math.round((results.success.length / repos.length) * 100) : 0;

  // Enhanced summary with timing
  log.info(`\n${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}`);
  log.info(`${colors.bold}${colors.cyan}  🎉 SYNC COMPLETE${colors.reset}`);
  log.info(`${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}`);

  log.info(`${colors.green}✅ Success: ${results.success.length}${colors.reset} ${colors.dim}(${successRate}%)${colors.reset}`);
  if (results.skipped.length > 0) {
    log.info(`${colors.yellow}⏭️  Skipped: ${results.skipped.length}${colors.reset}`);
  }
  if (results.failed.length > 0) {
    log.info(`${colors.red}❌ Failed: ${results.failed.length}${colors.reset}`);
  }

  log.info(`${colors.blue}⏱️  Total Time: ${totalTime}s${colors.reset}`);
  log.info(`${colors.blue}📊 Avg Per Repo: ${avgTimePerRepo}s${colors.reset}`);
  log.info(`${colors.blue}🔗 Processed: ${repos.length}/${repos.length} repos${colors.reset}`);

  if (results.failed.length > 0) {
    log.info(`\n${colors.red}Failed repositories:${colors.reset}`);
    results.failed.forEach(({ name, reason }) => {
      log.dim(`  ${colors.red}•${colors.reset} ${name}: ${reason}`);
    });
  }

  if (results.skipped.length > 0) {
    log.info(`\n${colors.yellow}Skipped repositories:${colors.reset}`);
    results.skipped.forEach(({ name, reason }) => {
      log.dim(`  ${colors.yellow}•${colors.reset} ${name}: ${reason}`);
    });
  }

  log.info(`\n${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}\n`);

  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
