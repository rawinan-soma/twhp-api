import { type Static, type TSchema, t } from "elysia";

/**
 * Shared offset-pagination contract for the staff list endpoints.
 *
 * Scope: this envelope applies to the nine staff list endpoints only
 * (`/{admins,evaluators,provincialOfficers}/{factories,enrolls,score}`) — it is NOT a global
 * response wrapper. An endpoint gets the envelope if and only if its result set grows with the
 * data; bounded collections (questions, per-cover answers, location lookups) stay bare arrays.
 * See docs/adr/0007-pagination-envelope-scoped-exception.md.
 *
 * Strategy is offset-based, per memory-bank/standards/api-conventions.md and
 * docs/adr/0009-offset-pagination-for-staff-lists.md. Every paginated query MUST impose a total
 * order — an ordering whose final sort column is unique — or OFFSET has no defined meaning and
 * rows can repeat or vanish between pages.
 */

export const PAGE_DEFAULT = 1;
export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 100;

/**
 * Compose into a route's existing query schema with `t.Composite`; do not replace it, so existing
 * filters keep their declarations and their OpenAPI documentation.
 *
 * `t.Numeric` (not `t.Number`) because query values arrive as strings and need coercion.
 * `multipleOf: 1` is required: `t.Numeric` maps to JSON-schema `number`, so without it a fractional
 * `?limit=1.5` validates and reaches the database as `LIMIT 1.5`.
 * Out-of-range values are rejected here, before any query runs — the `limit` ceiling is a
 * resource-exhaustion control, not only a performance one.
 */
export const PaginationQuery = t.Object({
  page: t.Optional(
    t.Numeric({
      minimum: 1,
      multipleOf: 1,
      default: PAGE_DEFAULT,
      description: "1-indexed page number. The first page is 1.",
    }),
  ),
  limit: t.Optional(
    t.Numeric({
      minimum: 1,
      maximum: LIMIT_MAX,
      multipleOf: 1,
      default: LIMIT_DEFAULT,
      description: `Items per page. Max ${LIMIT_MAX}.`,
    }),
  ),
});
export type PaginationQueryDto = Static<typeof PaginationQuery>;

export const PaginationMeta = t.Object({
  page: t.Integer({ minimum: 1, description: "Effective page applied, including defaults" }),
  limit: t.Integer({ minimum: 1, description: "Effective limit applied, including defaults" }),
  total: t.Integer({
    minimum: 0,
    description: "Rows matching the complete filter predicate — not the number of items returned",
  }),
  totalPages: t.Integer({ minimum: 0, description: "ceil(total / limit); 0 when total is 0" }),
});

/** Wraps any item schema in the standard list envelope. */
export const Paginated = <T extends TSchema>(item: T) =>
  t.Object({ items: t.Array(item), meta: PaginationMeta });

export type ResolvedPage = { page: number; limit: number; offset: number };

/**
 * Page Resolver — normalises possibly-absent query values to an effective page window.
 *
 * Defaults are declared in `PaginationQuery` AND re-applied here on purpose. Whether Elysia
 * materialises a TypeBox `default` for an absent query parameter is version-dependent, and the
 * contract must not rest on it. If the schema does supply it, this is a no-op.
 */
export const resolvePage = (query?: PaginationQueryDto): ResolvedPage => {
  const page = query?.page ?? PAGE_DEFAULT;
  const limit = query?.limit ?? LIMIT_DEFAULT;
  return { page, limit, offset: (page - 1) * limit };
};

/**
 * Page Assembler — sole owner of the `totalPages` calculation, so the invariant holds in exactly
 * one place. `total` must be derived from the same predicate that produced `items`; a count and a
 * page built from different predicates is a broken response.
 *
 * A page beyond the last page is a valid, successful result: empty `items` with accurate `meta`.
 */
export const buildPage = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  meta: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  },
});
