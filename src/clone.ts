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
  repoExists,
  runInstall,
  runWithConcurrency,
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

  if (dirExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Directory exists (not a git repo)" };
  }

  process.stdout.write(`    ${colors.dim}Cloning...${colors.reset} `);
  const cloneSuccess = await cloneRepo(repoUrl, repoPath);
  if (!cloneSuccess) {
    return { name: repoName, success: false, skipped: false, reason: "Clone failed" };
  }
  console.log(`${colors.green}✓${colors.reset}`);

  const pm = detectPackageManager(repoPath);
  if (pm === "none") {
    return { name: repoName, success: true, skipped: false };
  }

  process.stdout.write(`    ${colors.dim}Installing ${pm}${colors.reset} `);
  const installSuccess = await runInstall(repoPath);
  if (!installSuccess) {
    console.log(`${colors.yellow}⚠${colors.reset}`);
    return { name: repoName, success: true, skipped: false, reason: `Cloned (${pm} install failed)` };
  }
  console.log(`${colors.green}✓${colors.reset}`);

  process.stdout.write(`    ${colors.dim}Initializing husky${colors.reset} `);
  const huskySuccess = await initializeHusky(repoPath);
  if (!huskySuccess) {
    console.log(`${colors.yellow}⚠${colors.reset}`);
    return { name: repoName, success: true, skipped: false, reason: "Cloned (husky init failed)" };
  }
  console.log(`${colors.green}✓${colors.reset}`);

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

  await runWithConcurrency(repos, CLONE_CONCURRENCY, async repo => {
    const repoUrl = getRepoUrl(repo.name);
    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

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

    return result;
  });

  printSummary(results);
  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
