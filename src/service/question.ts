import { db } from "../drizzle";
import { questions } from "../drizzle/schema";

export const createQuestionService = (database: typeof db) => {
  return {
    getAllQuestions: async () => {
      return await database.select().from(questions);
    },
  };
};

export const questionService = createQuestionService(db);
