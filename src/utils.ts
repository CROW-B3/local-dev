import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "none";

// Cache for package manager detection to avoid redundant filesystem checks
const pmCache = new Map<string, PackageManager>();

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

export const log = {
  info: (msg: string) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
};

export const symbols = { success: "+", error: "x", warning: "!", arrow: ">" };

export const getWorkspaceRoot = (): string => join(process.cwd(), "..");
export const getRepoPath = (repoName: string): string => join(getWorkspaceRoot(), repoName);
export const dirExists = (repoName: string): boolean => existsSync(getRepoPath(repoName));
export const repoExists = (repoName: string): boolean => existsSync(join(getRepoPath(repoName), ".git"));

export const hasUncommittedChanges = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} status --porcelain`.quiet().nothrow();
    return result.stdout.toString().trim().length > 0;
  } catch {
    return false;
  }
};

export const getCurrentBranch = async (repoPath: string): Promise<string> => {
  try {
    const result = await $`git -C ${repoPath} branch --show-current`.quiet().nothrow();
    return result.stdout.toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
};

export const getDefaultBranch = async (repoPath: string): Promise<string> => {
  try {
    const result = await $`git -C ${repoPath} symbolic-ref refs/remotes/origin/HEAD`.quiet().nothrow();
    const output = result.stdout.toString().trim();
    if (output) return output.replace("refs/remotes/origin/", "");
  } catch {}

  try {
    const result = await $`git -C ${repoPath} rev-parse --verify main`.quiet().nothrow();
    if (result.exitCode === 0) return "main";
  } catch {}

  return "main";
};

export const isRemoteEmpty = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} ls-remote --heads origin`.quiet().nothrow();
    return result.exitCode !== 0 || result.stdout.toString().trim().length === 0;
  } catch {
    return true;
  }
};

// Combined git info retrieval to reduce process spawning
export interface GitInfo {
  currentBranch: string;
  hasChanges: boolean;
  isRemoteEmpty: boolean;
  defaultBranch: string;
}

export const getGitInfo = async (repoPath: string): Promise<GitInfo> => {
  try {
    // Get current branch and check for changes in one git call
    const statusResult = await $`git -C ${repoPath} status --porcelain --branch`.quiet().nothrow();
    const statusOutput = statusResult.stdout.toString();
    const lines = statusOutput.split('\n');

    let currentBranch = "unknown";
    let hasChanges = false;

    // First line contains branch info: ## branch-name...tracking
    if (lines[0]) {
      const branchMatch = lines[0].match(/^## ([^\s.]+)/);
      if (branchMatch) {
        currentBranch = branchMatch[1];
      }
      // Any output after first line means there are changes
      hasChanges = lines.slice(1).some(line => line.trim().length > 0);
    }

    // Check if remote is empty
    const remoteResult = await $`git -C ${repoPath} ls-remote --heads origin`.quiet().nothrow();
    const remoteEmpty = remoteResult.exitCode !== 0 || remoteResult.stdout.toString().trim().length === 0;

    // Get default branch
    let defaultBranch = "main";
    try {
      const symbolicResult = await $`git -C ${repoPath} symbolic-ref refs/remotes/origin/HEAD`.quiet().nothrow();
      if (symbolicResult.exitCode === 0) {
        const output = symbolicResult.stdout.toString().trim();
        defaultBranch = output.replace("refs/remotes/origin/", "");
      }
    } catch {
      defaultBranch = "main";
    }

    return {
      currentBranch,
      hasChanges,
      isRemoteEmpty: remoteEmpty,
      defaultBranch,
    };
  } catch {
    return {
      currentBranch: "unknown",
      hasChanges: false,
      isRemoteEmpty: true,
      defaultBranch: "main",
    };
  }
};

export const cloneRepo = async (repoUrl: string, targetPath: string): Promise<boolean> => {
  try {
    const result = await $`git clone ${repoUrl} ${targetPath}`.nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const checkoutBranch = async (repoPath: string, branch: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} checkout ${branch}`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const pullLatest = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} pull`.nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const fetchRemote = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} fetch`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const detectPackageManager = (repoPath: string): PackageManager => {
  // Return cached result if available
  if (pmCache.has(repoPath)) {
    return pmCache.get(repoPath)!;
  }

  let pm: PackageManager;
  if (existsSync(join(repoPath, "bun.lockb")) || existsSync(join(repoPath, "bun.lock"))) {
    pm = "bun";
  } else if (existsSync(join(repoPath, "pnpm-lock.yaml"))) {
    pm = "pnpm";
  } else if (existsSync(join(repoPath, "yarn.lock"))) {
    pm = "yarn";
  } else if (existsSync(join(repoPath, "package-lock.json"))) {
    pm = "npm";
  } else if (existsSync(join(repoPath, "package.json"))) {
    pm = "bun";
  } else {
    pm = "none";
  }

  // Cache the result
  pmCache.set(repoPath, pm);
  return pm;
};

export const runInstall = async (repoPath: string): Promise<boolean> => {
  const pm = detectPackageManager(repoPath);
  const commands: Record<PackageManager, string | null> = {
    bun: "bun install",
    pnpm: "pnpm install",
    yarn: "yarn install",
    npm: "npm install",
    none: null,
  };

  const command = commands[pm];
  if (!command) return true;

  try {
    const result = await $`${{ raw: command }}`.cwd(repoPath).quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const printHeader = (title: string) => {
  console.log(`\n${colors.bold}${colors.cyan}${"=".repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"=".repeat(50)}${colors.reset}\n`);
};

export const hasHusky = (repoPath: string): boolean => {
  return existsSync(join(repoPath, ".husky"));
};

export const initializeHusky = async (repoPath: string): Promise<boolean> => {
  if (!hasHusky(repoPath)) return true; // No husky to initialize

  try {
    const result = await $`bunx husky`.cwd(repoPath).quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const printSummary = (results: { success: string[]; failed: string[]; skipped: string[] }) => {
  console.log(`\n${colors.bold}${"─".repeat(40)}${colors.reset}`);
  console.log(`${colors.bold}  SUMMARY${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);

  if (results.success.length > 0) {
    console.log(`${colors.green}${symbols.success} Success: ${results.success.length}${colors.reset}`);
  }
  if (results.skipped.length > 0) {
    console.log(`${colors.yellow}${symbols.warning} Skipped: ${results.skipped.length}${colors.reset}`);
  }
  if (results.failed.length > 0) {
    console.log(`${colors.red}${symbols.error} Failed: ${results.failed.length}${colors.reset}`);
  }
  console.log("");
};
