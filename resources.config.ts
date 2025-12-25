export interface D1Resource {
  name: string;
  id: string;
  env: "production" | "dev";
}

export interface R2Resource {
  name: string;
  env: "production" | "dev";
}

export interface ServiceResources {
  service: string;
  displayName: string;
  d1: D1Resource[];
  r2: R2Resource[];
}

export const CLOUDFLARE_ACCOUNT_ID = "8f0203259905d8923687286c84921e6c";

export const SERVICES: ServiceResources[] = [
  {
    service: "core-api-gateway",
    displayName: "API Gateway",
    d1: [
      { name: "crow-core-api-gateway-db", id: "427db2fd-8f19-44af-821d-933ebdc822b1", env: "production" },
      { name: "crow-core-api-gateway-db-dev", id: "116bcff4-66c4-48c2-a7a3-f34b55daddcc", env: "dev" },
    ],
    r2: [
      { name: "crow-core-api-gateway-store", env: "production" },
      { name: "crow-core-api-gateway-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-auth-service",
    displayName: "Auth Service",
    d1: [
      { name: "crow-core-auth-service-db", id: "ac9b828a-330b-463f-9de3-d394eed37c35", env: "production" },
      { name: "crow-core-auth-service-db-dev", id: "99c90045-cfbb-4da8-9a82-f3372a37dda3", env: "dev" },
    ],
    r2: [
      { name: "crow-core-auth-service-store", env: "production" },
      { name: "crow-core-auth-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-user-service",
    displayName: "User Service",
    d1: [
      { name: "crow-core-user-service-db", id: "d6ed92cd-08ef-4f5a-8c00-8c5f59ca57d5", env: "production" },
      { name: "crow-core-user-service-db-dev", id: "7cdd3d3a-0632-48c0-8cdd-e5fe5099d7e2", env: "dev" },
    ],
    r2: [
      { name: "crow-core-user-service-store", env: "production" },
      { name: "crow-core-user-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-product-service",
    displayName: "Product Service",
    d1: [
      { name: "crow-core-product-service-db", id: "f04c1d6d-60cf-4fe9-aed4-a2942bf0d11a", env: "production" },
      { name: "crow-core-product-service-db-dev", id: "44489847-8f54-437f-ae91-5c379c6f6671", env: "dev" },
    ],
    r2: [
      { name: "crow-core-product-service-store", env: "production" },
      { name: "crow-core-product-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-interaction-service",
    displayName: "Interaction Service",
    d1: [
      { name: "crow-core-interaction-service-db", id: "ba03bcb4-01e2-4880-ae94-01ef11ac3aa1", env: "production" },
      { name: "crow-core-interaction-service-db-dev", id: "fcf1a8ab-a16c-427c-9048-0a0d0f8465ef", env: "dev" },
    ],
    r2: [
      { name: "crow-core-interaction-service-store", env: "production" },
      { name: "crow-core-interaction-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-pattern-service",
    displayName: "Pattern Service",
    d1: [
      { name: "crow-core-pattern-service-db", id: "372a8110-1d3a-44cf-9727-2b25d124fbc1", env: "production" },
      { name: "crow-core-pattern-service-db-dev", id: "38e42261-df6f-43a4-872f-068b9f4a4329", env: "dev" },
    ],
    r2: [
      { name: "crow-core-pattern-service-store", env: "production" },
      { name: "crow-core-pattern-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-analytics-service",
    displayName: "Analytics Service",
    d1: [
      { name: "crow-core-analytics-service-db", id: "0fdc41ce-9bfd-479b-acfe-9c8bd162d8c3", env: "production" },
      { name: "crow-core-analytics-service-db-dev", id: "bc692f0b-d715-4286-9d9a-06a9a51877bb", env: "dev" },
    ],
    r2: [
      { name: "crow-core-analytics-service-store", env: "production" },
      { name: "crow-core-analytics-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-notification-service",
    displayName: "Notification Service",
    d1: [
      { name: "crow-core-notification-service-db", id: "d83550a8-c207-4f23-9209-3c9a8dfa37d4", env: "production" },
      { name: "crow-core-notification-service-db-dev", id: "26484da4-0586-4821-bbe2-075d9cc0b364", env: "dev" },
    ],
    r2: [
      { name: "crow-core-notification-service-store", env: "production" },
      { name: "crow-core-notification-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "core-organization-service",
    displayName: "Organization Service",
    d1: [
      { name: "crow-core-organization-service-db", id: "ff1acdb5-6e11-4d9a-8750-f19773e86607", env: "production" },
      { name: "crow-core-organization-service-db-dev", id: "adb29e09-5e36-4f7b-b29c-5226d1589023", env: "dev" },
    ],
    r2: [
      { name: "crow-core-organization-service-store", env: "production" },
      { name: "crow-core-organization-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "bff-chat-service",
    displayName: "Chat BFF",
    d1: [
      { name: "crow-bff-chat-service-db", id: "356a1a49-f09b-4987-8a60-0bd76fb9f6f5", env: "production" },
      { name: "crow-bff-chat-service-db-dev", id: "069bef70-1940-4d23-b996-172d7391f351", env: "dev" },
    ],
    r2: [
      { name: "crow-bff-chat-service-store", env: "production" },
      { name: "crow-bff-chat-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "mcp-service",
    displayName: "MCP Service",
    d1: [
      { name: "crow-mcp-service-db", id: "8ff8a243-ed55-4ddb-8e04-1f99bf4cb93b", env: "production" },
      { name: "crow-mcp-service-db-dev", id: "2147f34f-90ff-4862-ab68-b28ec4fd9a3b", env: "dev" },
    ],
    r2: [
      { name: "crow-mcp-service-store", env: "production" },
      { name: "crow-mcp-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "web-ingest-service",
    displayName: "Web Ingest",
    d1: [
      { name: "crow-web-ingest-service-db", id: "58b32c68-d807-4b42-9075-08a12078bdf7", env: "production" },
      { name: "crow-web-ingest-service-db-dev", id: "e73411e4-8c1b-48a6-ad20-2bd74249d29a", env: "dev" },
    ],
    r2: [
      { name: "crow-web-ingest-service-store", env: "production" },
      { name: "crow-web-ingest-service-store-dev", env: "dev" },
    ],
  },
  {
    service: "dashboard-client",
    displayName: "Dashboard",
    d1: [
      { name: "crow-dashboard-client-db", id: "9ef93cd8-ed1b-4a94-90ef-5e231e2337b1", env: "production" },
      { name: "crow-dashboard-client-db-dev", id: "875cfb9a-11a1-4891-b569-aadf3afb24f4", env: "dev" },
    ],
    r2: [
      { name: "crow-dashboard-client-assets", env: "production" },
      { name: "crow-dashboard-client-assets-dev", env: "dev" },
    ],
  },
  {
    service: "landing-client",
    displayName: "Landing Page",
    d1: [
      { name: "crow-landing-client-db", id: "144acd91-0888-4e60-b160-4b2260ac71ee", env: "production" },
      { name: "crow-landing-client-db-dev", id: "2be2e67e-3ce8-4bb8-821c-2fd7891632f4", env: "dev" },
    ],
    r2: [
      { name: "crow-landing-client-assets", env: "production" },
      { name: "crow-landing-client-assets-dev", env: "dev" },
    ],
  },
];

export const getServiceByName = (name: string): ServiceResources | undefined => {
  return SERVICES.find(s => s.service === name || s.displayName.toLowerCase() === name.toLowerCase());
};

export const getAllServiceNames = (): string[] => {
  return SERVICES.map(s => s.service);
};
