import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config";

export const db = drizzle(env.DATABASE_URL);

// A dedicated `max: 1` pool for the readiness probe, never the shared pool above. A hung probe
// (a silent network drop, no ECONNREFUSED) can then hold only this one connection instead of
// piling up real requests' pool slots — see the health readiness comment in service/health.ts.
const healthPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 1000,
  query_timeout: 1000,
});
export const healthDb = drizzle(healthPool);
