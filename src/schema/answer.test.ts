import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { ANSWER_FILE_SLOTS } from "../service/answer-file-update";
import { UpdateAnswerWithFilesSchema } from "./answer";

const deletionFlags = [
  "delete_file_1_1",
  "delete_file_1_2",
  "delete_file_1_3",
  "delete_file_2_1",
  "delete_file_2_2",
  "delete_file_2_3",
  "delete_file_3_1",
  "delete_file_3_2",
  "delete_file_3_3",
] as const;

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
  it("decodes true and false for every public multipart deletion flag", async () => {
    for (const deletionFlag of deletionFlags) {
      for (const [encoded, decoded] of [
        ["true", true],
        ["false", false],
      ] as const) {
        const response = await patch({ [deletionFlag]: encoded });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          questionId: 42,
          [deletionFlag]: decoded,
        });
      }
    }
  });

  it("keeps public deletion flags aligned with planner slot keys", () => {
    expect(ANSWER_FILE_SLOTS.map(({ deleteKey }) => deleteKey)).toEqual(deletionFlags);
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
