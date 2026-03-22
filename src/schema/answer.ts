import { Static, t } from "elysia";
import { BaseAnswerInsert } from ".";

export const CreateAnswerSchema = t.Omit(BaseAnswerInsert, ["id", "coverId"]);

export type CreateAnswerDto = Static<typeof CreateAnswerSchema>;
