import { type Static, t } from "elysia";
// biome-ignore lint/style/useImportType: used in a `typeof` type-query below, so must be a value import
import { standardTypes } from "../drizzle/schema";

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

/**
 * One of the 11 factory standards. Written as an explicit literal union (NOT
 * `t.Union(standardTypes.enumValues.map(...))`) — a mapped array degrades Elysia's response-type
 * inference on the routes. The `_standardKeysInSync` guard below keeps it aligned with the pgEnum.
 */
export const StandardKeySchema = t.Union([
  t.Literal("standardHC"),
  t.Literal("standardSAN"),
  t.Literal("standardSANPlus"),
  t.Literal("standardWellness"),
  t.Literal("standardSafety"),
  t.Literal("standardTIS18001"),
  t.Literal("standardISO45001"),
  t.Literal("standardISO14001"),
  t.Literal("standardZero"),
  t.Literal("standard5S"),
  t.Literal("standardHAS"),
]);

// Compile-time guard: StandardKeySchema must equal the standardTypes pgEnum (both directions).
type _StandardKey = Static<typeof StandardKeySchema>;
type _EnumStandardKey = (typeof standardTypes.enumValues)[number];
type _StandardKeysInSync = [_StandardKey] extends [_EnumStandardKey]
  ? [_EnumStandardKey] extends [_StandardKey]
    ? true
    : never
  : never;
export const _standardKeysInSync: _StandardKeysInSync = true;

/**
 * A factory's declared standard certificate surfaced in the cover-review read.
 * `fileName` is the stored filename (not a presigned URL) — resolve via `/file/presigned-url`.
 * Only claimed + uploaded standards are emitted (intent 009).
 */
export const StandardFileItemSchema = t.Object({
  standard: StandardKeySchema,
  fileName: t.String(),
});
export type StandardFileItem = Static<typeof StandardFileItemSchema>;

/** Cover-review read: the scoped answers plus the factory's claimed+uploaded standard files. */
export const AnswerViewSchema = t.Object({
  answers: t.Array(AnswerViewItemSchema),
  standards: t.Array(StandardFileItemSchema),
});

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
