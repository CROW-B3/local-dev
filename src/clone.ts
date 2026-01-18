#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone, getRepoUrl } from "../repos.config";
import {
  cloneRepo,
  colors,
  detectPackageManager,
  dirExists,
  getRepoPath,
  getWorkspaceRoot,
  initializeHusky,
  log,
  printHeader,
  printSummary,
  renderer,
  repoExists,
  runInstall,
  runWithConcurrency,
  type PackageManager,
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
    renderer.update(repoName, "skip", "Already exists");
    return { name: repoName, success: false, skipped: true, reason: "Already exists" };
  }

  if (dirExists(repoName)) {
    renderer.update(repoName, "skip", "Directory exists (not a git repo)");
    return { name: repoName, success: false, skipped: true, reason: "Directory exists (not a git repo)" };
  }

  renderer.update(repoName, "cloning");
  const cloneSuccess = await cloneRepo(repoUrl, repoPath);
  if (!cloneSuccess) {
    renderer.update(repoName, "error", "Clone failed");
    return { name: repoName, success: false, skipped: false, reason: "Clone failed" };
  }

  const pm: PackageManager = detectPackageManager(repoPath);
  if (pm === "none") {
    renderer.update(repoName, "done");
    return { name: repoName, success: true, skipped: false };
  }

  renderer.update(repoName, "installing", undefined, pm);
  const installSuccess = await runInstall(repoPath);
  if (!installSuccess) {
    renderer.update(repoName, "done", `${pm} install failed`, pm);
    return { name: repoName, success: true, skipped: false, reason: `Cloned (${pm} install failed)` };
  }

  renderer.update(repoName, "husky", undefined, pm);
  const huskySuccess = await initializeHusky(repoPath);
  if (!huskySuccess) {
    renderer.update(repoName, "done", "Husky init failed", pm);
    return { name: repoName, success: true, skipped: false, reason: "Cloned (husky init failed)" };
  }

  renderer.update(repoName, "done", undefined, pm);
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
    .example("$0", "Clone default repos")
    .example("$0 --all", "Clone all repos including optional")
    .example("$0 --only core-auth-service", "Clone specific repo")
    .help()
    .alias("help", "h")
    .parse();

  const only = argv.only as string[];

  printHeader("Clone");

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
  const CLONE_CONCURRENCY = 3;

  for (const repo of repos) {
    renderer.addRepo(repo.name);
  }

  renderer.start();

  try {
    const cloneResults = await runWithConcurrency(repos, CLONE_CONCURRENCY, async repo => {
      const repoUrl = getRepoUrl(repo.name);
      return cloneRepoWithDeps(repo.name, repoUrl);
    });

    for (const result of cloneResults) {
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
