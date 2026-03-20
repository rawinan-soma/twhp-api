import { Static, t } from "elysia";
import { BaseAnswerInsert } from ".";

export const CreateAnswerSchema = t.Omit(BaseAnswerInsert, ["id", "coverId"]);

// export const createAnswerSchema = z.object({
//   questionId: z.number(),
//   fileUrl1: z.string(),
//   fileUrl2: z.string(),
//   fileUrl3: z.string(),
//   selectedChoice: z.enum(["0", "1", "2", "3", "n/a"]),
// });

export type CreateAnswerDto = Static<typeof CreateAnswerSchema>;
