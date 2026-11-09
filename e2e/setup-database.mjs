import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { loadLocalEnv, testDatabaseUrl } from "./env.mjs";

const { Client } = pg;
const testDatabase = "itinerary_builder_app_test";
const databaseUrl = loadLocalEnv().DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from .env.local");
}

function directDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  url.hostname = url.hostname.replace("-pooler", "");
  return url.toString();
}

const admin = new Client({ connectionString: directDatabaseUrl(databaseUrl) });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${testDatabase}`);
await admin.end();

const database = new Client({
  connectionString: directDatabaseUrl(testDatabaseUrl(databaseUrl)),
});
await database.connect();
await database.query(await readFile(path.join(process.cwd(), "db/auth.sql"), "utf8"));

const migrationsDir = path.join(process.cwd(), "db/migrations");
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  await database.query(await readFile(path.join(migrationsDir, file), "utf8"));
}

await database.end();
