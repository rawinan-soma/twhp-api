import { db } from "../drizzle";
import { answerLogs, answers } from "../drizzle/schema";
import type { CreateAnswerDto } from "../schema/answer";

export const createAnswerRepository = (database: typeof db) => ({
  create: async (dto: CreateAnswerDto, coverId: number) => {
    return await database.transaction(async (tx) => {
      const answerId = await tx
        .insert(answers)
        .values({ coverId: coverId, ...dto })
        .returning()
        .then((res) => res[0].id);

      await tx
        .insert(answerLogs)
        .values({ answerId: answerId, status: "in_progress" });
    });
  },
});

export const answerRepository = createAnswerRepository(db);
