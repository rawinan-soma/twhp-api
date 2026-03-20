import { db } from "../drizzle";
import { questions } from "../drizzle/schema";

export const createQuestionRepository = (database: typeof db) => ({
  findAll: async () => {
    return database.select().from(questions);
  },
});

export const questionRepository = createQuestionRepository(db);
