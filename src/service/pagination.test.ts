import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia, t } from "elysia";
import {
  buildPage,
  LIMIT_DEFAULT,
  LIMIT_MAX,
  PAGE_DEFAULT,
  Paginated,
  PaginationQuery,
  resolvePage,
} from "../schema/pagination";

// ─── Test app ────────────────────────────────────────────────────────────────
//
// Mirrors the VALIDATION -> 400 mapping from src/index.ts rather than importing the real app,
// because importing src/index.ts boots config, Redis, MinIO and the logger. Elysia itself returns
// 422 for a schema violation; the app's onError is what turns it into 400. A bare Elysia instance
// would therefore assert the wrong status.

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

const app = new Elysia()
  .onError(({ code, set }) => {
    if (EXPECTED_CODES.has(code as string)) {
      set.status = 400;
      return { message: "validation" };
    }
    set.status = 500;
    return { message: "unexpected" };
  })
  .get("/list", ({ query }) => ({ query, resolved: resolvePage(query) }), {
    // Same composition shape the three factory routes use: existing filters + PaginationQuery.
    query: t.Composite([
      t.Object({ validated: t.Boolean(), enrolled: t.Optional(t.Boolean()) }),
      PaginationQuery,
    ]),
  });

type ListBody = {
  query: { validated: boolean; enrolled?: boolean; page?: number; limit?: number };
  resolved: { page: number; limit: number; offset: number };
};

const call = async (qs: string) => {
  const res = await app.handle(new Request(`http://localhost/list?${qs}`));
  // Only the 200 paths read `body`; the 4xx assertions check `status` alone.
  return { status: res.status, body: (await res.json()) as ListBody };
};

// ─── Story 001: Pagination query contract ────────────────────────────────────

describe("Story 001 — Pagination query contract", () => {
  it("AC1: page omitted → defaults to 1", async () => {
    const { status, body } = await call("validated=true");
    expect(status).toBe(200);
    expect(body.resolved.page).toBe(PAGE_DEFAULT);
  });

  it("AC2: limit omitted → defaults to 20, not the full result set", async () => {
    const { body } = await call("validated=true");
    expect(body.resolved.limit).toBe(LIMIT_DEFAULT);
    expect(LIMIT_DEFAULT).toBe(20);
  });

  it("AC3: explicit values are coerced from strings to numbers and applied", async () => {
    const { status, body } = await call("validated=true&page=3&limit=50");
    expect(status).toBe(200);
    expect(body.resolved).toEqual({ page: 3, limit: 50, offset: 100 });
    expect(typeof body.query.page).toBe("number");
  });

  it("AC4: page=0 and page=-1 are rejected with 400", async () => {
    expect((await call("validated=true&page=0")).status).toBe(400);
    expect((await call("validated=true&page=-1")).status).toBe(400);
  });

  it("AC5: limit=0 and limit above the maximum are rejected with 400", async () => {
    expect((await call("validated=true&limit=0")).status).toBe(400);
    expect((await call(`validated=true&limit=${LIMIT_MAX + 1}`)).status).toBe(400);
  });

  it("AC6: limit at exactly the maximum is accepted (inclusive bound)", async () => {
    const { status, body } = await call(`validated=true&limit=${LIMIT_MAX}`);
    expect(status).toBe(200);
    expect(body.resolved.limit).toBe(LIMIT_MAX);
  });

  it("AC7: non-numeric page is rejected with 400", async () => {
    expect((await call("validated=true&page=abc")).status).toBe(400);
  });

  it("AC8: fractional page or limit is rejected with 400 (guards LIMIT 1.5 reaching the DB)", async () => {
    expect((await call("validated=true&limit=1.5")).status).toBe(400);
    expect((await call("validated=true&page=2.7")).status).toBe(400);
  });

  it("AC9: existing filters are still accepted alongside the pagination params", async () => {
    const { status, body } = await call("validated=false&enrolled=true&page=2&limit=5");
    expect(status).toBe(200);
    expect(body.query.validated).toBe(false);
    expect(body.query.enrolled).toBe(true);
    expect(body.resolved).toEqual({ page: 2, limit: 5, offset: 5 });
  });

  it("AC10: a missing required filter still fails, so composition did not weaken validation", async () => {
    expect((await call("page=1")).status).toBe(400);
  });
});

// ─── Story 002: Response envelope ────────────────────────────────────────────

