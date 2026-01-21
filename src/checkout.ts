#!/usr/bin/env bun

import { select } from "@inquirer/prompts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone } from "../repos.config";
import type { Subprocess } from "bun";
import {
  checkoutBranch,
  colors,
  fetchRemote,
  findMatchingRemoteBranches,
  getBranchesWithOpenPRs,
  getCurrentBranch,
  getDefaultBranch,
  getDevScriptPort,
  getRepoPath,
  getWorkspaceRoot,
  hasUncommittedChanges,
  killAllDevServers,
  log,
  printHeader,
  printSummary,
  pullLatest,
  renderer,
  repoExists,
  runWithConcurrency,
  stashChanges,
  startDevServer,
  symbols,
} from "./utils";

interface CheckoutResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
  targetBranch?: string;
  ambiguous?: boolean;
  candidates?: string[];
  checkedOutToFeature: boolean;
}

const prepareRepo = async (repoName: string, targetBranch: string): Promise<CheckoutResult> => {
  const repoPath = getRepoPath(repoName);

  if (!repoExists(repoName)) {
    renderer.update(repoName, "skip", "Not cloned");
    return { name: repoName, success: false, skipped: true, reason: "Not cloned", checkedOutToFeature: false };
  }

  const hasChanges = await hasUncommittedChanges(repoPath);

  if (hasChanges) {
    renderer.update(repoName, "stashing");
    const stashSuccess = await stashChanges(repoPath);
    if (!stashSuccess) {
      renderer.update(repoName, "error", "Stash failed");
      return { name: repoName, success: false, skipped: false, reason: "Stash failed", checkedOutToFeature: false };
    }
  }

  renderer.update(repoName, "fetching");
  await fetchRemote(repoPath);

  const currentBranch = await getCurrentBranch(repoPath);
  const defaultBranch = await getDefaultBranch(repoPath);

  if (currentBranch !== defaultBranch) {
    renderer.update(repoName, "checkout", defaultBranch);
    const checkoutMainSuccess = await checkoutBranch(repoPath, defaultBranch);
    if (!checkoutMainSuccess) {
      renderer.update(repoName, "error", `Checkout ${defaultBranch} failed`);
      return { name: repoName, success: false, skipped: false, reason: `Checkout ${defaultBranch} failed`, checkedOutToFeature: false };
    }
  }

  const { exactMatch, partialMatches } = await findMatchingRemoteBranches(repoPath, targetBranch);

  if (exactMatch) {
    return checkoutAndPull(repoName, exactMatch);
  }

  if (partialMatches.length === 1) {
    return checkoutAndPull(repoName, partialMatches[0]);
  }

  if (partialMatches.length === 0) {
    renderer.update(repoName, "pulling");
    const pullSuccess = await pullLatest(repoPath);
    if (!pullSuccess) {
      renderer.update(repoName, "error", "Pull failed");
      return { name: repoName, success: false, skipped: false, reason: "Pull failed", checkedOutToFeature: false };
    }
    renderer.update(repoName, "done", `${defaultBranch} (no match)`);
    return { name: repoName, success: true, skipped: false, targetBranch: defaultBranch, checkedOutToFeature: false };
  }

  renderer.update(repoName, "skip", `${partialMatches.length} matches`);
  return {
    name: repoName,
    success: false,
    skipped: true,
    ambiguous: true,
    candidates: partialMatches,
    reason: `${partialMatches.length} matches`,
    checkedOutToFeature: false,
  };
};

const checkoutAndPull = async (repoName: string, branch: string): Promise<CheckoutResult> => {
  const repoPath = getRepoPath(repoName);

  renderer.update(repoName, "checkout", branch);
  const checkoutSuccess = await checkoutBranch(repoPath, branch);
  if (!checkoutSuccess) {
    renderer.update(repoName, "error", `Checkout ${branch} failed`);
    return { name: repoName, success: false, skipped: false, reason: `Checkout ${branch} failed`, checkedOutToFeature: false };
  }

  renderer.update(repoName, "pulling");
  const pullSuccess = await pullLatest(repoPath);
  if (!pullSuccess) {
    renderer.update(repoName, "error", "Pull failed");
    return { name: repoName, success: false, skipped: false, reason: "Pull failed", checkedOutToFeature: false };
  }

  renderer.update(repoName, "done", branch);
  return { name: repoName, success: true, skipped: false, targetBranch: branch, checkedOutToFeature: true };
};

