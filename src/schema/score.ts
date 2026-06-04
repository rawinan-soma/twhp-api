import { t } from "elysia";

export const ScoreReportSchema = t.Object({
  factoryId: t.Number(),
  factoryNameTh: t.String(),
  coverId: t.Number(),
  coverStatus: t.String(),
  enrollId: t.Number(),
  totalScore: t.Integer({ minimum: 0, maximum: 100 }),
  collaborate: t.Integer({ minimum: 0, maximum: 100 }),
  disease: t.Integer({ minimum: 0, maximum: 100 }),
  safety: t.Integer({ minimum: 0, maximum: 100 }),
  mental: t.Integer({ minimum: 0, maximum: 100 }),
  outcome: t.Integer({ minimum: 0, maximum: 100 }),
});

export const ScoreReportListSchema = t.Array(ScoreReportSchema);
