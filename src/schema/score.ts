import { t } from "elysia";
import { BaseAwardSelect } from "./index";
import { Paginated } from "./pagination";

export const ScoreGroupSchema = t.Object({
  scoredCount: t.Integer({ minimum: 0 }),
  maxScore: t.Integer({ minimum: 0 }),
  achievedScore: t.Integer({ minimum: 0 }),
  percentage: t.Integer({ minimum: 0, maximum: 100 }),
});

// Derived from the `Grades` enum via the generated base schema, so the wire values cannot drift
// from the database.
export const GradeSchema = BaseAwardSelect.properties.grade;

export const ScoreReportSchema = t.Object({
  factoryId: t.Number(),
  factoryNameTh: t.String(),
  coverId: t.Number(),
  coverStatus: t.String(),
  enrollId: t.Number(),
  /**
   * Common Era fiscal year of this record. Optional because the Factory list with
   * `enrolled=false` disables fiscal-year filtering entirely, so its rows may span years and no
   * single value would be truthful. See docs/api-conventions.md.
   */
  fiscalYear: t.Optional(t.Number()),
  grade: t.Optional(t.Nullable(GradeSchema)),
  scoring: t.Object({
    total: ScoreGroupSchema,
    collaborate: ScoreGroupSchema,
    disease: ScoreGroupSchema,
    safety: ScoreGroupSchema,
    mental: ScoreGroupSchema,
    outcome: ScoreGroupSchema,
  }),
});

export const ScoreReportListSchema = t.Array(ScoreReportSchema);

/**
 * Paginated response for the three staff Score Report list endpoints (intent 012).
 * `ScoreReportSchema` above is unchanged; only the wrapper is new.
 * See docs/adr/0007-pagination-envelope-scoped-exception.md.
 *
 * The Factory single-report endpoint keeps `ScoreReportSchema` bare — one Cover, one report.
 */
export const ScoreReportPageSchema = Paginated(ScoreReportSchema);
