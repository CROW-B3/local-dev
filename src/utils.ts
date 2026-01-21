import { $, type Subprocess } from "bun";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "none";

export type TaskStatus = "pending" | "cloning" | "installing" | "husky" | "fetching" | "stashing" | "checkout" | "pulling" | "done" | "skip" | "error";

export interface RepoState {
  name: string;
  status: TaskStatus;
  message?: string;
  pm?: PackageManager;
}

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

const ansi = {
  clearLine: "\x1b[2K",
  cursorUp: (n: number) => `\x1b[${n}A`,
  cursorDown: (n: number) => `\x1b[${n}B`,
  cursorLeft: "\x1b[G",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  saveCursor: "\x1b[s",
  restoreCursor: "\x1b[u",
};

export const symbols = { success: "✓", error: "✗", warning: "⚠", arrow: "›", dot: "·" };

const statusConfig: Record<TaskStatus, { icon: string; color: string; label: string }> = {
  pending: { icon: "○", color: colors.dim, label: "Waiting" },
  cloning: { icon: "", color: colors.blue, label: "Cloning" },
  installing: { icon: "", color: colors.magenta, label: "Installing" },
  husky: { icon: "", color: colors.cyan, label: "Husky" },
  fetching: { icon: "", color: colors.blue, label: "Fetching" },
  stashing: { icon: "", color: colors.yellow, label: "Stashing" },
  checkout: { icon: "", color: colors.cyan, label: "Checkout" },
  pulling: { icon: "", color: colors.blue, label: "Pulling" },
  done: { icon: symbols.success, color: colors.green, label: "Done" },
  skip: { icon: symbols.warning, color: colors.yellow, label: "Skip" },
  error: { icon: symbols.error, color: colors.red, label: "Error" },
};

class Renderer {
  private states: Map<string, RepoState> = new Map();
  private order: string[] = [];
  private spinnerIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastRenderedLines = 0;
  private isTTY = process.stdout.isTTY ?? false;
  private headerLines: string[] = [];

  start() {
    if (!this.isTTY) return;
    process.stdout.write(ansi.hideCursor);
    this.intervalId = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % spinnerFrames.length;
      this.render();
    }, 80);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isTTY) {
      this.render();
      process.stdout.write(ansi.showCursor);
    }
  }

  setHeader(lines: string[]) {
    this.headerLines = lines;
  }

  addRepo(name: string) {
    if (!this.states.has(name)) {
      this.states.set(name, { name, status: "pending" });
      this.order.push(name);
    }
  }

  update(name: string, status: TaskStatus, message?: string, pm?: PackageManager) {
    const state = this.states.get(name);
    if (state) {
      state.status = status;
      state.message = message;
      if (pm) state.pm = pm;
      if (!this.isTTY) {
        this.printNonTTY(state);
      }
    }
  }

  private printNonTTY(state: RepoState) {
    const cfg = statusConfig[state.status];
    const icon = cfg.icon || spinnerFrames[0];
    const msg = state.message ? ` ${state.message}` : "";
    const pmLabel = state.pm && state.pm !== "none" ? ` (${state.pm})` : "";
    console.log(`${cfg.color}${icon}${colors.reset} ${state.name.padEnd(35)} ${cfg.label}${pmLabel}${msg}`);
  }

  private getSpinner(): string {
    return spinnerFrames[this.spinnerIndex];
  }

  private formatLine(state: RepoState): string {
    const cfg = statusConfig[state.status];
    const isActive = ["cloning", "installing", "husky", "fetching", "stashing", "checkout", "pulling"].includes(state.status);
    const icon = isActive ? this.getSpinner() : cfg.icon;
    const nameCol = `${colors.bold}${state.name}${colors.reset}`.padEnd(45);
    const pmLabel = state.pm && state.pm !== "none" ? `${colors.dim}(${state.pm})${colors.reset} ` : "";
    const statusLabel = `${cfg.color}${cfg.label}${colors.reset}`;
    const msg = state.message ? ` ${colors.dim}${state.message}${colors.reset}` : "";
    return `  ${cfg.color}${icon}${colors.reset} ${nameCol} ${pmLabel}${statusLabel}${msg}`;
  }

  render() {
    if (!this.isTTY) return;

    const lines: string[] = [];
    for (const name of this.order) {
      const state = this.states.get(name);
      if (state) lines.push(this.formatLine(state));
    }

    if (this.lastRenderedLines > 0) {
      process.stdout.write(ansi.cursorUp(this.lastRenderedLines) + ansi.cursorLeft);
    }

    for (const line of lines) {
      process.stdout.write(ansi.clearLine + line + "\n");
    }

    this.lastRenderedLines = lines.length;
  }

  printHeader() {
    for (const line of this.headerLines) {
      console.log(line);
    }
  }
}

