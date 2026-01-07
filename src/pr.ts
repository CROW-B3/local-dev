#!/usr/bin/env bun

import { $ } from "bun";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getReposToClone } from "../repos.config";
import {
  colors,
  detectPackageManager,
  getCurrentBranch,
  getDefaultBranch,
  getRepoPath,
  getWorkspaceRoot,
  hasUncommittedChanges,
  log,
  printHeader,
  printSummary,
  repoExists,
  symbols,
} from "./utils";

interface PRResult {
  name: string;
  success: boolean;
  skipped: boolean;
  reason?: string;
  prUrl?: string;
}

const createPR = async (
  repoName: string,
  title?: string,
  body?: string,
  draft: boolean = false,
  force: boolean = false
): Promise<PRResult> => {
  const repoPath = getRepoPath(repoName);

  if (!repoExists(repoName)) {
    return { name: repoName, success: false, skipped: true, reason: "Not cloned" };
  }

  const defaultBranch = await getDefaultBranch(repoPath);

  if (force) {
    // Force mode: stash, checkout main, update, create branch, commit, push, PR
    const hasChanges = await hasUncommittedChanges(repoPath);
    if (hasChanges) {
      await $`git -C ${repoPath} stash push -m "local-dev pr --force"`.quiet().nothrow();
    }

    // Checkout to default branch
    const checkoutResult = await $`git -C ${repoPath} checkout ${defaultBranch}`.quiet().nothrow();
    if (checkoutResult.exitCode !== 0) {
      return { name: repoName, success: false, skipped: false, reason: `Checkout ${defaultBranch} failed` };
    }

    // Pull latest
    await $`git -C ${repoPath} pull`.quiet().nothrow();

    // Check if repo uses bun
    const pm = detectPackageManager(repoPath);
    if (pm !== "bun") {
      return { name: repoName, success: false, skipped: true, reason: `Uses ${pm}` };
    }

    // Run bun update
    const updateResult = await $`bun update`.cwd(repoPath).nothrow();
    if (updateResult.exitCode !== 0) {
      return { name: repoName, success: false, skipped: false, reason: "bun update failed" };
    }

    // Check if there are changes
    const hasUpdateChanges = await hasUncommittedChanges(repoPath);
    if (!hasUpdateChanges) {
      return { name: repoName, success: false, skipped: true, reason: "No updates needed" };
    }

    // Create new branch
    const branchName = `chore/update-dependencies-${Date.now()}`;
    const branchResult = await $`git -C ${repoPath} checkout -b ${branchName}`.quiet().nothrow();
    if (branchResult.exitCode !== 0) {
      return { name: repoName, success: false, skipped: false, reason: "Branch creation failed" };
    }

    // Stage and commit changes
    await $`git -C ${repoPath} add .`.nothrow();
    const commitMsg = title || "chore: update dependencies";
    const commitResult = await $`git -C ${repoPath} commit -m ${commitMsg}`.nothrow();
    if (commitResult.exitCode !== 0) {
      return { name: repoName, success: false, skipped: false, reason: "Commit failed" };
    }

    // Push the branch
    const pushResult = await $`git -C ${repoPath} push -u origin ${branchName}`.nothrow();
    if (pushResult.exitCode !== 0) {
      return { name: repoName, success: false, skipped: false, reason: "Push failed" };
    }

    // Create PR
    try {
      const args = ["pr", "create", "--base", defaultBranch];

      if (title) {
        args.push("--title", title);
      } else {
        args.push("--title", "chore: update dependencies");
      }

      if (body) {
        args.push("--body", body);
      } else {
        args.push("--body", "Automated dependency update via bun update");
      }

      if (draft) {
        args.push("--draft");
      }

      const prResult = await $`gh ${args}`.cwd(repoPath).nothrow();

      if (prResult.exitCode === 0) {
        const prUrl = prResult.stdout.toString().trim();
        return { name: repoName, success: true, skipped: false, prUrl };
      } else {
        return { name: repoName, success: false, skipped: false, reason: "PR creation failed" };
      }
    } catch {
      return { name: repoName, success: false, skipped: false, reason: "PR creation failed" };
    }
  } else {
    // Normal mode: check current branch and create PR
    const currentBranch = await getCurrentBranch(repoPath);

    if (currentBranch === defaultBranch) {
      return { name: repoName, success: false, skipped: true, reason: `On ${defaultBranch}` };
    }

    const hasChanges = await hasUncommittedChanges(repoPath);
    if (hasChanges) {
      return { name: repoName, success: false, skipped: true, reason: "Uncommitted changes" };
    }

    // Push the branch to remote
    try {
      const pushResult = await $`git -C ${repoPath} push -u origin ${currentBranch}`.nothrow();
      if (pushResult.exitCode !== 0) {
        return { name: repoName, success: false, skipped: false, reason: "Push failed" };
      }
    } catch {
      return { name: repoName, success: false, skipped: false, reason: "Push failed" };
    }

    // Create PR using gh CLI
    try {
      const args = ["pr", "create", "--base", defaultBranch];

      if (title) {
        args.push("--title", title);
      } else {
        args.push("--fill");
      }

      if (body) {
        args.push("--body", body);
      }

      if (draft) {
        args.push("--draft");
      }

      const prResult = await $`gh ${args}`.cwd(repoPath).nothrow();

      if (prResult.exitCode === 0) {
        const prUrl = prResult.stdout.toString().trim();
        return { name: repoName, success: true, skipped: false, prUrl };
      } else {
        const errorMsg = prResult.stderr.toString().trim();
        if (errorMsg.includes("already exists")) {
          return { name: repoName, success: false, skipped: true, reason: "PR already exists" };
        }
        return { name: repoName, success: false, skipped: false, reason: "PR creation failed" };
      }
    } catch {
      return { name: repoName, success: false, skipped: false, reason: "PR creation failed" };
    }
  }
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("pr")
    .usage("$0 [options]")
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Create PRs in ALL repositories (including optional ones)",
      default: false,
    })
    .option("only", {
      alias: "o",
      type: "array",
      string: true,
      description: "Create PR in only specific repo(s)",
      default: [] as string[],
    })
    .option("title", {
      alias: "t",
      type: "string",
      description: "PR title (uses --fill if not provided)",
    })
    .option("body", {
      alias: "b",
      type: "string",
      description: "PR body/description",
    })
    .option("draft", {
      alias: "d",
      type: "boolean",
      description: "Create as draft PR",
      default: false,
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      description: "Stash changes, checkout main, run bun update, commit, and create PR",
      default: false,
    })
    .example("$0", "Create PRs in all repos (auto-fill title/body)")
    .example("$0 --force", "Update dependencies and create PRs")
    .example("$0 --title 'Fix bug' --body 'Fixes issue #123'", "Create PRs with custom title and body")
    .example("$0 --only core-auth-service", "Create PR in specific repo")
    .example("$0 --draft", "Create draft PRs")
    .help()
    .alias("help", "h")
    .parse();

  const only = argv.only as string[];

  printHeader("Create Pull Requests");

  const workspaceRoot = getWorkspaceRoot();
  log.info(`Workspace: ${colors.yellow}${workspaceRoot}${colors.reset}`);

  if (argv.force) log.warn("Force mode - will update dependencies and create PRs");
  if (argv.draft) log.info("Mode: Draft PRs");

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
  const prUrls: string[] = [];

  for (const repo of repos) {
    process.stdout.write(`${symbols.arrow} ${colors.bold}${repo.name}${colors.reset} `);

    const result = await createPR(repo.name, argv.title, argv.body, argv.draft, argv.force);

    if (result.skipped) {
      console.log(`${colors.yellow}[SKIP]${colors.reset} ${result.reason}`);
      results.skipped.push(repo.name);
    } else if (result.success) {
      console.log(`${colors.green}[OK]${colors.reset} ${result.prUrl}`);
      results.success.push(repo.name);
      if (result.prUrl) prUrls.push(result.prUrl);
    } else {
      console.log(`${colors.red}[FAIL]${colors.reset} ${result.reason}`);
      results.failed.push(repo.name);
    }
  }

  printSummary(results);

  if (prUrls.length > 0) {
    console.log(`${colors.bold}Created PRs:${colors.reset}`);
    prUrls.forEach(url => console.log(`  ${colors.cyan}${url}${colors.reset}`));
    console.log("");
  }

  if (results.failed.length > 0) process.exit(1);
};

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
