// Piped into the new image by `make fit-check`. Refuses a release whose code
// needs a table, column, or enum value the live database lacks, or whose config
// rejects the server's docker.env. It opens a read-only session and never
// changes the schema; a gap has to be closed by a reviewed migration.
import { is } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgTable } from "drizzle-orm/pg-core";
import { Client } from "pg";
import * as schema from "/app/src/drizzle/schema.ts";

// `docker run --env-file` keeps the quotes that Compose strips.
for (const [key, value] of Object.entries(process.env)) {
  const quoted = value?.match(/^(["'])(.*)\1$/);
  if (quoted) process.env[key] = quoted[2];
}
await import("/app/src/config.ts");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  options: "-c default_transaction_read_only=on",
});
await client.connect();

const columns = await client.query<{ table_name: string; column_name: string }>(
  "select table_name, column_name from information_schema.columns where table_schema = 'public'",
);
const labels = await client.query<{ typname: string; enumlabel: string }>(
  "select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid",
);
await client.end();

const liveColumns = new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`));
const liveTables = new Set(columns.rows.map((r) => r.table_name));
const liveLabels = new Set(labels.rows.map((r) => `${r.typname}.${r.enumlabel}`));

const gaps: string[] = [];
let tables = 0;
for (const value of Object.values(schema)) {
  if (is(value, PgTable)) {
    tables += 1;
    const config = getTableConfig(value);
    if (!liveTables.has(config.name)) {
      gaps.push(`table ${config.name}`);
      continue;
    }
    for (const column of config.columns) {
      const name = `${config.name}.${column.name}`;
      if (!liveColumns.has(name)) gaps.push(`column ${name}`);
    }
  } else if (isPgEnum(value)) {
    for (const label of value.enumValues) {
      if (!liveLabels.has(`${value.enumName}.${label}`)) gaps.push(`enum value ${value.enumName}.${label}`);
    }
  }
}

if (gaps.length > 0) {
  console.error(`fit-check FAIL  the live database lacks ${gaps.length} item(s) this release needs:`);
  for (const gap of gaps) console.error(`  ${gap}`);
  process.exit(1);
}
console.log(`ok    fit-check: ${tables} tables, config accepts docker.env`);
