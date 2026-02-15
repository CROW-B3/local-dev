#!/usr/bin/env bun
import { sign } from "hono/jwt";

const BETTER_AUTH_SECRET = "DF1IKzRMqusC5A/56EjCFuCAKVgPNoW6pibNi5IEsFw=";

async function generateSystemJWT(service: string): Promise<string> {
  return await sign(
    {
      sub: "system",
      type: "system",
      service,
      exp: Math.floor(Date.now() / 1000) + 86400,
    },
    BETTER_AUTH_SECRET,
    "HS256"
  );
}

async function testOrganizationService() {
  const token = await generateSystemJWT("auth-service");

  console.log("Testing Organization Service...");
  const response = await fetch(
    "https://dev.internal.orgs.crowai.dev/api/v1/organizations",
    {
      method: "POST",
      headers: {
        "X-System-Token": "true",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        betterAuthOrgId: "test-org-" + Date.now(),
        name: "Test Organization",
      }),
    }
  );

  console.log("Status:", response.status);
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  return data;
}

async function testUserService(orgId: string, authUserId: string) {
  const token = await generateSystemJWT("auth-service");

  console.log("\nTesting User Service...");

  // First check if user exists
  const checkResponse = await fetch(
    `https://dev.internal.users.crowai.dev/api/v1/users/by-auth-id/${authUserId}`,
    {
      headers: {
        "X-System-Token": "true",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log("Check Status:", checkResponse.status);

  if (checkResponse.status === 404) {
    // Create user
    const createResponse = await fetch(
      "https://dev.internal.users.crowai.dev/api/v1/users",
      {
        method: "POST",
        headers: {
          "X-System-Token": "true",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          betterAuthUserId: authUserId,
          organizationId: orgId,
          email: "test@example.com",
          name: "Test User",
          role: "admin",
          modules: { web: true, cctv: true, social: true },
          onboardingId: "test-onboarding-" + Date.now(),
        }),
      }
    );

    console.log("Create Status:", createResponse.status);
    const data = await createResponse.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    return data;
  }

  const data = await checkResponse.json();
  console.log("User exists:", JSON.stringify(data, null, 2));
  return data;
}

async function testBillingService(orgId: string, onboardingId: string) {
  const token = await generateSystemJWT("auth-service");

  console.log("\nTesting Billing Service...");
  const response = await fetch(
    "https://dev.internal.billing.crowai.dev/api/v1/billing/billing-builders",
    {
      method: "POST",
      headers: {
        "X-System-Token": "true",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: orgId,
        onboardingId: onboardingId,
      }),
    }
  );

  console.log("Status:", response.status);
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  return data;
}

async function main() {
  try {
    const org = await testOrganizationService();

    if (org.id) {
      const user = await testUserService(org.id, "test-auth-user-" + Date.now());
      const billing = await testBillingService(org.id, "test-onboarding-" + Date.now());

      console.log("\n✅ All services working!");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

main();
