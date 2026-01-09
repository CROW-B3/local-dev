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

export const REPOS: RepoConfig[] = [
  // Core Services
  { name: "core-api-gateway", description: "API Gateway", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-auth-service", description: "Auth Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-user-service", description: "User Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-product-service", description: "Product Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-interaction-service", description: "Interaction Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-pattern-service", description: "Pattern Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-analytics-service", description: "Analytics Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-notification-service", description: "Notification Service", category: "core-service", cloneByDefault: true, isPrivate: true },
  { name: "core-organization-service", description: "Organization Service", category: "core-service", cloneByDefault: true, isPrivate: true },

  // Supporting Services
  { name: "bff-chat-service", description: "Chat BFF", category: "supporting-service", cloneByDefault: true, isPrivate: true },
  { name: "bff-qna-service", description: "QnA BFF", category: "supporting-service", cloneByDefault: true, isPrivate: true },
  { name: "mcp-service", description: "MCP Server", category: "supporting-service", cloneByDefault: true, isPrivate: true },
  { name: "a2a-service", description: "A2A Service", category: "supporting-service", cloneByDefault: true, isPrivate: true },
  { name: "web-ingest-service", description: "Web Ingest", category: "supporting-service", cloneByDefault: true, isPrivate: true },

  // Clients
  { name: "dashboard-client", description: "Dashboard", category: "client", cloneByDefault: true, isPrivate: true },
  { name: "landing-client", description: "Landing Page", category: "client", cloneByDefault: true, isPrivate: true },
  { name: "auth-client", description: "Auth Client", category: "client", cloneByDefault: true, isPrivate: true },
  { name: "rogue-store", description: "Demo Store", category: "client", cloneByDefault: true, isPrivate: false },

  // SDKs
  { name: "website-hook-sdk", description: "Website SDK", category: "sdk", cloneByDefault: true, isPrivate: false },
  { name: "ui-kit", description: "UI Kit", category: "sdk", cloneByDefault: true, isPrivate: false },

  // Docs
  { name: "internal-docs", description: "Internal Docs", category: "docs", cloneByDefault: true, isPrivate: true },
  { name: "public-docs", description: "Public Docs", category: "docs", cloneByDefault: true, isPrivate: false },
  { name: "blog.crowai.dev", description: "Engineering Blog", category: "docs", cloneByDefault: true, isPrivate: false },

  // Infrastructure
  { name: "infrastructure", description: "K8s Infra", category: "infrastructure", cloneByDefault: true, isPrivate: true },

  // R&D (optional)
  { name: "rnd", description: "R&D", category: "rnd", cloneByDefault: false, isPrivate: true },
  { name: "api-tests", description: "API Tests", category: "rnd", cloneByDefault: false, isPrivate: true },
  { name: "stitch-to-figma-assets", description: "Figma Assets", category: "rnd", cloneByDefault: false, isPrivate: true },

  // Templates (optional)
  { name: "npm-sdk-template", description: "SDK Template", category: "template", cloneByDefault: false, isPrivate: false },
  { name: "cloudflare-workers-containers-hono-template", description: "Hono Template", category: "template", cloneByDefault: false, isPrivate: false },
  { name: "cloudflare-opennext-nextjs-template", description: "Next.js Template", category: "template", cloneByDefault: false, isPrivate: false },
  { name: "cloudflare-workers-containers-python-template", description: "Python Template", category: "template", cloneByDefault: false, isPrivate: false },
  { name: "cloudflare-workers-containers-go-template", description: "Go Template", category: "template", cloneByDefault: false, isPrivate: false },

  // Config (never clone)
  { name: ".github", description: "Org Config", category: "config", cloneByDefault: false, isPrivate: false },
];

export const getReposToClone = (includeAll = false): RepoConfig[] => {
  return REPOS.filter(repo =>
    repo.name !== "local-dev" &&
    repo.category !== "config" &&
    (includeAll || repo.cloneByDefault)
  );
};

export const getRepoUrl = (repoName: string): string => `${BASE_URL}/${repoName}.git`;

export const getStats = () => ({
  total: REPOS.length,
  defaultClone: REPOS.filter(r => r.cloneByDefault).length,
  optional: REPOS.filter(r => !r.cloneByDefault && r.category !== "config").length,
});
