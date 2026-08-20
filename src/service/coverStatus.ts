import { desc, eq } from "drizzle-orm";
import type { db } from "../drizzle";
import { coverLogs, covers } from "../drizzle/schema";

/**
 * Shared latest-log-wins resolution for a Cover's current status.
 *
 * See docs/adr/0010-lateral-latest-cover-log-resolution.md.
 *
 * A Cover's current status is the `coverLogs` row with the greatest serial `id` — never the greatest
 * timestamp (ADR-0003, intents 007 and 011). Until intent 012 this rule lived only in application
 * code; pagination requires it to be testable in a `WHERE` clause so that the count query and the
 * page query can share one predicate.
 *
 * Every query that filters, counts, or paginates on Cover status MUST import `latestCoverLogLateral`
 * from here. Writing a second correlated subquery over `coverLogs` is a review failure — two
 * implementations of "current status" is how two subtly different definitions enter one codebase.
 */

export type CoverStatusValue = "in_progress" | "in_review" | "finished";

export const LATEST_COVER_LOG_ALIAS = "latest_cover_log";

/**
 * The correlated subquery resolving one Cover's current status, aliased for a `LEFT JOIN LATERAL`.
 *
 * Contract — both clauses are contractual, not incidental:
 *   • `ORDER BY coverLogs.id DESC` IS the latest-log-wins rule. Ordering by any timestamp is wrong.
 *   • `LIMIT 1` is a CORRECTNESS control, not an optimisation. `covers → coverLogs` is one-to-many,
 *     so without it the outer row is returned once per log — the row-multiplication defect ADR-0008
 *     removed from the factory lists.
 *
 * Correlates on `covers.id`, so every caller must have joined `covers` before lateral-joining this.
 *
 * Resolves status only; it does not filter. Callers' policies differ (the enrollment lists map four
 * filter values including a `none` absence test; the score reports select `in_review` + `finished`),
 * so the mechanism is shared and the policy is not.
 *
 * Usage:
 *   const latest = latestCoverLogLateral(database);
 *   query.leftJoin(covers, eq(covers.enrollId, enrolls.id)).leftJoinLateral(latest, sql`true`)
 */
export const latestCoverLogLateral = (database: typeof db) =>
  database
    .select({ status: coverLogs.status })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, covers.id))
    .orderBy(desc(coverLogs.id))
    .limit(1)
    .as(LATEST_COVER_LOG_ALIAS);

/**
 * Shape B — the current status of ONE already-known Cover.
 *
 * The lateral above cannot serve this call site: it is a correlated subquery and needs a `covers`
 * join on its left to correlate against. A caller that already holds a cover id has no list and
 * nothing to correlate, so it needs a standalone read.
 *
 * Both shapes express the same domain rule — greatest `coverLogs.id` wins. Only their SQL differs.
 * Keeping both here is what lets the review gate be phrased against the source of the rule rather
 * than against a SQL fragment. See the Amendment section of docs/adr/0010.
 *
 * Returns `null` when the Cover has no log at all; callers apply their own fallback.
 */
export const latestCoverLogFor = async (database: typeof db, coverId: number) =>
  await database
    .select({ status: coverLogs.status })
    .from(coverLogs)
    .where(eq(coverLogs.coverId, coverId))
    .orderBy(desc(coverLogs.id))
    .limit(1)
    .then((rows) => rows[0]?.status ?? null);
