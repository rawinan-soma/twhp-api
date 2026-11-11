import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

export const pgErrorOf = (error: unknown) =>
  error instanceof DrizzleQueryError && error.cause instanceof DatabaseError
    ? error.cause
    : undefined;
