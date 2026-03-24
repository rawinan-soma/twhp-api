import { defineConfig } from "drizzle-kit";
import { env } from "./src/config";

export default defineConfig({
  out: "./src/core/drizzle/generated",
  schema: "./src/drizzle/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
