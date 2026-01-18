#!/usr/bin/env bun

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
  renderer,
  repoExists,
  runInstall,
  runWithConcurrency,
  stashChanges,
  type PackageManager,
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
    renderer.update(repoName, "skip", "Not cloned");
    return { name: repoName, success: false, skipped: true, reason: "Not cloned" };
  }

  const hasChanges = await hasUncommittedChanges(repoPath);

  if (hasChanges && !force) {
    const currentBranch = await getCurrentBranch(repoPath);
    renderer.update(repoName, "skip", `Dirty (${currentBranch})`);
    return { name: repoName, success: false, skipped: true, reason: `Dirty (${currentBranch})` };
  }

  if (hasChanges && force) {
    renderer.update(repoName, "stashing");
    await stashChanges(repoPath);
  }

  renderer.update(repoName, "fetching");
  await fetchRemote(repoPath);

  if (await isRemoteEmpty(repoPath)) {
    renderer.update(repoName, "skip", "Remote is empty");
    return { name: repoName, success: false, skipped: true, reason: "Remote is empty" };
  }

  const currentBranch = await getCurrentBranch(repoPath);
  const defaultBranch = await getDefaultBranch(repoPath);

  if (currentBranch !== defaultBranch) {
    renderer.update(repoName, "checkout", defaultBranch);
    const checkoutSuccess = await checkoutBranch(repoPath, defaultBranch);
    if (!checkoutSuccess) {
      renderer.update(repoName, "error", `Checkout ${defaultBranch} failed`);
      return { name: repoName, success: false, skipped: false, reason: `Checkout ${defaultBranch} failed` };
    }
  }

  renderer.update(repoName, "pulling");
  const pullSuccess = await pullLatest(repoPath);
  if (!pullSuccess) {
    renderer.update(repoName, "error", "Pull failed");
    return { name: repoName, success: false, skipped: false, reason: "Pull failed" };
  }

  const pm: PackageManager = detectPackageManager(repoPath);
  if (pm === "none") {
    renderer.update(repoName, "done");
    return { name: repoName, success: true, skipped: false };
  }

  renderer.update(repoName, "installing", undefined, pm);
  const installSuccess = await runInstall(repoPath);
  if (!installSuccess) {
    renderer.update(repoName, "error", "Install failed", pm);
    return { name: repoName, success: false, skipped: false, reason: "Install failed" };
  }

  renderer.update(repoName, "husky", undefined, pm);
  const huskySuccess = await initializeHusky(repoPath);
  if (!huskySuccess) {
    renderer.update(repoName, "error", "Husky init failed", pm);
    return { name: repoName, success: false, skipped: false, reason: "Husky init failed" };
  }

  renderer.update(repoName, "done", undefined, pm);
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
    .option("parallel", {
      alias: "p",
      type: "boolean",
      description: "Sync repositories in parallel",
      default: false,
    })
    .example("$0", "Sync default repos")
    .example("$0 --force", "Stash changes and sync")
    .example("$0 --only core-auth-service", "Sync specific repo")
    .example("$0 --parallel", "Sync repos in parallel")
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

  log.info(`Repositories: ${colors.cyan}${repos.length}${colors.reset}`);
  log.info(`Mode: ${colors.cyan}${argv.parallel ? "Parallel" : "Sequential"}${colors.reset}\n`);

  const results = { success: [] as string[], failed: [] as string[], skipped: [] as string[] };
  const SYNC_CONCURRENCY = argv.parallel ? 3 : 1;

  for (const repo of repos) {
    renderer.addRepo(repo.name);
  }

  renderer.start();

  try {
    const syncResults = await runWithConcurrency(repos, SYNC_CONCURRENCY, async repo => {
      return syncRepo(repo.name, argv.force);
    });

    for (const result of syncResults) {
      if (result.skipped) {
        results.skipped.push(result.name);
      } else if (result.success) {
        results.success.push(result.name);
      } else {
        results.failed.push(result.name);
      }
    }
  } finally {
    renderer.stop();
  }

  printSummary(results);
  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  renderer.stop();
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