export const renderer = new Renderer();

export const log = {
  info: (msg: string) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
};

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
    const result = await $`git clone --progress ${repoUrl} ${targetPath}`.quiet().nothrow();
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
    const result = await $`git -C ${repoPath} pull`.quiet().nothrow();
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

export const stashChanges = async (repoPath: string): Promise<boolean> => {
  try {
    const result = await $`git -C ${repoPath} stash push -m "local-dev sync"`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export interface BranchMatchResult {
  exactMatch: string | null;
  partialMatches: string[];
}

export const findMatchingRemoteBranches = async (repoPath: string, searchTerm: string): Promise<BranchMatchResult> => {
  const emptyResult: BranchMatchResult = { exactMatch: null, partialMatches: [] };

  try {
    const result = await $`git -C ${repoPath} ls-remote --heads origin`.quiet().nothrow();
    if (result.exitCode !== 0) return emptyResult;

    const lines = result.stdout.toString().trim().split("\n").filter(Boolean);
    const branches = lines.map(line => line.split("\t")[1]?.replace("refs/heads/", "")).filter(Boolean);
    const searchLower = searchTerm.toLowerCase();

    const exactMatch = branches.find(b => b.toLowerCase() === searchLower) || null;
    if (exactMatch) return { exactMatch, partialMatches: [] };

    const matchedBranches = branches
      .filter(b => b.toLowerCase().includes(searchLower))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower.startsWith(searchLower) && !bLower.startsWith(searchLower)) return -1;
        if (!aLower.startsWith(searchLower) && bLower.startsWith(searchLower)) return 1;
        return a.localeCompare(b);
      });

    return { exactMatch: null, partialMatches: matchedBranches };
  } catch {
    return emptyResult;
  }
};

export const getBranchesWithOpenPRs = async (repoName: string, branches: string[]): Promise<string[]> => {
  if (branches.length === 0) return [];

  try {
    const result = await $`gh pr list --repo CROW-B3/${repoName} --state open --json headRefName`.quiet().nothrow();
    if (result.exitCode !== 0) return branches;

    const prs = JSON.parse(result.stdout.toString()) as { headRefName: string }[];
    const openPRBranches = new Set(prs.map(pr => pr.headRefName));

    const branchesWithPRs = branches.filter(b => openPRBranches.has(b));
    return branchesWithPRs.length > 0 ? branchesWithPRs : branches;
  } catch {
    return branches;
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
  console.log(`\n${colors.bold}${colors.cyan}${"═".repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${"═".repeat(50)}${colors.reset}\n`);
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
  console.log(`${colors.bold}${colors.cyan}  Summary${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(50)}${colors.reset}`);
  if (results.success.length > 0) {
    console.log(`${colors.green}${symbols.success} Success: ${results.success.length}${colors.reset}`);
  }
  if (results.skipped.length > 0) {
    console.log(`${colors.yellow}${symbols.warning} Skipped: ${results.skipped.length}${colors.reset}`);
  }
  if (results.failed.length > 0) {
    console.log(`${colors.red}${symbols.error} Failed: ${results.failed.length}${colors.reset}`);
    results.failed.forEach(name => console.log(`   ${colors.dim}${symbols.dot} ${name}${colors.reset}`));
  }
  console.log("");
};

export const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = (async () => {
      const result = await handler(item);
      results.push(result);
    })();

    const tracked = promise.finally(() => executing.delete(tracked));
    executing.add(tracked);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
};

export interface DevServerResult {
  repoName: string;
  success: boolean;
  error?: string;
}

