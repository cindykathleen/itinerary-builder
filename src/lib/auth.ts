import { betterAuth } from "better-auth";
import pool from "./db";

export const auth = betterAuth({
  database: pool,

  emailAndPassword: {
    enabled: true,
  },

  // Updating tables to plural since "user" has a special meaning in SQL/PostgreSQL contexts
  user: {
    modelName: "users",
  },
  session: {
    modelName: "sessions",
  },
  account: {
    modelName: "accounts",
  },
  verification: {
    modelName: "verifications",
  },

  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
