export interface D1Resource {
  name: string;
  id: string;
  env: "production" | "dev" | "local";
}

export interface R2Resource {
  name: string;
  env: "production" | "dev" | "local";
}

export interface ServiceResources {
  service: string;
  displayName: string;
  d1: D1Resource[];
  r2: R2Resource[];
}

export const SERVICES: ServiceResources[] = [
  {
    service: "bff-chat-service",
    displayName: "Bff Chat Service",
    d1: [
      { name: "crow-bff-chat-service-db-local", id: "45b02f1a-9d64-48b1-bd7a-9a78999d1f66", env: "local" },
      { name: "crow-bff-chat-service-db-dev", id: "069bef70-1940-4d23-b996-172d7391f351", env: "dev" },
      { name: "crow-bff-chat-service-db", id: "356a1a49-f09b-4987-8a60-0bd76fb9f6f5", env: "production" }
    ],
    r2: [
      { name: "crow-bff-chat-service-store", env: "production" },
      { name: "crow-bff-chat-service-store-dev", env: "dev" },
      { name: "crow-bff-chat-service-store-local", env: "local" }
    ],
  },
  {
    service: "bff-qna-service",
    displayName: "Bff Qna Service",
    d1: [
      { name: "crow-bff-qna-service-db-local", id: "790849c4-4fa1-4da5-b5e9-2466a8e72393", env: "local" },
      { name: "crow-bff-qna-service-db-dev", id: "1952ac58-e633-4bc3-aa21-755801a84e1c", env: "dev" },
      { name: "crow-bff-qna-service-db", id: "a8ff4bf4-8c07-472c-a718-0dfd93d27749", env: "production" }
    ],
    r2: [
      { name: "crow-bff-qna-service-store", env: "production" },
      { name: "crow-bff-qna-service-store-dev", env: "dev" },
      { name: "crow-bff-qna-service-store-local", env: "local" }
    ],
  },
  {
    service: "core-analytics-service",
    displayName: "Core Analytics Service",
    d1: [
      { name: "crow-core-analytics-service-db-local", id: "91c4228b-dfe9-4082-90e0-dd92d3ee8efd", env: "local" },
      { name: "crow-core-analytics-service-db-dev", id: "bc692f0b-d715-4286-9d9a-06a9a51877bb", env: "dev" },
      { name: "crow-core-analytics-service-db", id: "0fdc41ce-9bfd-479b-acfe-9c8bd162d8c3", env: "production" }
    ],
    r2: [
      { name: "crow-core-analytics-service-store", env: "production" },
      { name: "crow-core-analytics-service-store-dev", env: "dev" },
      { name: "crow-core-analytics-service-store-local", env: "local" }
    ],
  },
  {
    service: "core-api-gateway",
    displayName: "Core Api Gateway",
    d1: [
      { name: "crow-core-api-gateway-db-local", id: "95b55368-e9b1-4830-a073-75e9a9903058", env: "local" },
      { name: "crow-core-api-gateway-db-dev", id: "116bcff4-66c4-48c2-a7a3-f34b55daddcc", env: "dev" },
      { name: "crow-core-api-gateway-db", id: "427db2fd-8f19-44af-821d-933ebdc822b1", env: "production" }
    ],
    r2: [
      { name: "crow-core-api-gateway-store", env: "production" },
      { name: "crow-core-api-gateway-store-dev", env: "dev" },
      { name: "crow-core-api-gateway-store-local", env: "local" }
    ],
  },
  {
    service: "core-auth-service",
    displayName: "Core Auth Service",
    d1: [
      { name: "crow-core-auth-service-db-local", id: "355b47e5-8f20-4e0a-b801-0be9beba488e", env: "local" },
      { name: "crow-core-auth-service-db-dev", id: "99c90045-cfbb-4da8-9a82-f3372a37dda3", env: "dev" },
      { name: "crow-core-auth-service-db", id: "ac9b828a-330b-463f-9de3-d394eed37c35", env: "production" }
    ],
    r2: [
      { name: "crow-core-auth-service-store", env: "production" },
      { name: "crow-core-auth-service-store-dev", env: "dev" },
      { name: "crow-core-auth-service-store-local", env: "local" }
    ],
  },
  {
    service: "core-interaction-service",
    displayName: "Core Interaction Service",
    d1: [
      { name: "crow-core-interaction-service-db-local", id: "dba8eb40-30ee-4d71-982a-64ece6dca15b", env: "local" },
      { name: "crow-core-interaction-service-db-dev", id: "fcf1a8ab-a16c-427c-9048-0a0d0f8465ef", env: "dev" },
      { name: "crow-core-interaction-service-db", id: "ba03bcb4-01e2-4880-ae94-01ef11ac3aa1", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "core-notification-service",
    displayName: "Core Notification Service",
    d1: [
      { name: "crow-core-notification-service-db-local", id: "ad88fff1-b2f1-4271-a533-3917084d76e2", env: "local" },
      { name: "crow-core-notification-service-db-dev", id: "26484da4-0586-4821-bbe2-075d9cc0b364", env: "dev" },
      { name: "crow-core-notification-service-db", id: "d83550a8-c207-4f23-9209-3c9a8dfa37d4", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "core-organization-service",
    displayName: "Core Organization Service",
    d1: [
      { name: "crow-core-organization-service-db-local", id: "912720d7-ed9f-4b1c-b5b6-1e87e72fb148", env: "local" },
      { name: "crow-core-organization-service-db-dev", id: "adb29e09-5e36-4f7b-b29c-5226d1589023", env: "dev" },
      { name: "crow-core-organization-service-db", id: "ff1acdb5-6e11-4d9a-8750-f19773e86607", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "core-pattern-service",
    displayName: "Core Pattern Service",
    d1: [
      { name: "crow-core-pattern-service-db-local", id: "9d9eea51-36a5-442d-ac99-b59d2878709c", env: "local" },
      { name: "crow-core-pattern-service-db-dev", id: "38e42261-df6f-43a4-872f-068b9f4a4329", env: "dev" },
      { name: "crow-core-pattern-service-db", id: "372a8110-1d3a-44cf-9727-2b25d124fbc1", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "core-product-service",
    displayName: "Core Product Service",
    d1: [
      { name: "crow-core-product-service-db-local", id: "28bfe4ff-4126-416b-a65e-bd9740184ff3", env: "local" },
      { name: "crow-core-product-service-db-dev", id: "44489847-8f54-437f-ae91-5c379c6f6671", env: "dev" },
      { name: "crow-core-product-service-db", id: "f04c1d6d-60cf-4fe9-aed4-a2942bf0d11a", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "core-user-service",
    displayName: "Core User Service",
    d1: [
      { name: "crow-core-user-service-db-local", id: "3eba3d6b-d818-46b8-a45d-493c4a451251", env: "local" },
      { name: "crow-core-user-service-db-dev", id: "7cdd3d3a-0632-48c0-8cdd-e5fe5099d7e2", env: "dev" },
      { name: "crow-core-user-service-db", id: "d6ed92cd-08ef-4f5a-8c00-8c5f59ca57d5", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "dashboard-client",
    displayName: "Dashboard Client",
    d1: [
      { name: "crow-dashboard-client-db-dev", id: "875cfb9a-11a1-4891-b569-aadf3afb24f4", env: "dev" },
      { name: "crow-dashboard-client-db", id: "9ef93cd8-ed1b-4a94-90ef-5e231e2337b1", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "landing-client",
    displayName: "Landing Client",
    d1: [
      { name: "crow-landing-client-db-dev", id: "2be2e67e-3ce8-4bb8-821c-2fd7891632f4", env: "dev" },
      { name: "crow-landing-client-db", id: "144acd91-0888-4e60-b160-4b2260ac71ee", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "mcp-service",
    displayName: "Mcp Service",
    d1: [
      { name: "crow-mcp-service-db-local", id: "0c21b94e-c596-4014-90e5-928ab31344a6", env: "local" },
      { name: "crow-mcp-service-db-dev", id: "2147f34f-90ff-4862-ab68-b28ec4fd9a3b", env: "dev" },
      { name: "crow-mcp-service-db", id: "8ff8a243-ed55-4ddb-8e04-1f99bf4cb93b", env: "production" }
    ],
    r2: [

    ],
  },
  {
    service: "web-ingest-service",
    displayName: "Web Ingest Service",
    d1: [
      { name: "crow-web-ingest-service-db", id: "58b32c68-d807-4b42-9075-08a12078bdf7", env: "production" },
      { name: "crow-web-ingest-service-db-dev", id: "e73411e4-8c1b-48a6-ad20-2bd74249d29a", env: "dev" }
    ],
    r2: [

    ],
  }
];

export const getServiceByName = (name: string): ServiceResources | undefined => {
  return SERVICES.find(s => s.service === name || s.displayName.toLowerCase() === name.toLowerCase());
};

export const getAllServiceNames = (): string[] => {
  return SERVICES.map(s => s.service);
};