const resolveAmbiguousRepo = async (
  repoName: string,
  candidates: string[]
): Promise<CheckoutResult> => {
  const branchesWithPRs = await getBranchesWithOpenPRs(repoName, candidates);
  const branchesWithoutPRs = candidates.filter(b => !branchesWithPRs.includes(b));

  const choices = [
    ...branchesWithPRs.map(branch => ({
      name: branch,
      value: branch,
      description: `${colors.green}● Open PR${colors.reset}`,
    })),
    ...branchesWithoutPRs.map(branch => ({
      name: branch,
      value: branch,
      description: `${colors.dim}No PR${colors.reset}`,
    })),
    {
      name: `${colors.dim}Don't checkout${colors.reset}`,
      value: "__skip__" as const,
      description: "Stay on main",
    },
  ];

  console.log();
  const selected = await select({
    message: `${colors.cyan}${repoName}${colors.reset} - Multiple matches found. Select branch:`,
    choices,
  });

  if (selected === "__skip__") {
    return { name: repoName, success: true, skipped: true, reason: "User skipped", checkedOutToFeature: false };
  }

  return checkoutAndPull(repoName, selected);
};

interface DevServerInfo {
  repoName: string;
  port: number | null;
  process: Subprocess;
}

const printDevServerSummary = (started: DevServerInfo[], skipped: string[]): void => {
  console.log(`\n${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  🚀 Dev Servers Running${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}\n`);

  if (started.length > 0) {
    console.log(`${colors.green}${symbols.success} ${started.length} server${started.length !== 1 ? "s" : ""} started${colors.reset}\n`);
    for (const server of started) {
      const url = server.port ? `http://localhost:${server.port}` : "no port";
      const portDisplay = server.port
        ? `${colors.magenta}:${server.port}${colors.reset}`
        : `${colors.dim}(no port)${colors.reset}`;
      const paddedName = server.repoName.padEnd(35);
      console.log(`  ${colors.green}●${colors.reset} ${colors.bold}${paddedName}${colors.reset} → ${colors.blue}${url}${colors.reset}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n${colors.yellow}${symbols.warning} ${skipped.length} skipped (no dev script)${colors.reset}`);
    for (const repo of skipped) {
      console.log(`  ${colors.dim}○ ${repo}${colors.reset}`);
    }
  }

  console.log(`\n${colors.bold}${colors.cyan}${"─".repeat(60)}${colors.reset}`);
  console.log(`${colors.yellow}⏸  ${colors.bold}Press Ctrl+C${colors.reset}${colors.yellow} to stop all servers${colors.reset}`);
  console.log(`${colors.cyan}📝 ${colors.bold}Logs${colors.reset}${colors.cyan} are displayed above${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"─".repeat(60)}${colors.reset}\n`);
};

const startDevServersForRepos = async (repoNames: string[]): Promise<void> => {
  console.log(`\n${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  🔧 Setting up Dev Servers${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}\n`);
  log.info(`Starting dev servers for ${colors.yellow}${repoNames.length} repo(s)${colors.reset}...\n`);

  const devProcesses = new Map<string, Subprocess>();
  const startedServers: DevServerInfo[] = [];
  const skippedRepos: string[] = [];

  const cleanup = (): void => {
    console.log(`\n${colors.yellow}${symbols.warning} Shutting down dev servers...${colors.reset}`);
    killAllDevServers(devProcesses);
    console.log(`${colors.green}${symbols.success} All dev servers stopped.${colors.reset}\n`);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  for (const repoName of repoNames) {
    const repoPath = getRepoPath(repoName);
    const proc = startDevServer(repoPath, true);

    if (proc) {
      devProcesses.set(repoName, proc);
      const port = getDevScriptPort(repoPath);
      startedServers.push({ repoName, port, process: proc });
    } else {
      skippedRepos.push(repoName);
    }
  }

  printDevServerSummary(startedServers, skippedRepos);

  if (devProcesses.size === 0) {
    log.warn("No dev servers to run.");
    return;
  }

  const checkInterval = setInterval(() => {
    for (const [name, proc] of devProcesses) {
      if (proc.exitCode !== null) {
        console.log(`\n${colors.red}${symbols.error} ${name} exited with code ${proc.exitCode}${colors.reset}`);
        devProcesses.delete(name);
      }
    }
    if (devProcesses.size === 0) {
      clearInterval(checkInterval);
      console.log(`\n${colors.red}${symbols.error} All dev servers have stopped.${colors.reset}`);
      process.exit(1);
    }
  }, 2000);

  await new Promise(() => {});
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("checkout")
    .usage("$0 <branch> [options]")
    .positional("branch", {
      type: "string",
      description: "Branch name to checkout",
    })
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Include ALL repositories (including optional ones)",
      default: false,
    })
    .option("only", {
      alias: "o",
      type: "array",
      string: true,
      description: "Checkout only specific repo(s)",
      default: [] as string[],
    })
    .option("start", {
      alias: "s",
      type: "boolean",
      description: "Start dev servers for repos that checked out to feature branch",
      default: false,
    })
    .example("$0 CROW-156", "Checkout CROW-156 branch across all repos")
    .example("$0 CROW-156 --start", "Checkout and start dev servers")
    .example("$0 CROW-156 --only core-auth-service", "Checkout specific repo")
    .help()
    .alias("help", "h")
    .parse();

  const targetBranch = argv._[0] as string | undefined;

  if (!targetBranch) {
    log.error("Branch name is required. Usage: bun run checkout <branch>");
    process.exit(1);
  }

  const only = argv.only as string[];

  printHeader("Checkout");

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

  log.info(`Target branch: ${colors.cyan}${targetBranch}${colors.reset}`);
  log.info(`Repositories: ${colors.cyan}${repos.length}${colors.reset}\n`);

  const results = { success: [] as string[], failed: [] as string[], skipped: [] as string[] };
  const featureBranchRepos: string[] = [];
  const ambiguousResults: CheckoutResult[] = [];
  const CHECKOUT_CONCURRENCY = 5;
  const shouldStartDevServers = argv.start;

  for (const repo of repos) {
    renderer.addRepo(repo.name);
  }

  renderer.start();

  try {
    const checkoutResults = await runWithConcurrency(repos, CHECKOUT_CONCURRENCY, async repo => {
      return prepareRepo(repo.name, targetBranch);
    });

    for (const result of checkoutResults) {
      if (result.ambiguous && result.candidates) {
        ambiguousResults.push(result);
      } else if (result.skipped) {
        results.skipped.push(result.name);
      } else if (result.success) {
        results.success.push(result.name);
        if (result.checkedOutToFeature) featureBranchRepos.push(result.name);
      } else {
        results.failed.push(result.name);
      }
    }
  } finally {
    renderer.stop();
  }

  if (ambiguousResults.length > 0) {
    log.info(`\n${colors.yellow}${ambiguousResults.length} repo(s) have multiple matching branches:${colors.reset}\n`);

    for (const ambiguous of ambiguousResults) {
      try {
        const resolvedResult = await resolveAmbiguousRepo(ambiguous.name, ambiguous.candidates!);
        if (resolvedResult.skipped) {
          results.skipped.push(resolvedResult.name);
        } else if (resolvedResult.success) {
          results.success.push(resolvedResult.name);
          if (resolvedResult.checkedOutToFeature) featureBranchRepos.push(resolvedResult.name);
        } else {
          results.failed.push(resolvedResult.name);
        }
      } catch (err) {
        if ((err as Error).name === "ExitPromptError") {
          results.skipped.push(ambiguous.name);
        } else {
          results.failed.push(ambiguous.name);
        }
      }
    }
  }

  printSummary(results);

  if (shouldStartDevServers && featureBranchRepos.length > 0) {
    await startDevServersForRepos(featureBranchRepos);
  }

  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  renderer.stop();
  if (err.name === "ExitPromptError") {
    log.warn("Cancelled.\n");
    process.exit(0);
  }
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
