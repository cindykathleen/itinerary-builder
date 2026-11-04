import { defineConfig, devices } from "@playwright/test";
import { loadLocalEnv, testDatabaseUrl } from "./e2e/env";

const localEnv = loadLocalEnv();
const databaseUrl = localEnv.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from .env.local");
}

const port = 3001;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `node e2e/setup-database.mjs && npx next dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl(databaseUrl),
      NEXT_DIST_DIR: ".next-e2e",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: localEnv.BETTER_AUTH_SECRET ?? "",
      GOOGLE_PLACES_API_KEY: "test-key",
      GOOGLE_PLACES_FIXTURES: "1",
    },
  },
});
