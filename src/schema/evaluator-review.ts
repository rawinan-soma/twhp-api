import { type Static, t } from "elysia";

export const AnswerViewItemSchema = t.Object({
  answerId: t.Number(),
  questionId: t.Number(),
  category: t.String(),
  status: t.String(),
  selectedChoice: t.String(),
  latestVerdictChoice: t.Nullable(t.String()),
  latestDescription: t.Nullable(t.String()),
  // Evidence filenames (not presigned URLs); resolve each via the file endpoint.
  // Files accumulate by level: choice N has files at rows 1..N (up to 3 per row).
  fileUrl1_1: t.Nullable(t.String()),
  fileUrl1_2: t.Nullable(t.String()),
  fileUrl1_3: t.Nullable(t.String()),
  fileUrl2_1: t.Nullable(t.String()),
  fileUrl2_2: t.Nullable(t.String()),
  fileUrl2_3: t.Nullable(t.String()),
  fileUrl3_1: t.Nullable(t.String()),
  fileUrl3_2: t.Nullable(t.String()),
  fileUrl3_3: t.Nullable(t.String()),
});

export const AnswerViewSchema = t.Array(AnswerViewItemSchema);

// --- Per-Answer verdict save (ADR-0005) ---
// The single-Answer save body carries NO answerId — it is a path parameter.
// The former batch schema (VerdictBatchSchema/VerdictEntry) was removed with the batch
// route in bolt 021; the save + separate finalize are the only write paths now.
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
