import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm" | "none";

export interface ResultDetail {
  name: string;
  reason?: string;
}

// Cache for package manager detection to avoid redundant filesystem checks
const pmCache = new Map<string, PackageManager>();

// Concurrency queue to limit parallel operations
export const withConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  limit: number = 5
): Promise<T[]> => {
  const results: T[] = [];
  const executing: Set<{ resolve: (value: T) => void, reject: (error: any) => void, promise: Promise<void> }> = new Set();

  const executeTask = (task: () => Promise<T>, index: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const wrapper = Promise.resolve().then(task).then(result => {
        results.push(result);
        resolve(result);
      }).catch(reject);

      // Wait for this task to complete before resolving the wrapper
      wrapper.then(() => {
        // Find and remove this task from executing set
        for (const item of executing) {
          if (item.promise === wrapper) {
            executing.delete(item);
            break;
          }
        }
      }).catch(() => {
        // Also remove on error
        for (const item of executing) {
          if (item.promise === wrapper) {
            executing.delete(item);
            break;
          }
        }
      });

      const promiseWrapper = wrapper as Promise<void>;
      executing.add({ resolve, reject, promise: promiseWrapper });
    });
  };

  // Process tasks in batches respecting the limit
  for (let i = 0; i < tasks.length; i++) {
    // If we've reached the limit, wait for one to finish before starting the next
    if (executing.size >= limit) {
      await Promise.race(Array.from(executing).map(item => item.promise));
    }
    
    // Start the next task
    executeTask(tasks[i], i);
  }

  // Wait for all remaining tasks to complete
  await Promise.all(Array.from(executing).map(item => item.promise));
  
  return results;
};

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

// Progress output utilities for aligned status displays
export const formatProgressLine = (status: string, repoName: string): string => {
  return `${status}  ${repoName}`;
};

// Display queue to ensure each repo's progress shows sequentially
let displayQueue = Promise.resolve();

const writeAsync = (text: string): Promise<void> => {
  return new Promise<void>((resolve) => {
    process.stdout.write(text, () => resolve());
  });
};

export class ProgressDisplay {
  private queue = Promise.resolve();
  private repoName: string = "";
  private startTime: number = Date.now();
  private isActive: boolean = false;
  private linePosition: number = 0;
  private hasWrittenLine: boolean = false;

  async init(text: string, repoName: string = "", linePosition: number = 0): Promise<void> {
    this.repoName = repoName;
    this.startTime = Date.now();
    this.linePosition = linePosition;
    this.isActive = true;
    this.hasWrittenLine = false;
    await this.queue;
  }

  async update(status: string, step?: string, progress?: number): Promise<void> {
    if (!this.isActive) return;
    
    await this.queue;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const progressStr = progress !== undefined ? ` ${Math.round(progress * 100)}%` : "";
    const stepStr = step ? ` ${colors.dim}[${step}]${colors.reset}` : "";
    const timeStr = `${colors.dim}(${elapsed}s)${colors.reset}`;
    const text = `\r\x1b[K${status}${stepStr}${progressStr} ${timeStr}`;
    this.queue = writeAsync(text);
    await this.queue;
  }

  async updateWithRepo(repoName: string, status: string, step?: string, progress?: number): Promise<void> {
    if (!this.isActive) return;
    
    await this.queue;
    
    // Only write newline once when we first start updating this repo
    if (!this.hasWrittenLine) {
      this.queue = writeAsync(`\n`);
      this.hasWrittenLine = true;
      await this.queue;
    }
    
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const progressStr = progress !== undefined ? ` ${Math.round(progress * 100)}%` : "";
    const stepStr = step ? ` ${colors.dim}[${step}]${colors.reset}` : "";
    const timeStr = `${colors.dim}(${elapsed}s)${colors.reset}`;
    
    // Pad repo name for alignment
    const paddedRepoName = repoName.padEnd(30);
    const text = `\r\x1b[K${status}  ${paddedRepoName}${stepStr}${progressStr} ${timeStr}`;
    this.queue = writeAsync(text);
    await this.queue;
  }

