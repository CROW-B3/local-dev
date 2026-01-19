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

  const matchLabel = partialMatches.length === 1 ? "1 partial match" : `${partialMatches.length} matches`;
  renderer.update(repoName, "skip", matchLabel);
  return {
    name: repoName,
    success: false,
    skipped: true,
    ambiguous: true,
    candidates: partialMatches,
    reason: matchLabel,
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

  const choices = [
    ...branchesWithPRs.map(branch => ({
      name: branch,
      value: branch,
      description: candidates.length !== branchesWithPRs.length ? "Has open PR" : undefined,
    })),
    {
      name: `${colors.dim}Don't checkout${colors.reset}`,
      value: "__skip__" as const,
      description: "Stay on main",
    },
  ];

  console.log();
  const selected = await select({
    message: `${colors.cyan}${repoName}${colors.reset} - Select branch:`,
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
  console.log(`\n${colors.bold}${"─".repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Dev Servers${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(50)}${colors.reset}`);

  if (started.length > 0) {
    console.log(`${colors.green}${symbols.success} Running: ${started.length}${colors.reset}`);
    for (const server of started) {
      const portLabel = server.port ? ` ${colors.dim}:${server.port}${colors.reset}` : "";
      console.log(`   ${colors.dim}${symbols.dot}${colors.reset} ${server.repoName}${portLabel}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`${colors.yellow}${symbols.warning} Skipped: ${skipped.length} (no dev script)${colors.reset}`);
  }

  console.log(`\n${colors.dim}Press Ctrl+C to stop all servers${colors.reset}\n`);
};

const startDevServersForRepos = async (repoNames: string[]): Promise<void> => {
  log.info(`\n${colors.cyan}Starting dev servers for ${repoNames.length} repo(s)...${colors.reset}`);

  const devProcesses = new Map<string, Subprocess>();
  const startedServers: DevServerInfo[] = [];
  const skippedRepos: string[] = [];

  const cleanup = (): void => {
    console.log(`\n${colors.yellow}Shutting down dev servers...${colors.reset}`);
    killAllDevServers(devProcesses);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  for (const repoName of repoNames) {
    const repoPath = getRepoPath(repoName);
    const proc = startDevServer(repoPath);

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
        log.error(`${name} exited with code ${proc.exitCode}`);
        devProcesses.delete(name);
      }
    }
    if (devProcesses.size === 0) {
      clearInterval(checkInterval);
      log.warn("All dev servers have stopped.");
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
