import { readFileSync } from "node:fs";
import path from "node:path";

/** @returns {Record<string, string>} */
export function loadLocalEnv() {
  /** @type {Record<string, string>} */
  const env = {};
  const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function testDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = "/itinerary_builder_app_test";
  return url.toString();
}
