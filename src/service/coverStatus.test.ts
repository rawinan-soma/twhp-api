import { describe, expect, it } from "bun:test";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgSelectQueryBuilder } from "drizzle-orm/pg-core";
import { covers, enrolls, factories, provinces } from "../drizzle/schema";
import { LATEST_COVER_LOG_ALIAS, latestCoverLogLateral } from "./coverStatus";

// ─── SQL-shape tests (no database required) ──────────────────────────────────
//
// `latestCoverLogLateral` is now shared by the enrollment list path (bolt 026) and the score report
// path (bolt 027) — ADR-0010 requires it to have its own tests rather than relying on each caller's.
//
// These assert the SQL the builder emits. `.toSQL()` compiles without connecting, so unlike the
// DB-backed suites these run everywhere. They cannot prove the query returns correct rows; they
// prove the query has the shape the ADR makes contractual, which is the part a future edit is most
// likely to break silently.

const database = drizzle("postgres://user:pass@localhost:5432/never-connected");
const latest = latestCoverLogLateral(database);

const withJoins = <Q extends PgSelectQueryBuilder>(query: Q) =>
  query
    .innerJoin(factories, eq(enrolls.factoryId, factories.accountId))
    .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
    .leftJoin(covers, eq(covers.enrollId, enrolls.id))
    .leftJoinLateral(latest, sql`true`);

const pageSql = (predicate: ReturnType<typeof and>) =>
  withJoins(
    database
      .select({ id: enrolls.id, coverId: covers.id, coverStatus: latest.status })
      .from(enrolls)
      .$dynamic(),
  )
    .where(predicate)
    .orderBy(desc(enrolls.enrollDate), desc(enrolls.id))
    .limit(20)
    .offset(40)
    .toSQL().sql;

const countSql = (predicate: ReturnType<typeof and>) =>
  withJoins(database.select({ value: count() }).from(enrolls).$dynamic())
    .where(predicate)
    .toSQL().sql;

// The lateral subquery contains its own `where`, `order by` and `limit`. Slicing at the FIRST
// occurrence of any of them inspects the subquery instead of the outer query — a mistake these
// helpers exist to prevent, and one that made three assertions here fail loudly before the
// implementation was ever at fault.
const outerOf = (statement: string) => {
  const marker = " on true";
  const index = statement.indexOf(marker);
  return index === -1 ? statement : statement.slice(index + marker.length);
};

const whereClauseOf = (statement: string) => {
  const outer = outerOf(statement);
  const start = outer.indexOf(" where ");
  if (start === -1) return "";
  const rest = outer.slice(start);
  const end = rest.indexOf(" order by ");
  return end === -1 ? rest : rest.slice(0, end);
};

const orderClauseOf = (statement: string) => {
  const outer = outerOf(statement);
  const start = outer.indexOf(" order by ");
  if (start === -1) return "";
  const rest = outer.slice(start);
  const end = rest.indexOf(" limit ");
  return end === -1 ? rest : rest.slice(0, end);
};

describe("ADR-0010 — latest-log-wins is resolved by a correlated lateral", () => {
  const statement = pageSql(undefined);

  it("AC1: emits a LATERAL join, not a plain join or an uncorrelated subquery", () => {
    expect(statement).toContain("left join lateral");
  });

  it("AC2: correlates on the outer Cover — this is what keeps it scoped to the page", () => {
    expect(statement).toContain('"CoverLogs"."cover_id" = "Covers"."id"');
  });

  it("AC3: orders by CoverLogs.id DESCENDING — the latest-log-wins rule itself", () => {
    expect(statement).toContain('order by "CoverLogs"."id" desc');
  });

  it("AC4: never orders the logs by a timestamp column", () => {
    const lateral = statement.slice(statement.indexOf("left join lateral"));
    const subquery = lateral.slice(0, lateral.indexOf(") "));
    expect(subquery).not.toContain("update_date");
    expect(subquery).not.toContain("created");
    expect(subquery).not.toContain("timestamp");
  });

  it("AC5: takes exactly one log — the anti-multiplication control, not an optimisation", () => {
    const lateral = statement.slice(statement.indexOf("left join lateral"));
    expect(lateral).toMatch(/order by "CoverLogs"\."id" desc limit \$\d+/);
  });

  it("AC6: uses the shared alias constant", () => {
    expect(statement).toContain(`"${LATEST_COVER_LOG_ALIAS}"`);
  });

  it("AC7: joins Covers with a LEFT join so an enroll without a cover survives", () => {
    expect(statement).toContain('left join "Covers" on "Covers"."enroll_id" = "Enrolls"."id"');
  });
});

describe("Story 005 — cover-status filter maps to SQL, and `none` is an absence test", () => {
  it("AC1: a status filter tests the resolved lateral column", () => {
    expect(whereClauseOf(pageSql(eq(latest.status, "finished")))).toContain(
      `"${LATEST_COVER_LOG_ALIAS}"."status" =`,
    );
  });

  it("AC2: `none` tests Covers.id IS NULL — the absence of a cover", () => {
    expect(whereClauseOf(pageSql(isNull(covers.id)))).toContain('"Covers"."id" is null');
  });

  it("AC3: `none` must NOT be expressed as latest.status IS NULL", () => {
    // That would also match an enroll whose cover exists but has no log yet — a different
    // population. This is the single most likely implementation error in this bolt.
    const where = whereClauseOf(pageSql(isNull(covers.id)));
    expect(where).not.toContain(`"${LATEST_COVER_LOG_ALIAS}"."status" is null`);
  });

  it("AC4: no filter emits no cover-status predicate at all", () => {
    const where = whereClauseOf(pageSql(eq(provinces.healthRegion, 5)));
    expect(where).not.toContain(`"${LATEST_COVER_LOG_ALIAS}"."status"`);
    expect(where).not.toContain('"Covers"."id" is null');
  });
});

describe("Story 006 — count and page share one predicate, and the order is total", () => {
  const predicate = and(eq(provinces.healthRegion, 5), eq(latest.status, "finished"));

  it("AC1: the count query and the page query emit an IDENTICAL where clause", () => {
    // The invariant that spans two separate queries: if these diverge, `meta.total` describes a
    // different population than `items`, and every page count the client renders is wrong.
    expect(whereClauseOf(countSql(predicate))).toBe(whereClauseOf(pageSql(predicate)));
  });

  it("AC2: the count query carries the same join chain, so inner-join exclusions match", () => {
    const statement = countSql(predicate);
    expect(statement).toContain('inner join "Factories"');
    expect(statement).toContain('inner join "Provinces"');
    expect(statement).toContain('left join "Covers"');
    expect(statement).toContain("left join lateral");
  });

  it("AC3: the page query orders by enrollDate DESC then id DESC (a total order)", () => {
    expect(orderClauseOf(pageSql(undefined))).toBe(
      ' order by "Enrolls"."enroll_date" desc, "Enrolls"."id" desc',
    );
  });

  it("AC4: the tiebreaker is a unique column — without it OFFSET can repeat or skip rows", () => {
    expect(orderClauseOf(pageSql(undefined))).toContain('"Enrolls"."id"');
  });

  it("AC5: the page query applies LIMIT and OFFSET; the count query applies neither", () => {
    expect(outerOf(pageSql(predicate))).toMatch(/limit \$\d+ offset \$\d+/);
    const countedOuter = outerOf(countSql(predicate));
    expect(countedOuter).not.toContain(" offset ");
    expect(countedOuter).not.toContain(" limit ");
  });

  it("AC6: the count query counts rows, not a projection", () => {
    expect(countSql(predicate)).toContain("select count(*)");
  });
});
