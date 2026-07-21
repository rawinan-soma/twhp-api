/**
 * Generate API documentation (HTML + Markdown) from an OpenAPI spec.
 *
 * Usage:
 *   bun run scripts/gen-api-docs.ts [path/to/openapi.json]
 *
 * Default input  : docs/api/openapi.json
 * Outputs        : docs/api/index.html  (Scalar standalone viewer)
 *                  docs/api/API.md      (flat Markdown reference)
 *
 * To refresh the spec from a running app first:
 *   bun src/index.ts &              # start API on APP_PORT (3000)
 *   curl -s localhost:3000/twhp/api/document/json -o docs/api/openapi.json
 *   kill %1
 *   bun run scripts/gen-api-docs.ts
 */

type Json = Record<string, any>;

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

const specPath = Bun.argv[2] ?? "docs/api/openapi.json";
const spec: Json = JSON.parse(await Bun.file(specPath).text());

const title = spec.info?.title || "API Documentation";
const version = spec.info?.version || "0.0.0";

/* ---------- schema rendering ---------- */

function resolveRef(ref: string): Json {
  // e.g. "#/components/schemas/Foo"
  const parts = ref.replace(/^#\//, "").split("/");
  let node: any = spec;
  for (const p of parts) node = node?.[p];
  return node ?? {};
}

/** Compact one-line type signature for a schema. */
function typeOf(schema: Json | undefined): string {
  if (!schema) return "any";
  if (schema.$ref) return typeOf(resolveRef(schema.$ref));
  if ("const" in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((e: unknown) => JSON.stringify(e)).join(" | ");
  if (schema.anyOf) return schema.anyOf.map(typeOf).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(typeOf).join(" | ");
  if (schema.allOf) return schema.allOf.map(typeOf).join(" & ");
  if (schema.type === "array") return `${typeOf(schema.items)}[]`;
  if (schema.type === "object" || schema.properties) return "object";
  if (schema.format) return `${schema.type}<${schema.format}>`;
  return schema.type || "any";
}

/** Render an object schema's fields as a Markdown table. Returns "" if not an object. */
function fieldsTable(schema: Json | undefined, depth = 0): string {
  if (!schema) return "";
  if (schema.$ref) return fieldsTable(resolveRef(schema.$ref), depth);
  // unwrap single-branch composites to find an object to document
  if (schema.allOf?.length === 1) return fieldsTable(schema.allOf[0], depth);

  const props = schema.properties;
  if (!props) return "";

  const required: string[] = schema.required ?? [];
  const rows: string[] = [];
  rows.push("| Field | Type | Required | Description |");
  rows.push("| --- | --- | --- | --- |");
  for (const [name, raw] of Object.entries<Json>(props)) {
    const p = raw.$ref ? resolveRef(raw.$ref) : raw;
    const t = typeOf(p).replace(/\|/g, "\\|");
    const req = required.includes(name) ? "yes" : "—";
    const desc = (p.description || p.title || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
    rows.push(`| \`${name}\` | \`${t}\` | ${req} | ${desc} |`);
  }
  return rows.join("\n");
}

function jsonBlock(schema: Json | undefined): string {
  if (!schema) return "";
  return "```json\n" + JSON.stringify(schema, null, 2) + "\n```";
}

/* ---------- markdown assembly ---------- */

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface Op {
  method: string;
  path: string;
  tag: string;
  summary: string;
  description: string;
  op: Json;
}

const ops: Op[] = [];
for (const [path, item] of Object.entries<Json>(spec.paths || {})) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    ops.push({
      method: method.toUpperCase(),
      path,
      tag: op.tags?.[0] || "default",
      summary: op.summary || "",
      description: op.description || "",
      op,
    });
  }
}

// group by tag
const byTag = new Map<string, Op[]>();
for (const o of ops) {
  if (!byTag.has(o.tag)) byTag.set(o.tag, []);
  byTag.get(o.tag)!.push(o);
}
const tags = [...byTag.keys()].sort();

const md: string[] = [];
md.push(`# ${title}`);
md.push("");
md.push(`> Version \`${version}\` · OpenAPI \`${spec.openapi}\` · Generated ${new Date().toISOString().slice(0, 10)}`);
md.push("");
md.push(`${ops.length} operations across ${tags.length} groups.`);
md.push("");

// table of contents
md.push("## Contents");
md.push("");
for (const tag of tags) {
  md.push(`- [${tag}](#${slug(tag)})`);
  for (const o of byTag.get(tag)!) {
    md.push(`  - [\`${o.method} ${o.path}\`](#${slug(`${o.method}-${o.path}`)})`);
  }
}
md.push("");

for (const tag of tags) {
  md.push(`## ${tag}`);
  md.push("");
  for (const o of byTag.get(tag)!) {
    const { op } = o;
    md.push(`### \`${o.method} ${o.path}\``);
    md.push("");
    if (o.summary) md.push(`**${o.summary}**`);
    if (o.description) md.push("", o.description);
    md.push("");

    // parameters
    const params: Json[] = op.parameters || [];
    if (params.length) {
      md.push("**Parameters**");
      md.push("");
      md.push("| Name | In | Required | Type | Description |");
      md.push("| --- | --- | --- | --- | --- |");
      for (const p of params) {
        const t = typeOf(p.schema).replace(/\|/g, "\\|");
        md.push(
          `| \`${p.name}\` | ${p.in} | ${p.required ? "yes" : "—"} | \`${t}\` | ${(p.description || "").replace(/\|/g, "\\|")} |`,
        );
      }
      md.push("");
    }

    // request body
    const reqSchema =
      op.requestBody?.content?.["application/json"]?.schema ??
      op.requestBody?.content?.["multipart/form-data"]?.schema;
    if (reqSchema) {
      const ct = op.requestBody.content["application/json"] ? "application/json" : "multipart/form-data";
      md.push(`**Request body** (\`${ct}\`)`);
      md.push("");
      const tbl = fieldsTable(reqSchema);
      md.push(tbl || jsonBlock(reqSchema));
      md.push("");
    }

    // responses
    const responses: Json = op.responses || {};
    if (Object.keys(responses).length) {
      md.push("**Responses**");
      md.push("");
      for (const [code, r] of Object.entries<Json>(responses)) {
        const desc = r.description || "";
        const rSchema = r.content?.["application/json"]?.schema;
        md.push(`- \`${code}\`${desc ? ` — ${desc}` : ""}`);
        if (rSchema) {
          const tbl = fieldsTable(rSchema);
          if (tbl) {
            md.push("");
            md.push(tbl.split("\n").map((l) => "  " + l).join("\n"));
            md.push("");
          }
        }
      }
      md.push("");
    }

    md.push("---");
    md.push("");
  }
}

await Bun.write("docs/api/API.md", md.join("\n"));

/* ---------- standalone HTML (Scalar) ---------- */

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — API Reference</title>
  </head>
  <body>
    <!-- OpenAPI spec embedded inline so this file is fully self-contained -->
    <script id="api-reference" type="application/json">
${JSON.stringify(spec)}
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;
await Bun.write("docs/api/index.html", html);

console.log(`Wrote docs/api/API.md and docs/api/index.html (${ops.length} operations).`);
