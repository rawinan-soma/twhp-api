import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { UpdateAnswerWithFilesSchema } from "./answer";

const app = new Elysia().patch("/", ({ body }) => body, {
  body: UpdateAnswerWithFilesSchema,
  parse: "multipart/form-data",
});

const patch = async (entries: Record<string, string | Blob>) => {
  const form = new FormData();
  form.set("questionId", "42");
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return app.handle(new Request("http://localhost/", { method: "PATCH", body: form }));
};

describe("UpdateAnswerWithFilesSchema deletion flags", () => {
  it("decodes multipart true and false strings", async () => {
    const response = await patch({ delete_file_1_2: "true", delete_file_3_3: "false" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      questionId: 42,
      delete_file_1_2: true,
      delete_file_3_3: false,
    });
  });

  it("keeps every deletion flag optional", async () => {
    const response = await patch({});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ questionId: 42 });
  });

  it("rejects values other than true or false", async () => {
    const response = await patch({ delete_file_1_2: "yes" });
    expect(response.status).toBe(422);
  });
});