export const hasDevScript = (repoPath: string): boolean => {
  const packageJsonPath = join(repoPath, "package.json");
  if (!existsSync(packageJsonPath)) return false;
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return Boolean(packageJson.scripts?.dev);
  } catch {
    return false;
  }
};

export const getDevCommand = (repoPath: string): string[] | null => {
  if (!hasDevScript(repoPath)) return null;
  const pm = detectPackageManager(repoPath);
  const commands: Record<PackageManager, string[] | null> = {
    bun: ["bun", "run", "dev"],
    pnpm: ["pnpm", "run", "dev"],
    yarn: ["yarn", "dev"],
    npm: ["npm", "run", "dev"],
    none: null,
  };
  return commands[pm];
};

const needsInstall = (repoPath: string): boolean => {
  const bunLockFiles = ["bun.lockb", "bun.lock"];
  const hasBunLock = bunLockFiles.some(file => existsSync(join(repoPath, file)));
  const hasPnpmLock = existsSync(join(repoPath, "pnpm-lock.yaml"));
  const hasYarnLock = existsSync(join(repoPath, "yarn.lock"));
  const hasNpmLock = existsSync(join(repoPath, "package-lock.json"));

  const hasLockFile = hasBunLock || hasPnpmLock || hasYarnLock || hasNpmLock;
  if (!hasLockFile) return false;

  const nodeModules = join(repoPath, "node_modules");
  return !existsSync(nodeModules);
};

const getInstallCommand = (repoPath: string): string[] | null => {
  const pm = detectPackageManager(repoPath);
  const commands: Record<PackageManager, string[] | null> = {
    bun: ["bun", "install"],
    pnpm: ["pnpm", "install"],
    yarn: ["yarn", "install"],
    npm: ["npm", "install"],
    none: null,
  };
  return commands[pm];
};

