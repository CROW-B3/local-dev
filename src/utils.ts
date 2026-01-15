import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "none";

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

const getSymbolicRefBranch = async (repoPath: string): Promise<string | null> => {
  try {
    const result = await $`git -C ${repoPath} symbolic-ref refs/remotes/origin/HEAD`.quiet().nothrow();
    const output = result.stdout.toString().trim();
    if (output) return output.replace("refs/remotes/origin/", "");
  } catch {}
  return null;
};

const getMainBranchIfExists = async (repoPath: string): Promise<string | null> => {
  try {
    const result = await $`git -C ${repoPath} rev-parse --verify main`.quiet().nothrow();
    if (result.exitCode === 0) return "main";
  } catch {}
  return null;
};

export const getDefaultBranch = async (repoPath: string): Promise<string> => {
  const symbolicRefBranch = await getSymbolicRefBranch(repoPath);
  if (symbolicRefBranch) return symbolicRefBranch;

  const mainBranch = await getMainBranchIfExists(repoPath);
  if (mainBranch) return mainBranch;

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

const getPackageManagerByLockFile = (repoPath: string): PackageManager | null => {
  const bunLockFiles = ["bun.lockb", "bun.lock"];
  const hasBunLock = bunLockFiles.some(file => existsSync(join(repoPath, file)));
  if (hasBunLock) return "bun";

  if (existsSync(join(repoPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(repoPath, "package-lock.json"))) return "npm";

  return null;
};

export const detectPackageManager = (repoPath: string): PackageManager => {
  const detected = getPackageManagerByLockFile(repoPath);
  if (detected) return detected;

  if (existsSync(join(repoPath, "package.json"))) return "bun";
  return "none";
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
  if (!hasHusky(repoPath)) return true;

  try {
    const result = await $`bunx husky`.cwd(repoPath).quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const printSummary = (results: { success: string[]; failed: string[]; skipped: string[] }) => {
  console.log(`\n${colors.bold}${"─".repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  SUMMARY${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(50)}${colors.reset}`);

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

export const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = handler(item).then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
};
