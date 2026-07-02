import { type Static, t } from "elysia";

export const AnswerViewItemSchema = t.Object({
  answerId: t.Number(),
  questionId: t.Number(),
  category: t.String(),
  status: t.String(),
  selectedChoice: t.String(),
  latestVerdictChoice: t.Nullable(t.String()),
  latestDescription: t.Nullable(t.String()),
});

export const AnswerViewSchema = t.Array(AnswerViewItemSchema);

const ApproveEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("approve"),
});

const ChangeScoreEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("change_score"),
  verdictChoice: t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3")]),
  description: t.String({ minLength: 1 }),
});

const RejectEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("reject"),
  description: t.String({ minLength: 1 }),
});

export const VerdictEntrySchema = t.Union([
  ApproveEntrySchema,
  ChangeScoreEntrySchema,
  RejectEntrySchema,
]);
export const VerdictBatchSchema = t.Array(VerdictEntrySchema, { minItems: 1 });

export type VerdictEntry = Static<typeof VerdictEntrySchema>;
export type VerdictBatch = Static<typeof VerdictBatchSchema>;

// --- Per-Answer verdict save (ADR-0005) ---
// The single-Answer save body carries NO answerId — it is a path parameter.
// (The batch schemas above are retained until bolt 021 removes the batch route.)
const ApproveSaveSchema = t.Object({ decision: t.Literal("approve") });
const ChangeScoreSaveSchema = t.Object({
  decision: t.Literal("change_score"),
  verdictChoice: t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3")]),
  description: t.String({ minLength: 1 }),
});
const RejectSaveSchema = t.Object({
  decision: t.Literal("reject"),
  description: t.String({ minLength: 1 }),
});

export const VerdictSaveBodySchema = t.Union([
  ApproveSaveSchema,
  ChangeScoreSaveSchema,
  RejectSaveSchema,
]);
export type VerdictSaveBody = Static<typeof VerdictSaveBodySchema>;

/** Finalize takes no body (ADR-0005) — the whole-Cover transition derives from persisted logs. */
export const FinalizeSchema = t.Object({});