describe("Story 002 — Pagination response envelope", () => {
  const ItemSchema = t.Object({ id: t.Number() });
  const EnvelopeSchema = Paginated(ItemSchema);
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

  it("AC1: shape is { items, meta } with the four meta fields", () => {
    const page = buildPage(items(3), 137, 1, 20);
    expect(Object.keys(page).sort()).toEqual(["items", "meta"]);
    expect(Object.keys(page.meta).sort()).toEqual(["limit", "page", "total", "totalPages"]);
  });

  it("AC2: output validates against the generic envelope schema", () => {
    expect(Value.Check(EnvelopeSchema, buildPage(items(2), 2, 1, 20))).toBe(true);
  });

  it("AC3: meta echoes the effective page and limit actually applied", () => {
    expect(buildPage(items(5), 40, 3, 5).meta).toEqual({
      page: 3,
      limit: 5,
      total: 40,
      totalPages: 8,
    });
  });

  it("AC4: totalPages = ceil(total / limit)", () => {
    expect(buildPage(items(1), 21, 1, 20).meta.totalPages).toBe(2);
    expect(buildPage(items(1), 40, 1, 20).meta.totalPages).toBe(2);
    expect(buildPage(items(1), 41, 1, 20).meta.totalPages).toBe(3);
  });

  it("AC5: total = 0 → empty items and totalPages = 0, and still schema-valid", () => {
    const page = buildPage([], 0, 1, 20);
    expect(page.items).toEqual([]);
    expect(page.meta.totalPages).toBe(0);
    expect(Value.Check(EnvelopeSchema, page)).toBe(true);
  });

  it("AC6: a page beyond the end is a valid empty page, not an error", () => {
    const page = buildPage([], 40, 99, 20);
    expect(page.items).toEqual([]);
    expect(page.meta).toEqual({ page: 99, limit: 20, total: 40, totalPages: 2 });
    expect(Value.Check(EnvelopeSchema, page)).toBe(true);
  });

  it("AC7: last page may be partial; items never exceed limit (INV-1)", () => {
    const page = buildPage(items(7), 27, 2, 20);
    expect(page.items.length).toBe(7);
    expect(page.items.length).toBeLessThanOrEqual(page.meta.limit);
  });

  it("AC8: total is the filtered row count, not the returned item count", () => {
    expect(buildPage(items(20), 137, 1, 20).meta.total).toBe(137);
  });

  it("AC9: total exactly divisible by limit → final page full, next page empty", () => {
    expect(buildPage(items(20), 40, 2, 20).meta.totalPages).toBe(2);
    expect(buildPage([], 40, 3, 20).items).toEqual([]);
  });

  it("AC10: an envelope missing meta fails schema validation (guards silent regression)", () => {
    expect(Value.Check(EnvelopeSchema, { items: items(1) })).toBe(false);
    expect(Value.Check(EnvelopeSchema, items(1))).toBe(false);
  });
});

// ─── Story 003: Deterministic ordering / page stability (pure arithmetic half) ─

describe("Story 003 — Page window arithmetic and stability", () => {
  it("AC1: offset = (page - 1) * limit; page 1 starts at 0", () => {
    expect(resolvePage({ page: 1, limit: 20 }).offset).toBe(0);
    expect(resolvePage({ page: 2, limit: 20 }).offset).toBe(20);
    expect(resolvePage({ page: 7, limit: 15 }).offset).toBe(90);
  });

  it("AC2: resolvePage applies defaults when called with no query (service-level safety net)", () => {
    expect(resolvePage()).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(resolvePage({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("AC3: partial query keeps the supplied value and defaults the other", () => {
    expect(resolvePage({ page: 4 })).toEqual({ page: 4, limit: 20, offset: 60 });
    expect(resolvePage({ limit: 5 })).toEqual({ page: 1, limit: 5, offset: 0 });
  });

  it("AC4: windows tile a fixed ordered set exactly once — no duplicate, no omission", () => {
    const rows = Array.from({ length: 47 }, (_, i) => i);
    const limit = 10;
    const totalPages = buildPage([], rows.length, 1, limit).meta.totalPages;
    const seen: number[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const { offset } = resolvePage({ page, limit });
      seen.push(...rows.slice(offset, offset + limit));
    }
    expect(seen).toEqual(rows);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("AC5: the page after the last yields nothing", () => {
    const rows = Array.from({ length: 47 }, (_, i) => i);
    const { offset } = resolvePage({ page: 6, limit: 10 });
    expect(rows.slice(offset, offset + 10)).toEqual([]);
  });
});