  async finalize(status: string, repoName: string = "", success: boolean = true): Promise<void> {
    if (!this.isActive) return;
    
    await this.queue;
    this.isActive = false;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const timeStr = `${colors.dim}(${elapsed}s)${colors.reset}`;
    const finalRepoName = repoName || this.repoName;
    const paddedRepoName = finalRepoName.padEnd(30);
    
    // If we never wrote a line for this repo, write it now
    if (!this.hasWrittenLine) {
      const text = `\n\r\x1b[K${status}  ${paddedRepoName} ${timeStr}\n`;
      this.queue = writeAsync(text);
    } else {
      const text = `\r\x1b[K${status}  ${paddedRepoName} ${timeStr}\n`;
      this.queue = writeAsync(text);
    }
    
    await this.queue;
  }

  getElapsedTime(): string {
    return ((Date.now() - this.startTime) / 1000).toFixed(1);
  }

  setActive(active: boolean): void {
    this.isActive = active;
  }
}

export const initLine = (text: string): void => {
  displayQueue = displayQueue.then(() => writeAsync(`\n${text}`));
};

export const updateLine = (text: string): void => {
  displayQueue = displayQueue.then(() => writeAsync(`\r\x1b[K${text}`));
};

export const finalizeLine = (text: string): void => {
  displayQueue = displayQueue.then(() => writeAsync(`\r\x1b[K${text}\n`));
};