const installLinkedDependencies = (repoPath: string): boolean => {
  const packageJsonPath = join(repoPath, "package.json");
  if (!existsSync(packageJsonPath)) return false;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const linkedDeps = Object.entries(deps).filter(([, v]) => typeof v === "string" && (v.startsWith("link:") || v.startsWith("file:")));

    if (linkedDeps.length === 0) return false;

    for (const [, depValue] of linkedDeps) {
      if (typeof depValue === "string" && (depValue.startsWith("link:") || depValue.startsWith("file:"))) {
        const linkedPath = join(repoPath, depValue.replace(/^(link|file):/, ""));
        if (existsSync(linkedPath)) {
          const depRepoName = linkedPath.split(/[\/\\]/).pop() || linkedPath;
          const linkedPackageJsonPath = join(linkedPath, "package.json");

          if (existsSync(linkedPackageJsonPath)) {
            const linkedPackageJson = JSON.parse(readFileSync(linkedPackageJsonPath, "utf-8"));
            const hasBuild = linkedPackageJson.scripts?.build;

            if (needsInstall(linkedPath)) {
              const installCmd = getInstallCommand(linkedPath);
              if (installCmd) {
                log.info(`${colors.cyan}Installing linked dependency${colors.reset} ${colors.dim}[${depRepoName}]${colors.reset}`);
                const isWindows = process.platform === "win32";
                const shellCommand = isWindows ? ["cmd", "/c", installCmd.join(" ")] : ["bash", "-c", installCmd.join(" ")];
                Bun.spawnSync(shellCommand, { cwd: linkedPath });
              }
            }

            if (hasBuild) {
              const linkedPm = detectPackageManager(linkedPath);
              const buildCommands: Record<PackageManager, string[] | null> = {
                bun: ["bun", "run", "build"],
                pnpm: ["pnpm", "run", "build"],
                yarn: ["yarn", "build"],
                npm: ["npm", "run", "build"],
                none: null,
              };
              const buildCmd = buildCommands[linkedPm];
              if (buildCmd) {
                log.info(`${colors.cyan}Building linked dependency${colors.reset} ${colors.dim}[${depRepoName}]${colors.reset}`);
                const isWindows = process.platform === "win32";
                const shellCommand = isWindows ? ["cmd", "/c", buildCmd.join(" ")] : ["bash", "-c", buildCmd.join(" ")];
                const buildResult = Bun.spawnSync(shellCommand, { cwd: linkedPath, stdout: "pipe", stderr: "pipe" });
                if (buildResult.exitCode !== 0) {
                  const stderr = new TextDecoder().decode(buildResult.stderr);
                  log.error(`${colors.red}Build failed for ${depRepoName}:${colors.reset}\n${stderr}`);
                } else {
                  log.info(`${colors.green}Successfully built${colors.reset} ${colors.dim}[${depRepoName}]${colors.reset}`);
                }
              }
            }
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
};

export const startDevServer = (repoPath: string, forceInstall: boolean = false): Subprocess | null => {
  const command = getDevCommand(repoPath);
  if (!command) return null;

  if (forceInstall || needsInstall(repoPath)) {
    const installCmd = getInstallCommand(repoPath);
    if (installCmd) {
      const repoName = repoPath.split(/[\/\\]/).pop() || repoPath;
      log.info(`${colors.cyan}Installing dependencies${colors.reset} ${colors.dim}[${repoName}]${colors.reset}`);
      const isWindows = process.platform === "win32";
      const shellCommand = isWindows ? ["cmd", "/c", installCmd.join(" ")] : ["bash", "-c", installCmd.join(" ")];
      const installResult = Bun.spawnSync(shellCommand, { cwd: repoPath });
      if (installResult.exitCode !== 0) {
        log.error(`Failed to install dependencies in ${repoPath}`);
        return null;
      }
    }
  }

  const hadLinkedDeps = installLinkedDependencies(repoPath);
  if (hadLinkedDeps) {
    const installCmd = getInstallCommand(repoPath);
    if (installCmd) {
      const repoName = repoPath.split(/[\/\\]/).pop() || repoPath;
      log.info(`${colors.cyan}Reinstalling to link dependencies${colors.reset} ${colors.dim}[${repoName}]${colors.reset}`);
      const isWindows = process.platform === "win32";
      const shellCommand = isWindows ? ["cmd", "/c", installCmd.join(" ")] : ["bash", "-c", installCmd.join(" ")];
      Bun.spawnSync(shellCommand, { cwd: repoPath });
    }
  }

  try {
    const isWindows = process.platform === "win32";
    const spawnCommand = isWindows ? ["cmd", "/c", command.join(" ")] : command;
    const repoName = repoPath.split(/[\/\\]/).pop() || repoPath;

    const proc = Bun.spawn(spawnCommand, {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    if (!proc) {
      log.error(`Failed to spawn process for ${repoPath}`);
      return null;
    }

    if (proc.stdout) {
      proc.stdout.pipeTo(new WritableStream({
        write(chunk: Uint8Array) {
          const text = new TextDecoder().decode(chunk);
          text.split("\n").forEach(line => {
            if (line.trim()) console.log(`${colors.dim}[${repoName}]${colors.reset} ${line}`);
          });
        },
      })).catch(() => {});
    }

    if (proc.stderr) {
      proc.stderr.pipeTo(new WritableStream({
        write(chunk: Uint8Array) {
          const text = new TextDecoder().decode(chunk);
          text.split("\n").forEach(line => {
            if (line.trim()) console.log(`${colors.dim}[${repoName}]${colors.reset} ${colors.yellow}${line}${colors.reset}`);
          });
        },
      })).catch(() => {});
    }

    return proc;
  } catch (error) {
    log.error(`Error spawning dev server for ${repoPath}: ${error}`);
    return null;
  }
};

export const killAllDevServers = (processes: Map<string, Subprocess>): void => {
  for (const [, proc] of processes) {
    try {
      proc.kill();
    } catch {}
  }
  processes.clear();
};

export const getDevScriptPort = (repoPath: string): number | null => {
  const packageJsonPath = join(repoPath, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const devScript = packageJson.scripts?.dev as string | undefined;
    if (!devScript) return null;

    const portMatch = devScript.match(/--port\s+(\d+)|:(\d{4,5})\b|-p\s+(\d+)/);
    if (!portMatch) return null;

    return parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10);
  } catch {
    return null;
  }
};
