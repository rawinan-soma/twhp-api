import { t } from "elysia";

export const ScoreGroupSchema = t.Object({
  scoredCount: t.Integer({ minimum: 0 }),
  maxScore: t.Integer({ minimum: 0 }),
  achievedScore: t.Integer({ minimum: 0 }),
  percentage: t.Integer({ minimum: 0, maximum: 100 }),
});

export const GradeSchema = t.Union([
  t.Literal("gold"),
  t.Literal("silver"),
  t.Literal("certificate"),
  t.Literal("joined"),
]);

export const ScoreReportSchema = t.Object({
  factoryId: t.Number(),
  factoryNameTh: t.String(),
  coverId: t.Number(),
  coverStatus: t.String(),
  enrollId: t.Number(),
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
