/**
 * CROW-B3 Repository Configuration
 *
 * This file defines all repositories in the CROW-B3 organization
 * and whether they should be cloned by default.
 */

export type RepoCategory =
  | "core-service"
  | "supporting-service"
  | "client"
  | "sdk"
  | "docs"
  | "infrastructure"
  | "rnd"
  | "template"
  | "config";

export interface RepoConfig {
  name: string;
  description: string;
  category: RepoCategory;
  cloneByDefault: boolean;
  isPrivate: boolean;
}

export const ORG_NAME = "CROW-B3";
export const BASE_URL = "https://github.com/CROW-B3";

/**
 * All repositories in the CROW-B3 organization
 */
export const REPOS: RepoConfig[] = [
  // ═══════════════════════════════════════════════════════════════
  // CORE SERVICES (9 repos)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "core-api-gateway",
    description: "Edge API gateway for routing, JWT/API-key verification, request validation, and rate limiting",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-auth-service",
    description: "Identity authority for login, JWT issuance, session lifecycle, and password resets",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-user-service",
    description: "User profiles, preferences, and permissions management (tenant-aware)",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-product-service",
    description: "Product catalogue + metadata storage to ground interactions/patterns in real SKUs",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-interaction-service",
    description: "Consumes validated events, enriches via Gemini, stores interaction records + embeddings",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-pattern-service",
    description: "Scheduled rollups to detect recurring behaviours/anomalies and store derived patterns",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-analytics-service",
    description: "Derived metrics (daily counts, pattern trends, feature usage, billing/usage analytics)",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-notification-service",
    description: "Event-subscriber that sends alerts via email/Slack/webhooks/in-app notifications",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "core-organization-service",
    description: "Multi-tenancy, organisation settings, and team management with strict tenant scoping",
    category: "core-service",
    cloneByDefault: true,
    isPrivate: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SUPPORTING SERVICES (4 repos)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "bff-chat-service",
    description: "Dashboard chat BFF that fetches and combines interaction + pattern results into answers",
    category: "supporting-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "mcp-service",
    description: "Model Context Protocol server exposing CROW tools/resources to LLM assistants",
    category: "supporting-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "a2a-service",
    description: "Agent2Agent (A2A) JSON-RPC service for autonomous agent interoperability",
    category: "supporting-service",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "web-ingest-service",
    description: "Web event ingestion service",
    category: "supporting-service",
    cloneByDefault: true,
    isPrivate: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // CLIENTS (4 repos)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "dashboard-client",
    description: "Dashboard Client for All Platforms",
    category: "client",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "landing-client",
    description: "Web Landing Client",
    category: "client",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "auth-client",
    description: "Authentication Client for All Platforms",
    category: "client",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "rogue-store",
    description: "Demo clothing e-commerce site for testing the Crow B3 tracking SDK",
    category: "client",
    cloneByDefault: true,
    isPrivate: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // SDKs & LIBRARIES (2 repos)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "website-hook-sdk",
    description: "Lightweight JS/TS SDK for capturing user interactions on web pages",
    category: "sdk",
    cloneByDefault: true,
    isPrivate: false,
  },
  {
    name: "ui-kit",
    description: "Shared component library & design system",
    category: "sdk",
    cloneByDefault: true,
    isPrivate: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENTATION (2 repos)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "internal-docs",
    description: "Internal documentation site for CROW project",
    category: "docs",
    cloneByDefault: true,
    isPrivate: true,
  },
  {
    name: "public-docs",
    description: "Public documentation site for CROW project",
    category: "docs",
    cloneByDefault: true,
    isPrivate: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // INFRASTRUCTURE (1 repo)
  // ═══════════════════════════════════════════════════════════════
  {
    name: "infrastructure",
    description: "K8s Infrastructure Repository",
    category: "infrastructure",
    cloneByDefault: true,
    isPrivate: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // R&D / TESTING (4 repos) - Optional
  // ═══════════════════════════════════════════════════════════════
  {
    name: "rnd",
    description: "Research and Development for CROW",
    category: "rnd",
    cloneByDefault: false,
    isPrivate: true,
  },
  {
    name: "api-tests",
    description: "API Testing Repository",
    category: "rnd",
    cloneByDefault: false,
    isPrivate: true,
  },
  {
    name: "pattern-recognisition-poc",
    description: "Pattern recognition proof of concept",
    category: "rnd",
    cloneByDefault: false,
    isPrivate: true,
  },
  {
    name: "stitch-to-figma-assets",
    description: "Stitch exports (HTML) + prompts packaged for import into Figma",
    category: "rnd",
    cloneByDefault: false,
    isPrivate: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES (5 repos) - Not cloned by default
  // ═══════════════════════════════════════════════════════════════
  {
    name: "npm-sdk-template",
    description: "TypeScript/JavaScript SDK package starter template",
    category: "template",
    cloneByDefault: false,
    isPrivate: false,
  },
  {
    name: "cloudflare-workers-containers-hono-template",
    description: "Hono-powered Cloudflare Worker with Workers Containers",
    category: "template",
    cloneByDefault: false,
    isPrivate: false,
  },
  {
    name: "cloudflare-opennext-nextjs-template",
    description: "Next.js + OpenNext template for Cloudflare Workers",
    category: "template",
    cloneByDefault: false,
    isPrivate: false,
  },
  {
    name: "cloudflare-workers-containers-python-template",
    description: "Python template for Cloudflare Workers Containers",
    category: "template",
    cloneByDefault: false,
    isPrivate: false,
  },
  {
    name: "cloudflare-workers-containers-go-template",
    description: "Go template for Cloudflare Workers Containers (archived)",
    category: "template",
    cloneByDefault: false,
    isPrivate: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // ORG CONFIG (1 repo) - Never clone
  // ═══════════════════════════════════════════════════════════════
  {
    name: ".github",
    description: "Organization-wide GitHub configuration",
    category: "config",
    cloneByDefault: false,
    isPrivate: false,
  },
];

export const getReposToClone = (includeAll = false): RepoConfig[] => {
  return REPOS.filter(repo =>
    repo.name !== "local-dev" &&
    repo.category !== "config" &&
    (includeAll || repo.cloneByDefault)
  );
};

export const getRepoUrl = (repoName: string): string => {
  return `${BASE_URL}/${repoName}.git`;
};

export const getReposByCategory = (category: RepoCategory): RepoConfig[] => {
  return REPOS.filter(repo => repo.category === category);
};

export const getStats = () => {
  const total = REPOS.length;
  const defaultClone = REPOS.filter(r => r.cloneByDefault).length;
  const optional = REPOS.filter(r => !r.cloneByDefault && r.category !== "config").length;
  return { total, defaultClone, optional };
};
