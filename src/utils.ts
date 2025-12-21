/**
 * Shared utilities for local-dev scripts
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "none";

export interface RepoStatus {
  name: string;
  path: string;
  exists: boolean;
  hasChanges: boolean;
  currentBranch: string;
  packageManager: PackageManager;
}

// ═══════════════════════════════════════════════════════════════
// CONSOLE STYLING
// ═══════════════════════════════════════════════════════════════

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
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

export const log = {
  info: (msg: string) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`${colors.cyan}==>${colors.reset} ${msg}`),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
};

export const symbols = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  arrow: "→",
  bullet: "•",
};

// ═══════════════════════════════════════════════════════════════
// PATH UTILITIES
// ═══════════════════════════════════════════════════════════════

export const getWorkspaceRoot = (): string => {
  const localDevPath = process.cwd();
  return join(localDevPath, "..");
};

export const getRepoPath = (repoName: string): string => {
  return join(getWorkspaceRoot(), repoName);
};

export const repoExists = (repoName: string): boolean => {
  const repoPath = getRepoPath(repoName);
  return existsSync(join(repoPath, ".git"));
};

// ═══════════════════════════════════════════════════════════════
// GIT UTILITIES
// ═══════════════════════════════════════════════════════════════

export const hasUncommittedChanges = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} status --porcelain`.quiet().nothrow();
    const output = result.stdout.toString().trim();
    return output.length > 0;
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
    if (output) {
      return output.replace("refs/remotes/origin/", "");
    }
  } catch {
    // Fallback
  }

  try {
    const result = await $`git -C ${repoPath} rev-parse --verify main`.quiet().nothrow();
    if (result.exitCode === 0) return "main";
  } catch {
    // Fallback
  }

  return "main";
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

// ═══════════════════════════════════════════════════════════════
// PACKAGE MANAGER DETECTION
// ═══════════════════════════════════════════════════════════════

export const detectPackageManager = (repoPath: string): PackageManager => {
  if (existsSync(join(repoPath, "bun.lockb")) || existsSync(join(repoPath, "bun.lock"))) {
    return "bun";
  }
  if (existsSync(join(repoPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(repoPath, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(repoPath, "package-lock.json"))) {
    return "npm";
  }
  if (existsSync(join(repoPath, "package.json"))) {
    return "bun";
  }
  return "none";
};

export const getInstallCommand = (pm: PackageManager): string | null => {
  switch (pm) {
    case "bun": return "bun install";
    case "pnpm": return "pnpm install";
    case "yarn": return "yarn install";
    case "npm": return "npm install";
    default: return null;
  }
};

export const runInstall = async (repoPath: string): Promise<boolean> => {
  const pm = detectPackageManager(repoPath);
  const command = getInstallCommand(pm);

  if (!command) {
    return true;
  }

  try {
    log.dim(`  Running ${command}...`);
    const result = await $`${{ raw: command }}`.cwd(repoPath).nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════
// SUMMARY / REPORTING
// ═══════════════════════════════════════════════════════════════

export const printHeader = (title: string) => {
  console.log("");
  console.log(`${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"═".repeat(60)}${colors.reset}`);
  console.log("");
};

export const printSummary = (results: { success: string[]; failed: string[]; skipped: string[] }) => {
  console.log("");
  console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);
  console.log(`${colors.bold}  SUMMARY${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);

  if (results.success.length > 0) {
    console.log(`${colors.green}${symbols.success} Success: ${results.success.length}${colors.reset}`);
    results.success.forEach(r => console.log(`  ${colors.dim}${r}${colors.reset}`));
  }

  if (results.skipped.length > 0) {
    console.log(`${colors.yellow}${symbols.warning} Skipped: ${results.skipped.length}${colors.reset}`);
    results.skipped.forEach(r => console.log(`  ${colors.dim}${r}${colors.reset}`));
  }

  if (results.failed.length > 0) {
    console.log(`${colors.red}${symbols.error} Failed: ${results.failed.length}${colors.reset}`);
    results.failed.forEach(r => console.log(`  ${colors.dim}${r}${colors.reset}`));
  }

  console.log("");
};

// ═══════════════════════════════════════════════════════════════
// ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════

export const parseArgs = () => {
  const args = process.argv.slice(2);
  return {
    all: args.includes("--all") || args.includes("-a"),
    force: args.includes("--force") || args.includes("-f"),
    help: args.includes("--help") || args.includes("-h"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
};
