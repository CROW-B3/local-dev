#!/usr/bin/env bun
/**
 * Clone Script
 *
 * Clones all CROW-B3 repositories to the parent directory.
 * If local-dev is at C:/CROW/local-dev, repos go to C:/CROW/
 *
 * Usage:
 *   bun run clone          # Clone repos marked as cloneByDefault
 *   bun run clone --all    # Clone ALL repos (including optional ones)
 *   bun run clone --help   # Show help
 */

import { getReposToClone, getRepoUrl, getStats } from "../repos.config";
import {
  cloneRepo,
  colors,
  detectPackageManager,
  getRepoPath,
  getWorkspaceRoot,
  log,
  parseArgs,
  printHeader,
  printSummary,
  repoExists,
  runInstall,
  symbols,
} from "./utils";

const showHelp = () => {
  console.log(`
${colors.bold}CROW-B3 Clone Script${colors.reset}

${colors.cyan}USAGE:${colors.reset}
  bun run clone [options]

${colors.cyan}OPTIONS:${colors.reset}
  --all, -a      Clone ALL repositories (including optional ones)
  --help, -h     Show this help message
  --verbose, -v  Show detailed output

${colors.cyan}DESCRIPTION:${colors.reset}
  Clones CROW-B3 repositories to the parent directory.

  ${colors.dim}Example:${colors.reset}
  If local-dev is at ${colors.yellow}C:/CROW/local-dev${colors.reset}
  Repos will be cloned to ${colors.yellow}C:/CROW/*${colors.reset}

${colors.cyan}REPOSITORIES:${colors.reset}
  By default, clones ${colors.green}${getStats().defaultClone}${colors.reset} repositories.
  With --all, clones ${colors.yellow}${getStats().defaultClone + getStats().optional}${colors.reset} repositories.
`);
};

const main = async () => {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  printHeader("CROW-B3 Repository Cloner");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace root: ${colors.yellow}${workspaceRoot}${colors.reset}`);

  const repos = getReposToClone(args.all);
  log.info(`Repositories to clone: ${colors.cyan}${repos.length}${colors.reset}`);
  console.log("");

  const results = {
    success: [] as string[],
    failed: [] as string[],
    skipped: [] as string[],
  };

  for (const repo of repos) {
    const repoPath = getRepoPath(repo.name);
    const repoUrl = getRepoUrl(repo.name);

    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

    if (repoExists(repo.name)) {
      console.log(`${colors.yellow}[SKIP]${colors.reset} Already exists`);
      results.skipped.push(repo.name);
      continue;
    }

    console.log(`${colors.dim}cloning...${colors.reset}`);
    const cloneSuccess = await cloneRepo(repoUrl, repoPath);

    if (!cloneSuccess) {
      log.error(`  Failed to clone ${repo.name}`);
      results.failed.push(repo.name);
      continue;
    }

    const pm = detectPackageManager(repoPath);
    if (pm !== "none") {
      log.dim(`  Package manager: ${pm}`);
      const installSuccess = await runInstall(repoPath);
      if (!installSuccess) {
        log.warn(`  Install failed for ${repo.name}`);
      }
    }

    log.success(`  ${repo.name} cloned successfully`);
    results.success.push(repo.name);
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
