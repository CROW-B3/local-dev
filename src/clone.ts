#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone, getRepoUrl } from "../repos.config";
import {
  cloneRepo,
  colors,
  detectPackageManager,
  dirExists,
  flushWrites,
  formatProgressLine,
  getRepoPath,
  getWorkspaceRoot,
  initializeHusky,
  log,
  printHeader,
  printSummary,
  ProgressDisplay,
  repoExists,
  ResultDetail,
  runInstall,
  symbols,
  withConcurrency,
} from "./utils";

interface CloneResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
}

const cloneRepoWithDeps = async (
  repoName: string,
  repoUrl: string,
  display?: ProgressDisplay
): Promise<CloneResult> => {
  const repoPath = getRepoPath(repoName);
  const steps = [
    { name: "Checking", icon: "🔍", color: colors.blue },
    { name: "Cloning", icon: "📥", color: colors.cyan },
    { name: "Installing", icon: "📦", color: colors.yellow },
    { name: "Initializing", icon: "⚙️", color: colors.magenta },
    { name: "Complete", icon: "✅", color: colors.green }
  ];

  // Start with a clean line for this repo
  await display?.init("", repoName, 0);

  // Step 1: Pre-checks
  await display?.updateWithRepo(repoName, `${colors.blue}${steps[0].icon}${colors.reset} ${steps[0].name}`, "pre-check", 0.1);
  
  if (repoExists(repoName)) {
    await display?.finalize(`${colors.yellow}[SKIP]${colors.reset}`, repoName, false);
    return { name: repoName, success: false, skipped: true, reason: "Already exists" };
  }

  if (dirExists(repoName)) {
    await display?.finalize(`${colors.yellow}[SKIP]${colors.reset}`, repoName, false);
    return { name: repoName, success: false, skipped: true, reason: "Directory exists (not a git repo)" };
  }

  // Step 2: Clone repository
  await display?.updateWithRepo(repoName, `${colors.cyan}${steps[1].icon}${colors.reset} ${steps[1].name}`, "git-clone", 0.3);
  const cloneSuccess = await cloneRepo(repoUrl, repoPath);
  if (!cloneSuccess) {
    await display?.finalize(`${colors.red}[FAIL]${colors.reset}`, repoName, false);
    return { name: repoName, success: false, skipped: false, reason: "Clone failed" };
  }

  // Step 3: Detect package manager and install dependencies
  await display?.updateWithRepo(repoName, `${colors.yellow}${steps[2].icon}${colors.reset} ${steps[2].name}`, "detect-pm", 0.5);
  const pm = detectPackageManager(repoPath);
  
  if (pm === "none") {
    await display?.finalize(`${colors.green}[OK]${colors.reset}`, repoName, true);
    return { name: repoName, success: true, skipped: false };
  }

  await display?.updateWithRepo(repoName, `${colors.yellow}${steps[2].icon}${colors.reset} Installing ${pm} deps...`, "install", 0.7);
  const installSuccess = await runInstall(repoPath);
  if (!installSuccess) {
    await display?.finalize(`${colors.red}[FAIL]${colors.reset}`, repoName, false);
    return { name: repoName, success: true, skipped: false, reason: `Cloned (${pm} install failed)` };
  }

  // Step 4: Initialize Husky if needed
  await display?.updateWithRepo(repoName, `${colors.magenta}${steps[3].icon}${colors.reset} ${steps[3].name}`, "husky-init", 0.9);
  const huskySuccess = await initializeHusky(repoPath);
  if (!huskySuccess) {
    await display?.finalize(`${colors.yellow}[WARN]${colors.reset}`, repoName, false);
    return { name: repoName, success: true, skipped: false, reason: "Cloned (husky init failed)" };
  }

  // Step 5: Complete
  await display?.finalize(`${colors.green}[OK]${colors.reset}`, repoName, true);
  return { name: repoName, success: true, skipped: false };
};

const main = async () => {
  const startTime = Date.now();
  
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
    .option("parallel", {
      alias: "p",
      type: "number",
      description: "Number of parallel clones (default: 5)",
      default: 5,
    })
    .example("$0", "Clone default repos")
    .example("$0 --all", "Clone all repos including optional")
    .example("$0 --only core-auth-service", "Clone specific repo")
    .example("$0 --parallel 3", "Clone with 3 parallel processes")
    .help()
    .alias("help", "h")
    .parse();

  const only = (argv.only as string[]).flatMap((item: string) => item.split(',').map(s => s.trim()));
  const parallelLimit = Math.max(1, Math.min(10, argv.parallel as number));

  // Enhanced header with system info
  console.clear();
  printHeader("🚀 Clone Repositories");
  
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
  const activeDisplays = new Map<string, ProgressDisplay>();

  // Enhanced parallel cloning with better status tracking
  const cloneTasks = repos.map((repo, index) => async () => {
    const repoUrl = getRepoUrl(repo.name);
    const display = new ProgressDisplay();
    activeDisplays.set(repo.name, display);

    // Small delay to prevent all repos from starting at exactly the same time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));

    const result = await cloneRepoWithDeps(repo.name, repoUrl, display);

    // Enhanced finalization with better status display
    if (result.skipped) {
      results.skipped.push({ name: repo.name, reason: result.reason || "Unknown" });
    } else if (result.success) {
      results.success.push(repo.name);
    } else {
      results.failed.push({ name: repo.name, reason: result.reason || "Unknown" });
    }

    activeDisplays.delete(repo.name);
    return result;
  });

  // Execute with improved concurrency control
  log.info(`🔄 Starting parallel cloning...`);
  await withConcurrency(cloneTasks, parallelLimit);

  // Ensure all displays are finalized
  await flushWrites();

  // Enhanced summary with timing and statistics
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const successRate = repos.length > 0 ? Math.round((results.success.length / repos.length) * 100) : 0;
  
  console.log(`\n${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  🎉 CLONE COMPLETE${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}`);
  
  console.log(`${colors.green}✅ Success: ${results.success.length}${colors.reset} ${colors.dim}(${successRate}%)${colors.reset}`);
  if (results.skipped.length > 0) {
    console.log(`${colors.yellow}⏭️  Skipped: ${results.skipped.length}${colors.reset}`);
  }
  if (results.failed.length > 0) {
    console.log(`${colors.red}❌ Failed: ${results.failed.length}${colors.reset}`);
  }
  
  console.log(`${colors.blue}⏱️  Total Time: ${totalTime}s${colors.reset}`);
  console.log(`${colors.blue}📊 Processed: ${repos.length}/${repos.length} repos${colors.reset}`);
  
  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Failed repositories:${colors.reset}`);
    results.failed.forEach(({ name, reason }) => {
      console.log(`  ${colors.red}•${colors.reset} ${name}: ${colors.dim}${reason}${colors.reset}`);
    });
  }
  
  if (results.skipped.length > 0) {
    console.log(`\n${colors.yellow}Skipped repositories:${colors.reset}`);
    results.skipped.forEach(({ name, reason }) => {
      console.log(`  ${colors.yellow}•${colors.reset} ${name}: ${colors.dim}${reason}${colors.reset}`);
    });
  }

  console.log(`\n${colors.bold}${colors.cyan}${"=".repeat(60)}${colors.reset}\n`);

  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
