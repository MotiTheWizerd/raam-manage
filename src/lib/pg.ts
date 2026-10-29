import "server-only";

import { Pool } from "pg";

// The Postgres `raam` db (camera registry + person tracing; schema in
// vision/tracing/schema.sql). The rest of the app still lives in SQLite (db.ts).
// One pool per server process, surviving dev hot-reloads via globalThis.
const g = globalThis as typeof globalThis & { __raamPg?: Pool };

export const pg: Pool = (g.__raamPg ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
}));