export const flushWrites = (): Promise<void> => {
  return displayQueue;
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
    // Run all git operations in parallel instead of sequential
    const [statusResult, remoteResult, symbolicResult] = await Promise.all([
      $`git -C ${repoPath} status --porcelain --branch`.quiet().nothrow(),
      $`git -C ${repoPath} ls-remote --heads origin`.quiet().nothrow(),
      $`git -C ${repoPath} symbolic-ref refs/remotes/origin/HEAD`.quiet().nothrow(),
    ]);

    // Parse status output for current branch and changes
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
    const remoteEmpty = remoteResult.exitCode !== 0 || remoteResult.stdout.toString().trim().length === 0;

    // Get default branch from symbolic ref
    let defaultBranch = "main";
    if (symbolicResult.exitCode === 0) {
      const output = symbolicResult.stdout.toString().trim();
      defaultBranch = output.replace("refs/remotes/origin/", "");
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
    // Use --depth 1 for faster cloning of latest commit only
    const result = await $`git clone --depth 1 ${repoUrl} ${targetPath}`.quiet().nothrow();
    return result.exitCode === 0;
  } catch (error) {
    log.error(`Clone error for ${repoUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    bun: "bun install --frozen-lockfile",
    pnpm: "pnpm install --frozen-lockfile",
    yarn: "yarn install --frozen-lockfile",
    npm: "npm ci",
    none: null,
  };

  const command = commands[pm];
  if (!command) return true;

  try {
    const result = await $`${{ raw: command }}`.cwd(repoPath).quiet().nothrow();
    if (result.exitCode !== 0) {
      // Fallback to regular install if ci/frozen-lockfile fails
      const fallbackCommands: Record<PackageManager, string> = {
        bun: "bun install",
        pnpm: "pnpm install",
        yarn: "yarn install",
        npm: "npm install",
        none: "",
      };
      const fallbackResult = await $`${{ raw: fallbackCommands[pm] }}`.cwd(repoPath).quiet().nothrow();
      return fallbackResult.exitCode === 0;
    }
    return true;
  } catch (error) {
    log.error(`Install error for ${repoPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const result = await $`bunx husky install`.cwd(repoPath).quiet().nothrow();
    return result.exitCode === 0;
  } catch (error) {
    log.error(`Husky init error for ${repoPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};

export const printSummary = (results: {
  success: string[];
  failed: ResultDetail[];
  skipped: ResultDetail[];
}) => {
  console.log(`\n${colors.bold}${"─".repeat(40)}${colors.reset}`);
  console.log(`${colors.bold}  SUMMARY${colors.reset}`);
  console.log(`${colors.bold}${"─".repeat(40)}${colors.reset}`);

  if (results.success.length > 0) {
    console.log(`${colors.green}${symbols.success} Success: ${results.success.length}${colors.reset}`);
  }
  if (results.skipped.length > 0) {
    console.log(`${colors.yellow}${symbols.warning} Skipped: ${results.skipped.length}${colors.reset}`);
    results.skipped.forEach(({ name, reason }) => {
      log.dim(`  ${name}: ${reason}`);
    });
  }
  if (results.failed.length > 0) {
    console.log(`${colors.red}${symbols.error} Failed: ${results.failed.length}${colors.reset}`);
    results.failed.forEach(({ name, reason }) => {
      log.dim(`  ${name}: ${reason}`);
    });
  }
  console.log("");
};

// ═════════════════════════════════════════════════════════════════════════
// PHASE 3: ADVANCED UTILITIES FOR ULTRA-OPTIMIZATION
// ═════════════════════════════════════════════════════════════════════════

export interface ConcurrencyOptions {
  limit: number;
  timeout?: number;
  onError?: (error: Error, taskIndex: number) => void;
}

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs?: number;
}

// Advanced concurrency control with timeout and error handling
export const withAdvancedConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  options: ConcurrencyOptions
): Promise<T[]> => {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const promise = Promise.resolve()
      .then(() => {
        let taskPromise = Promise.resolve(task());

        if (options.timeout) {
          taskPromise = Promise.race([
            taskPromise,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error(`Task timeout after ${options.timeout}ms`)), options.timeout)
            ),
          ]);
        }

        return taskPromise;
      })
      .then(result => {
        results[i] = result;
      })
      .catch(error => {
        if (options.onError) {
          options.onError(error, i);
        }
        results[i] = undefined as any;
      })
      .then(() => {
        executing.delete(promise);
      });

    executing.add(promise);

    if (executing.size >= options.limit) {
      await Promise.race(Array.from(executing));
    }
  }

  await Promise.all(executing);
  return results;
};

// Retry mechanism with exponential backoff
export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<{ success: boolean; result?: T; error?: Error; attempts: number }> => {
  let lastError: Error | undefined;
  let delay = options.delayMs;
  const maxDelay = options.maxDelayMs || 30000;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      const result = await operation();
      return { success: true, result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < options.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, maxDelay)));
        delay *= options.backoffMultiplier;
      }
    }
  }

  return { success: false, error: lastError, attempts: options.maxRetries };
};

// Performance monitoring and metrics collection
export class PerformanceTracker {
  private operations: Map<string, { startTime: number; endTime?: number; duration?: number }> = new Map();
  private startTime: number = Date.now();

  startOperation(name: string): void {
    this.operations.set(name, { startTime: Date.now() });
  }

  endOperation(name: string): number {
    const op = this.operations.get(name);
    if (!op) {
      log.warn(`Operation "${name}" was not started`);
      return 0;
    }

    const endTime = Date.now();
    const duration = endTime - op.startTime;
    op.endTime = endTime;
    op.duration = duration;

    return duration;
  }

  getMetrics(): {
    totalTime: number;
    operationCount: number;
    operations: Record<string, { duration: number; percentage: number }>;
    averageOperationTime: number;
  } {
    const totalTime = Date.now() - this.startTime;
    const operations: Record<string, { duration: number; percentage: number }> = {};

    for (const [name, op] of this.operations.entries()) {
      if (op.duration) {
        operations[name] = {
          duration: op.duration,
          percentage: (op.duration / totalTime) * 100,
        };
      }
    }

    const completedOps = Object.values(operations);
    const averageOperationTime = completedOps.length > 0
      ? completedOps.reduce((sum, op) => sum + op.duration, 0) / completedOps.length
      : 0;

    return {
      totalTime,
      operationCount: this.operations.size,
      operations,
      averageOperationTime: Math.round(averageOperationTime),
    };
  }

  printSummary(): void {
    const metrics = this.getMetrics();

    log.info(`\n${colors.bold}Performance Summary${colors.reset}`);
    log.info(`Total Time: ${(metrics.totalTime / 1000).toFixed(2)}s`);
    log.info(`Operations: ${metrics.operationCount}`);
    log.info(`Average Per Op: ${(metrics.averageOperationTime / 1000).toFixed(2)}s\n`);

    const sorted = Object.entries(metrics.operations)
      .sort((a, b) => b[1].duration - a[1].duration)
      .slice(0, 5);

    if (sorted.length > 0) {
      log.info(`Top Operations:`);
      sorted.forEach(([name, op]) => {
        const percentage = Math.round(op.percentage);
        log.dim(`  ${name}: ${(op.duration / 1000).toFixed(2)}s (${percentage}%)`);
      });
    }
  }
}

// Batch processing utility for handling large arrays efficiently
export const processBatch = async <T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 50
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }

  return results;
};

// Debounce utility for rate limiting operations
export const debounce = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  delayMs: number
): (...args: T) => Promise<R> => {
  let timeout: NodeJS.Timeout | null = null;
  let lastResult: Promise<R> | null = null;

  return (...args: T) => {
    return new Promise<R>((resolve, reject) => {
      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(async () => {
        try {
          const result = await fn(...args);
          lastResult = Promise.resolve(result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  };
};

// Rate limiter for API calls
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number = Date.now();
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number = 10, refillRate: number = 5) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  async acquire(tokensNeeded: number = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        return;
      }

      const waitTime = ((tokensNeeded - this.tokens) / this.refillRate) * 1000;
      await new Promise(resolve => setTimeout(resolve, Math.ceil(waitTime)));
    }
  }
}

// Timeout wrapper for async operations
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Operation timed out"
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
};

// Chain multiple retryable operations
export const chainWithRetry = async <T>(
  operations: Array<() => Promise<T>>,
  retryOptions: RetryOptions
): Promise<T[]> => {
  const results: T[] = [];

  for (const operation of operations) {
    const result = await withRetry(operation, retryOptions);

    if (!result.success) {
      throw result.error || new Error("Operation failed");
    }

    results.push(result.result!);
  }

  return results;
};

// ═════════════════════════════════════════════════════════════════════════
// PHASE 4: ENHANCED UX, SAFETY & REPORTING FEATURES
// ═════════════════════════════════════════════════════════════════════════

// Operation audit logging for tracking changes
export interface AuditLogEntry {
  timestamp: number;
  operation: string;
  status: "success" | "failure" | "skipped";
  resource: string;
  details?: Record<string, any>;
}

export class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private filename?: string;

  constructor(filename?: string) {
    this.filename = filename;
  }

  log(operation: string, resource: string, status: "success" | "failure" | "skipped", details?: Record<string, any>): void {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      operation,
      status,
      resource,
      details,
    };
    this.entries.push(entry);
  }

  async export(): Promise<string> {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        entries: this.entries,
        summary: {
          total: this.entries.length,
          success: this.entries.filter(e => e.status === "success").length,
          failures: this.entries.filter(e => e.status === "failure").length,
          skipped: this.entries.filter(e => e.status === "skipped").length,
        },
      },
      null,
      2
    );
  }

  getStats(): { success: number; failure: number; skipped: number } {
    return {
      success: this.entries.filter(e => e.status === "success").length,
      failure: this.entries.filter(e => e.status === "failure").length,
      skipped: this.entries.filter(e => e.status === "skipped").length,
    };
  }
}

// Safety validation utilities
export interface ValidationRule {
  name: string;
  validate: (value: any) => boolean;
  message: string;
}

export const safetyValidator = {
  // Prevent dangerous operations
  isDangerousOperation: (operation: string, resource: string): boolean => {
    const dangerous = ["delete-all", "wipe-production", "drop-database"];
    return dangerous.some(d => operation.toLowerCase().includes(d) && resource.includes("prod"));
  },

  // Validate resource names don't contain suspicious patterns
  validateResourceName: (name: string): { valid: boolean; error?: string } => {
    if (!name || name.length === 0) {
      return { valid: false, error: "Resource name cannot be empty" };
    }
    if (name.length > 255) {
      return { valid: false, error: "Resource name too long" };
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) {
      return { valid: false, error: "Resource name contains invalid characters" };
    }
    return { valid: true };
  },

  // Check if operation requires additional confirmation
  requiresConfirmation: (envType: "production" | "dev" | "local"): boolean => {
    return envType === "production";
  },
};

// Report generation and export
export interface ExecutionReport {
  timestamp: string;
  scriptName: string;
  totalDuration: number;
  status: "success" | "partial" | "failure";
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  details: Array<{
    name: string;
    status: "success" | "failure" | "skipped";
    duration: number;
    error?: string;
  }>;
}

export const reportGenerator = {
  generateJSON: (report: ExecutionReport): string => {
    return JSON.stringify(report, null, 2);
  },

  generateMarkdown: (report: ExecutionReport): string => {
    const lines: string[] = [];

    lines.push(`# Execution Report\n`);
    lines.push(`**Generated:** ${report.timestamp}`);
    lines.push(`**Script:** ${report.scriptName}`);
    lines.push(`**Status:** ${report.status}`);
    lines.push(`**Duration:** ${(report.totalDuration / 1000).toFixed(2)}s\n`);

    lines.push(`## Summary\n`);
    lines.push(`- **Total:** ${report.summary.total}`);
    lines.push(`- **Succeeded:** ${colors.green}${report.summary.succeeded}${colors.reset}`);
    lines.push(`- **Failed:** ${colors.red}${report.summary.failed}${colors.reset}`);
    lines.push(`- **Skipped:** ${colors.yellow}${report.summary.skipped}${colors.reset}\n`);

    lines.push(`## Details\n`);
    for (const detail of report.details) {
      const icon = detail.status === "success" ? "✅" : detail.status === "failure" ? "❌" : "⏭️";
      lines.push(`${icon} **${detail.name}** (${(detail.duration / 1000).toFixed(2)}s)`);
      if (detail.error) {
        lines.push(`   - Error: ${detail.error}`);
      }
    }

    return lines.join("\n");
  },
};

// Interactive menu builder for better UX
export class InteractiveMenu {
  private title: string;
  private items: Array<{ label: string; value: any; description?: string }> = [];

  constructor(title: string) {
    this.title = title;
  }

  addItem(label: string, value: any, description?: string): this {
    this.items.push({ label, value, description });
    return this;
  }

  printMenu(): void {
    log.info(`\n${colors.bold}${colors.cyan}${this.title}${colors.reset}`);
    log.info(`${colors.cyan}${"─".repeat(this.title.length)}${colors.reset}\n`);

    this.items.forEach((item, index) => {
      log.info(`${colors.bold}${index + 1}.${colors.reset} ${item.label}`);
      if (item.description) {
        log.dim(`   ${item.description}`);
      }
    });

    log.info("");
  }
}

// Trend analysis for performance tracking
export class TrendAnalyzer {
  private dataPoints: Array<{ timestamp: number; value: number }> = [];

  addDataPoint(value: number): void {
    this.dataPoints.push({ timestamp: Date.now(), value });
  }

  getAverage(): number {
    if (this.dataPoints.length === 0) return 0;
    return this.dataPoints.reduce((sum, dp) => sum + dp.value, 0) / this.dataPoints.length;
  }

  getMax(): number {
    return Math.max(...this.dataPoints.map(dp => dp.value), 0);
  }

  getMin(): number {
    return Math.min(...this.dataPoints.map(dp => dp.value), Infinity);
  }

  getTrend(): "improving" | "degrading" | "stable" {
    if (this.dataPoints.length < 2) return "stable";

    const recent = this.dataPoints.slice(-5);
    const older = this.dataPoints.slice(0, Math.max(1, this.dataPoints.length - 5));

    const recentAvg = recent.reduce((sum, dp) => sum + dp.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, dp) => sum + dp.value, 0) / older.length;

    const changePercent = ((olderAvg - recentAvg) / olderAvg) * 100;

    if (changePercent > 5) return "improving";
    if (changePercent < -5) return "degrading";
    return "stable";
  }

  printAnalysis(label: string): void {
    const avg = this.getAverage();
    const max = this.getMax();
    const min = this.getMin();
    const trend = this.getTrend();

    log.info(`\n${colors.bold}Trend Analysis: ${label}${colors.reset}`);
    log.info(`Average: ${(avg / 1000).toFixed(2)}s`);
    log.info(`Range: ${(min / 1000).toFixed(2)}s - ${(max / 1000).toFixed(2)}s`);

    const trendIcon = trend === "improving" ? "📈" : trend === "degrading" ? "📉" : "➡️";
    log.info(`Trend: ${trendIcon} ${trend}`);
  }
}

// Safe execution wrapper with rollback capability
export interface RollbackPoint {
  id: string;
  timestamp: number;
  description: string;
}

export class SafeExecutor {
  private rollbackPoints: RollbackPoint[] = [];
  private executionLog: Array<{ operation: string; success: boolean; timestamp: number }> = [];

  createRollbackPoint(description: string): string {
    const id = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.rollbackPoints.push({ id, timestamp: Date.now(), description });
    return id;
  }

  async executeWithSafety<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ success: boolean; result?: T; error?: Error }> {
    try {
      const result = await operation();
      this.executionLog.push({ operation: operationName, success: true, timestamp: Date.now() });
      return { success: true, result };
    } catch (err) {
      this.executionLog.push({ operation: operationName, success: false, timestamp: Date.now() });
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  getExecutionLog(): Array<{ operation: string; success: boolean; timestamp: number }> {
    return [...this.executionLog];
  }

  getAvailableRollbacks(): RollbackPoint[] {
    return [...this.rollbackPoints];
  }
};
