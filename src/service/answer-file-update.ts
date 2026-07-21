import type { UpdateAnswerWithFilesDto } from "../schema/answer";

export const ANSWER_FILE_SLOTS = [
  { row: 1, uploadKey: "file_1_1", deleteKey: "delete_file_1_1", column: "fileUrl1_1" },
  { row: 1, uploadKey: "file_1_2", deleteKey: "delete_file_1_2", column: "fileUrl1_2" },
  { row: 1, uploadKey: "file_1_3", deleteKey: "delete_file_1_3", column: "fileUrl1_3" },
  { row: 2, uploadKey: "file_2_1", deleteKey: "delete_file_2_1", column: "fileUrl2_1" },
  { row: 2, uploadKey: "file_2_2", deleteKey: "delete_file_2_2", column: "fileUrl2_2" },
  { row: 2, uploadKey: "file_2_3", deleteKey: "delete_file_2_3", column: "fileUrl2_3" },
  { row: 3, uploadKey: "file_3_1", deleteKey: "delete_file_3_1", column: "fileUrl3_1" },
  { row: 3, uploadKey: "file_3_2", deleteKey: "delete_file_3_2", column: "fileUrl3_2" },
  { row: 3, uploadKey: "file_3_3", deleteKey: "delete_file_3_3", column: "fileUrl3_3" },
] as const;

export type AnswerFileColumn = (typeof ANSWER_FILE_SLOTS)[number]["column"];
export type AnswerFileState = Record<AnswerFileColumn, string | null | undefined>;
export type AnswerFileAction = "keep" | "replace" | "delete_explicit" | "delete_implicit";

export type AnswerFilePlanEntry = (typeof ANSWER_FILE_SLOTS)[number] & {
  action: AnswerFileAction;
  existing: string | null;
  upload: File | undefined;
  explicitDelete: boolean;
};

export const buildAnswerFilePlan = (
  dto: UpdateAnswerWithFilesDto,
  existing: AnswerFileState,
  implicitClearRows: readonly number[] = [],
): AnswerFilePlanEntry[] =>
  ANSWER_FILE_SLOTS.map((slot) => {
    const upload = dto[slot.uploadKey];
    const explicitDelete = dto[slot.deleteKey] === true;
    const implicitDelete = implicitClearRows.includes(slot.row);
    const action: AnswerFileAction = explicitDelete
      ? "delete_explicit"
      : implicitDelete
        ? "delete_implicit"
        : upload
          ? "replace"
          : "keep";

    return {
      ...slot,
      action,
      existing: existing[slot.column] ?? null,
      upload,
      explicitDelete,
    };
  });

export const hasExplicitDeletion = (plan: readonly AnswerFilePlanEntry[]) =>
  plan.some((entry) => entry.explicitDelete);

export const findUploadDeleteConflict = (plan: readonly AnswerFilePlanEntry[]) =>
  plan.find((entry) => entry.upload && entry.explicitDelete)?.uploadKey ?? null;

export const hasProjectedFile = (
  plan: readonly AnswerFilePlanEntry[],
  column: AnswerFileColumn,
) => {
  const entry = plan.find((candidate) => candidate.column === column);
  return entry?.action === "replace" || (entry?.action === "keep" && !!entry.existing);
};
