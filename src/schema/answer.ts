import { Static, t } from "elysia";
import { BaseAnswerInsert } from ".";
import { FileOptions } from "elysia/type-system/types";

export const fileOption: FileOptions = { type: "application/pdf", maxSize: "10m" };

export const CreateAnswerSchema = t.Omit(BaseAnswerInsert, ["id", "coverId"]);

export const CreateAnswerWithFilesSchema = t.Object({
  questionId: t.Numeric(),
  selectedChoice: t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3"), t.Literal("n/a")]),
  file_1_1: t.Optional(t.File(fileOption)),
  file_1_2: t.Optional(t.File(fileOption)),
  file_1_3: t.Optional(t.File(fileOption)),
  file_2_1: t.Optional(t.File(fileOption)),
  file_2_2: t.Optional(t.File(fileOption)),
  file_2_3: t.Optional(t.File(fileOption)),
  file_3_1: t.Optional(t.File(fileOption)),
  file_3_2: t.Optional(t.File(fileOption)),
  file_3_3: t.Optional(t.File(fileOption)),
});

export const UpdateAnswerWithFilesSchema = t.Object({
  questionId: t.Numeric(),
  selectedChoice: t.Optional(
    t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3"), t.Literal("n/a")]),
  ),
  file_1_1: t.Optional(t.File(fileOption)),
  file_1_2: t.Optional(t.File(fileOption)),
  file_1_3: t.Optional(t.File(fileOption)),
  file_2_1: t.Optional(t.File(fileOption)),
  file_2_2: t.Optional(t.File(fileOption)),
  file_2_3: t.Optional(t.File(fileOption)),
  file_3_1: t.Optional(t.File(fileOption)),
  file_3_2: t.Optional(t.File(fileOption)),
  file_3_3: t.Optional(t.File(fileOption)),
});

export type CreateAnswerDto = Static<typeof CreateAnswerSchema>;
export type CreateAnswerWithFilesDto = Static<typeof CreateAnswerWithFilesSchema>;
export type UpdateAnswerWithFilesDto = Static<typeof UpdateAnswerWithFilesSchema>;
