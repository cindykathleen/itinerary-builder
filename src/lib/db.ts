import { parseEnv } from "@neon/env";
import { Pool } from "pg";
import config from "../../neon";

const { postgres } = parseEnv(config, ["DATABASE_URL"]);

const pool = new Pool({
  connectionString: postgres.databaseUrl,
});

export default pool;