# Factory Answer Evidence Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a Factory to explicitly delete one Answer evidence object during an `in_review` multipart PATCH while preserving omitted files and the existing evaluator-finalization cleanup for rejected Answers.

**Architecture:** Extend the PATCH DTO with nine optional multipart Boolean deletion flags. Isolate slot mapping and projected-state decisions in a small pure module, then make `answerService.update` validate the complete projected state before strict MinIO deletion and the database transaction. Evaluator reject/finalize behavior remains unchanged.

**Tech Stack:** Bun, TypeScript, Elysia/TypeBox, Drizzle/PostgreSQL, MinIO, `bun:test`, Biome.

## Global Constraints

- `delete_file_<row>_<slot>` is optional; omitted or `false` keeps the existing file and `true` deletes it.
- A successful explicit deletion removes the exact MinIO object and persists `null` in only the matching Answer column.
- Explicit deletion is allowed only when the latest AnswerLog is `in_review`.
- Deletion availability is independent of `Question.special` and standard classification; existing evidence requirements still validate the projected state.
- Supplying a replacement PDF and `delete_file_* = true` for the same slot returns HTTP 400 before MinIO or database mutation.
- Saving evaluator `reject`/`change_score` remains side-effect free; ODPC/admin finalization continues deleting all evidence for rejected Answers.
- Do not change PostgreSQL schema, score calculation, negotiation behavior, or evaluator finalization.
- Do not regenerate OpenAPI artifacts without separate approval.
- Never run `bun run test`, bare `bun test`, or an integration test until `DATABASE_URL` is explicitly confirmed as a disposable, migrated, seeded test database.
- Do not run write-mode Biome scripts (`bun run format`, `bun run lint`, or `bun run check`).
- Do not commit on `main`; execute commit steps only in an approved feature branch/worktree.

## File Structure

- Create `src/schema/answer.test.ts`: isolated multipart decoding tests for deletion flags.
- Modify `src/schema/answer.ts`: reusable multipart Boolean transform plus nine optional deletion flags.
- Create `src/service/answer-file-update.ts`: slot metadata and pure projected-state planning.
- Create `src/service/answer-file-update.test.ts`: isolated unit tests for keep, replace, explicit delete, implicit clear, and conflict decisions.
- Modify `src/service/answer.ts`: use the plan for validation, strict explicit deletion, MinIO processing, and persistence.
- Modify `src/service/answer.integration.test.ts`: PostgreSQL-backed service acceptance tests with MinIO methods mocked.
- Modify `src/routes/factories/assessments/index.ts`: document new 400/500 service responses.
- Modify `docs/api-conventions.md`: make the already-started deletion contract match runtime behavior.
- Modify `docs/business-rules.md`: replace the statement that explicit deletion is unavailable.

---

### Task 1: Multipart Request Contract

**Files:**
- Create: `src/schema/answer.test.ts`
- Modify: `src/schema/answer.ts:5-65`

**Interfaces:**
- Consumes: Elysia `t.Transform`, the existing PDF `fileOption`, and multipart parsing.
- Produces: `MultipartBoolean` and `UpdateAnswerWithFilesDto` properties `delete_file_1_1` through `delete_file_3_3`, decoded as `boolean | undefined`.

- [ ] **Step 1: Write the failing schema tests**

Create `src/schema/answer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run:

```bash
bun test src/schema/answer.test.ts
```

Expected: FAIL because `delete_file_1_2` and `delete_file_3_3` are absent from the schema and are stripped from the decoded response.

- [ ] **Step 3: Add the multipart Boolean transform and all deletion fields**

Add after `fileOption` in `src/schema/answer.ts`:

```ts
export const MultipartBoolean = t
  .Transform(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]))
  .Decode((value) => value === true || value === "true")
  .Encode((value) => value);
```

Add to `UpdateAnswerWithFilesSchema` after the nine `file_*` properties:

```ts
  delete_file_1_1: t.Optional(MultipartBoolean),
  delete_file_1_2: t.Optional(MultipartBoolean),
  delete_file_1_3: t.Optional(MultipartBoolean),
  delete_file_2_1: t.Optional(MultipartBoolean),
  delete_file_2_2: t.Optional(MultipartBoolean),
  delete_file_2_3: t.Optional(MultipartBoolean),
  delete_file_3_1: t.Optional(MultipartBoolean),
  delete_file_3_2: t.Optional(MultipartBoolean),
  delete_file_3_3: t.Optional(MultipartBoolean),
```

Do not add these fields to create or negotiate DTOs.

- [ ] **Step 4: Run the schema test to verify it passes**

Run:

```bash
bun test src/schema/answer.test.ts
```

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Run a focused read-only static check**

Run:

```bash
bun ./node_modules/.bin/biome check src/schema/answer.ts src/schema/answer.test.ts
```

Expected: no diagnostics introduced in these files. Report any pre-existing diagnostics rather than using a write-mode command.

- [ ] **Step 6: Commit the request contract if working off main with approval**

```bash
git add src/schema/answer.ts src/schema/answer.test.ts
git commit -m "feat(answer): add evidence deletion flags"
```

Skip this step when still on `main` or when commit permission has not been granted.

---

### Task 2: Pure Answer File Update Planner

**Files:**
- Create: `src/service/answer-file-update.ts`
- Create: `src/service/answer-file-update.test.ts`

**Interfaces:**
- Consumes: `UpdateAnswerWithFilesDto` from Task 1 and the nine current Answer file-column values.
- Produces: `ANSWER_FILE_SLOTS`, `AnswerFileState`, `AnswerFilePlanEntry`, `buildAnswerFilePlan`, `hasExplicitDeletion`, `findUploadDeleteConflict`, and `hasProjectedFile`.

- [ ] **Step 1: Write failing planner tests**

Create `src/service/answer-file-update.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  buildAnswerFilePlan,
  findUploadDeleteConflict,
  hasExplicitDeletion,
  hasProjectedFile,
  type AnswerFileState,
} from "./answer-file-update";

const emptyState = (): AnswerFileState => ({
  fileUrl1_1: null,
  fileUrl1_2: null,
  fileUrl1_3: null,
  fileUrl2_1: null,
  fileUrl2_2: null,
  fileUrl2_3: null,
  fileUrl3_1: null,
  fileUrl3_2: null,
  fileUrl3_3: null,
});

describe("answer file update planner", () => {
  it("keeps an existing file when upload and delete are omitted", () => {
    const existing = { ...emptyState(), fileUrl1_2: "old-1-2.pdf" };
    const plan = buildAnswerFilePlan({ questionId: 1 }, existing);
    expect(plan.find((entry) => entry.column === "fileUrl1_2")?.action).toBe("keep");
    expect(hasProjectedFile(plan, "fileUrl1_2")).toBe(true);
  });

  it("plans an explicit deletion only for a true flag", () => {
    const existing = { ...emptyState(), fileUrl1_2: "old-1-2.pdf" };
    const plan = buildAnswerFilePlan({ questionId: 1, delete_file_1_2: true }, existing);
    expect(hasExplicitDeletion(plan)).toBe(true);
    expect(plan.find((entry) => entry.column === "fileUrl1_2")?.action).toBe("delete_explicit");
    expect(hasProjectedFile(plan, "fileUrl1_2")).toBe(false);
  });

  it("identifies upload and delete on the same slot", () => {
    const file = new File(["pdf"], "replacement.pdf", { type: "application/pdf" });
    const plan = buildAnswerFilePlan(
      { questionId: 1, file_1_2: file, delete_file_1_2: true },
      emptyState(),
    );
    expect(findUploadDeleteConflict(plan)).toBe("file_1_2");
  });

  it("plans a replacement as projected evidence", () => {
    const file = new File(["pdf"], "replacement.pdf", { type: "application/pdf" });
    const plan = buildAnswerFilePlan({ questionId: 1, file_2_1: file }, emptyState());
    expect(plan.find((entry) => entry.column === "fileUrl2_1")?.action).toBe("replace");
    expect(hasProjectedFile(plan, "fileUrl2_1")).toBe(true);
  });

  it("preserves special=3 implicit row clearing as a separate action", () => {
    const existing = { ...emptyState(), fileUrl1_1: "row-1.pdf", fileUrl3_1: "row-3.pdf" };
    const plan = buildAnswerFilePlan({ questionId: 1 }, existing, [1, 2]);
    expect(plan.find((entry) => entry.column === "fileUrl1_1")?.action).toBe("delete_implicit");
    expect(plan.find((entry) => entry.column === "fileUrl3_1")?.action).toBe("keep");
  });
});
```

- [ ] **Step 2: Run the planner test to verify it fails**

Run:

```bash
bun test src/service/answer-file-update.test.ts
```

Expected: FAIL because `answer-file-update.ts` does not exist.

- [ ] **Step 3: Implement the pure planner**

Create `src/service/answer-file-update.ts`:

```ts
import type { UpdateAnswerWithFilesDto } from "../schema/answer";

export const ANSWER_FILE_SLOTS = [
  { row: 1, uploadKey: "file_1_1", deleteKey: "delete_file_1_1", column: "fileUrl1_1" },
  { row: 1, uploadKey: "file_1_2", deleteKey: "delete_file_1_2", column: "fileUrl1_2" },
  { row: 1, uploadKey: "file_1_3", deleteKey: "delete_file_1_3", column: "fileUrl1_3" },
  { row: 2, uploadKey: "file_2_1", deleteKey: "delete_file_2_1", column: "fileUrl2_1" },
  { row: 2, uploadKey: "file_2_2", deleteKey: "delete_file_2_2", column: "fileUrl2_2" },
  { row: 2, uploadKey: "file_2_3", deleteKey: "delete_file_2_3", column: "fileUrl2_3" },
  { row: 3, uploadKey: "file_3_1", deleteKey: "delete_file_3_1", column: "fileUrl3_1" },
  { row: 3, uploadKey: "file_3_2", deleteKey: "delete_file_3_2", column: "fileUrl3_2" },
  { row: 3, uploadKey: "file_3_3", deleteKey: "delete_file_3_3", column: "fileUrl3_3" },
] as const;

export type AnswerFileColumn = (typeof ANSWER_FILE_SLOTS)[number]["column"];
export type AnswerFileState = Record<AnswerFileColumn, string | null | undefined>;
export type AnswerFileAction = "keep" | "replace" | "delete_explicit" | "delete_implicit";

export type AnswerFilePlanEntry = (typeof ANSWER_FILE_SLOTS)[number] & {
  action: AnswerFileAction;
  existing: string | null;
  upload: File | undefined;
  explicitDelete: boolean;
};

export const buildAnswerFilePlan = (
  dto: UpdateAnswerWithFilesDto,
  existing: AnswerFileState,
  implicitClearRows: readonly number[] = [],
): AnswerFilePlanEntry[] =>
  ANSWER_FILE_SLOTS.map((slot) => {
    const upload = dto[slot.uploadKey];
    const explicitDelete = dto[slot.deleteKey] === true;
    const implicitDelete = implicitClearRows.includes(slot.row);
    const action: AnswerFileAction = explicitDelete
      ? "delete_explicit"
      : implicitDelete
        ? "delete_implicit"
        : upload
          ? "replace"
          : "keep";

    return {
      ...slot,
      action,
      existing: existing[slot.column] ?? null,
      upload,
      explicitDelete,
    };
  });

export const hasExplicitDeletion = (plan: readonly AnswerFilePlanEntry[]) =>
  plan.some((entry) => entry.explicitDelete);

export const findUploadDeleteConflict = (plan: readonly AnswerFilePlanEntry[]) =>
  plan.find((entry) => entry.upload && entry.explicitDelete)?.uploadKey ?? null;

export const hasProjectedFile = (
  plan: readonly AnswerFilePlanEntry[],
  column: AnswerFileColumn,
) => {
  const entry = plan.find((candidate) => candidate.column === column);
  return entry?.action === "replace" || (entry?.action === "keep" && !!entry.existing);
};
```

- [ ] **Step 4: Run the planner tests to verify they pass**

Run:

```bash
bun test src/service/answer-file-update.test.ts
```

Expected: 5 pass, 0 fail.

- [ ] **Step 5: Run focused read-only static checks**

Run:

```bash
bun ./node_modules/.bin/biome check src/service/answer-file-update.ts src/service/answer-file-update.test.ts
```

Expected: no diagnostics introduced in these files.

- [ ] **Step 6: Commit the planner if working off main with approval**

```bash
git add src/service/answer-file-update.ts src/service/answer-file-update.test.ts
git commit -m "refactor(answer): plan evidence file updates"
```

Skip this step when still on `main` or when commit permission has not been granted.

---

### Task 3: Service-Level Deletion Behavior

**Files:**
- Modify: `src/service/answer.integration.test.ts:1-235`
- Modify: `src/service/answer.ts:396-672`

**Interfaces:**
- Consumes: Task 1 deletion flags; Task 2 planner functions and `AnswerFilePlanEntry`.
- Produces: `answerService.update(factoryId, dto)` behavior that validates projected evidence, strictly deletes explicit MinIO objects, persists `null`, and returns 400/500 without changing evaluator finalization.

- [ ] **Step 1: Extend integration fixtures for deletion cases**

In `src/service/answer.integration.test.ts`, import `spyOn`, `count`, and the utility module:

```ts
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { and, count, eq, inArray } from "drizzle-orm";
import * as utils from "../utils";
```

Capture the real utility factory and add fixture IDs:

```ts
const realUtilities = utils.utilities;

const Q = {
  inReview: 1,
  changeScore: 12,
  hardReject: 23,
  finished: 36,
  deleteOptional: 2,
  deleteRequired: 3,
  deleteRejected: 4,
  deleteFailure: 5,
  deleteSpecial: 14,
};
```

Change `seedAnswer` to accept Answer file values and return the inserted row:

```ts
type AnswerSeedValues = Partial<
  Pick<
    typeof answers.$inferInsert,
    | "selectedChoice"
    | "fileUrl1_1"
    | "fileUrl1_2"
    | "fileUrl1_3"
    | "fileUrl2_1"
    | "fileUrl2_2"
    | "fileUrl2_3"
    | "fileUrl3_1"
    | "fileUrl3_2"
    | "fileUrl3_3"
  >
>;

async function seedAnswer(
  questionId: number,
  logs: {
    status: "in_review" | "rejected" | "recommended" | "finished";
    verdictChoice?: string | null;
    description?: string | null;
  }[],
  values: AnswerSeedValues = {},
) {
  const [ans] = await db
    .insert(answers)
    .values({ questionId, coverId, selectedChoice: "2", ...values })
    .returning();
  for (const log of logs) {
    await db.insert(answerLogs).values({
      answerId: ans.id,
      status: log.status,
      verdictChoice: log.verdictChoice ?? null,
      description: log.description ?? null,
    });
  }
  return ans;
}
```

In `beforeAll`, seed dedicated rows:

```ts
await seedAnswer(Q.deleteOptional, [{ status: "in_review" }], {
  selectedChoice: "3",
  fileUrl1_1: "optional-anchor-1.pdf",
  fileUrl1_2: "optional-delete.pdf",
  fileUrl2_1: "optional-anchor-2.pdf",
  fileUrl3_1: "optional-anchor-3.pdf",
});
await seedAnswer(Q.deleteRequired, [{ status: "in_review" }], {
  selectedChoice: "3",
  fileUrl1_1: "required-anchor-1.pdf",
  fileUrl2_1: "required-anchor-2.pdf",
  fileUrl3_1: "required-anchor-3.pdf",
});
await seedAnswer(Q.deleteRejected, [{ status: "rejected" }], {
  selectedChoice: "3",
  fileUrl1_1: "rejected-anchor-1.pdf",
  fileUrl1_2: "rejected-optional.pdf",
  fileUrl2_1: "rejected-anchor-2.pdf",
  fileUrl3_1: "rejected-anchor-3.pdf",
});
await seedAnswer(Q.deleteFailure, [{ status: "in_review" }], {
  selectedChoice: "3",
  fileUrl1_1: "failure-anchor-1.pdf",
  fileUrl1_2: "failure-optional.pdf",
  fileUrl2_1: "failure-anchor-2.pdf",
  fileUrl3_1: "failure-anchor-3.pdf",
});
await seedAnswer(Q.deleteSpecial, [{ status: "in_review" }], {
  selectedChoice: "3",
  fileUrl3_1: "special-anchor.pdf",
  fileUrl3_2: "special-optional.pdf",
});
```

- [ ] **Step 2: Write failing service acceptance tests**

Append to `src/service/answer.integration.test.ts`:

```ts
const responseCode = (value: unknown) =>
  value instanceof ElysiaCustomStatusResponse ? value.code : 200;

const answerForQuestion = (questionId: number) =>
  db
    .select()
    .from(answers)
    .where(and(eq(answers.coverId, coverId), eq(answers.questionId, questionId)))
    .limit(1)
    .then((rows) => rows[0]);

describe("answerService.update — explicit evidence deletion", () => {
  it("deletes one optional MinIO object and nulls only its column", async () => {
    const deleted: string[] = [];
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async (name) => {
        if (name) deleted.push(name);
      },
    }));

    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteOptional,
      delete_file_1_2: true,
    });
    utilitySpy.mockRestore();

    expect(responseCode(result)).toBe(200);
    expect(deleted).toEqual(["optional-delete.pdf"]);
    const row = await answerForQuestion(Q.deleteOptional);
    expect(row.fileUrl1_2).toBeNull();
    expect(row.fileUrl1_1).toBe("optional-anchor-1.pdf");
    expect(row.fileUrl2_1).toBe("optional-anchor-2.pdf");
    expect(row.fileUrl3_1).toBe("optional-anchor-3.pdf");
  });

  it("rejects deletion of evidence required by choice 3 before MinIO I/O", async () => {
    let calls = 0;
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async () => {
        calls += 1;
      },
    }));
    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteRequired,
      delete_file_2_1: true,
    });
    utilitySpy.mockRestore();

    expect(responseCode(result)).toBe(400);
    expect(calls).toBe(0);
    expect((await answerForQuestion(Q.deleteRequired)).fileUrl2_1).toBe("required-anchor-2.pdf");
  });

  it("rejects upload and delete on the same slot before any file I/O", async () => {
    const calls = { strictDelete: 0, delete: 0, upload: 0 };
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async () => {
        calls.strictDelete += 1;
      },
      deleteFile: async () => {
        calls.delete += 1;
      },
      uploadFile: async () => {
        calls.upload += 1;
        return "replacement-object.pdf";
      },
    }));
    const replacement = new File(["pdf"], "replacement.pdf", { type: "application/pdf" });
    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteRequired,
      file_1_2: replacement,
      delete_file_1_2: true,
    });
    utilitySpy.mockRestore();

    expect(responseCode(result)).toBe(400);
    expect(calls).toEqual({ strictDelete: 0, delete: 0, upload: 0 });
  });

  it("rejects explicit deletion unless the latest status is in_review", async () => {
    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteRejected,
      delete_file_1_2: true,
    });
    expect(responseCode(result)).toBe(400);
    expect((await answerForQuestion(Q.deleteRejected)).fileUrl1_2).toBe("rejected-optional.pdf");
  });

  it("supports optional deletion for special=3 without using special as an eligibility gate", async () => {
    const deleted: string[] = [];
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async (name) => {
        if (name) deleted.push(name);
      },
    }));
    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteSpecial,
      delete_file_3_2: true,
    });
    utilitySpy.mockRestore();

    expect(responseCode(result)).toBe(200);
    expect(deleted).toContain("special-optional.pdf");
    expect((await answerForQuestion(Q.deleteSpecial)).fileUrl3_2).toBeNull();
  });

  it("returns 500 and leaves DB state/log count unchanged when strict MinIO deletion fails", async () => {
    const before = await answerForQuestion(Q.deleteFailure);
    const [{ value: logsBefore }] = await db
      .select({ value: count() })
      .from(answerLogs)
      .where(eq(answerLogs.answerId, before.id));
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async () => {
        throw new Error("simulated MinIO failure");
      },
    }));
    const result = await answerService.update(FACTORY, {
      questionId: Q.deleteFailure,
      delete_file_1_2: true,
    });
    utilitySpy.mockRestore();

    expect(responseCode(result)).toBe(500);
    expect((await answerForQuestion(Q.deleteFailure)).fileUrl1_2).toBe("failure-optional.pdf");
    const [{ value: logsAfter }] = await db
      .select({ value: count() })
      .from(answerLogs)
      .where(eq(answerLogs.answerId, before.id));
    expect(logsAfter).toBe(logsBefore);
  });
});
```

- [ ] **Step 3: Verify the integration-test precondition before running**

Ask the repository owner to confirm that the resolved `DATABASE_URL` is a disposable, migrated, seeded test database. Do not print the URL or credentials.

Only after explicit confirmation, run:

```bash
bun test src/service/answer.integration.test.ts
```

Expected before implementation: existing read tests pass and the new deletion tests fail because deletion flags are ignored or unsupported.

- [ ] **Step 4: Refactor `answerService.update` around the file plan**

Import the planner in `src/service/answer.ts`:

```ts
import {
  buildAnswerFilePlan,
  findUploadDeleteConflict,
  hasExplicitDeletion,
  hasProjectedFile,
} from "./answer-file-update";
```

After resolving `existingAnswer` and `latestLog`, retain the existing general status guard and add the delete-specific guard:

```ts
const deletionProbe = buildAnswerFilePlan(dto, existingAnswer);
if (hasExplicitDeletion(deletionProbe) && latestLog.status !== "in_review") {
  return status(400, { message: "answer files can only be deleted while answer is in_review" });
}
```

Restructure the standard-question branch so it calculates `factoryHasMatchingStandard` and validates enrollment certificate state without returning before file planning. Use `effectiveChoice = "3"` for a matching standard; otherwise use `dto.selectedChoice ?? existingAnswer.selectedChoice`.

Build the final plan. Preserve the existing `special === 3` automatic clearing by passing rows other than the selected row only for non-standard auto-credit:

```ts
const implicitClearRows =
  !factoryHasMatchingStandard && question.special === 3
    ? [1, 2, 3].filter((row) => String(row) !== effectiveChoice)
    : [];
const filePlan = buildAnswerFilePlan(dto, existingAnswer, implicitClearRows);

const conflictingSlot = findUploadDeleteConflict(filePlan);
if (conflictingSlot) {
  return status(400, {
    message: `${conflictingSlot} cannot be uploaded and deleted in the same request`,
  });
}
```

For a matching-standard Answer, retain `standard question does not accept files`, but allow deletion flags to proceed. For every other Answer, replace direct DTO/existing checks with projected checks:

```ts
if (question.special === 3) {
  if (effectiveChoice === "1" && !hasProjectedFile(filePlan, "fileUrl1_1"))
    return status(400, { message: "choice 1 requires file_1_1" });
  if (effectiveChoice === "2" && !hasProjectedFile(filePlan, "fileUrl2_1"))
    return status(400, { message: "choice 2 requires file_2_1" });
  if (effectiveChoice === "3" && !hasProjectedFile(filePlan, "fileUrl3_1"))
    return status(400, { message: "choice 3 requires file_3_1" });
} else {
  if (effectiveChoice === "1" && !hasProjectedFile(filePlan, "fileUrl1_1"))
    return status(400, { message: "choice 1 requires at least file_1_1" });
  if (
    effectiveChoice === "2" &&
    (!hasProjectedFile(filePlan, "fileUrl1_1") ||
      !hasProjectedFile(filePlan, "fileUrl2_1"))
  )
    return status(400, { message: "choice 2 requires at least file_1_1 and file_2_1" });
  if (
    effectiveChoice === "3" &&
    (!hasProjectedFile(filePlan, "fileUrl1_1") ||
      !hasProjectedFile(filePlan, "fileUrl2_1") ||
      !hasProjectedFile(filePlan, "fileUrl3_1"))
  )
    return status(400, {
      message: "choice 3 requires at least file_1_1, file_2_1, and file_3_1",
    });
}
```

All of the preceding 400 checks must occur before this strict deletion block:

```ts
try {
  await Promise.all(
    filePlan
      .filter((entry) => entry.action === "delete_explicit" && entry.existing)
      .map((entry) => utilities().deleteFileStrict(entry.existing)),
  );
} catch {
  return status(500, { message: "failed to delete answer files; update aborted" });
}
```

Replace the duplicated special/non-special nine-file processing arrays with one execution pass:

```ts
const processedEntries = await Promise.all(
  filePlan.map(async (entry) => {
    if (entry.action === "keep") return [entry.column, entry.existing] as const;
    if (entry.action === "delete_explicit") return [entry.column, null] as const;
    if (entry.action === "delete_implicit") {
      if (entry.existing) await utilities().deleteFile(entry.existing);
      return [entry.column, null] as const;
    }
    if (entry.existing) await utilities().deleteFile(entry.existing);
    return [entry.column, await utilities().uploadFile(entry.upload!)] as const;
  }),
);
const nextFiles = Object.fromEntries(processedEntries);
```

Use `nextFiles` in the existing transaction:

```ts
await database.transaction(async (tx) => {
  await tx
    .update(answers)
    .set({ selectedChoice: effectiveChoice, ...nextFiles })
    .where(eq(answers.id, existingAnswer.id));
  await tx.insert(answerLogs).values({ answerId: existingAnswer.id, status: "in_review" });
});
```

Do not change `saveAnswerVerdict` or `finalize`.

- [ ] **Step 5: Run isolated tests**

Run:

```bash
bun test src/schema/answer.test.ts
bun test src/service/answer-file-update.test.ts
```

Expected: 8 pass, 0 fail.

- [ ] **Step 6: Run the integration test only with the confirmed disposable database**

Run:

```bash
bun test src/service/answer.integration.test.ts
```

Expected: all existing and new tests pass; no real MinIO calls occur because deletion functions are mocked in the new cases.

- [ ] **Step 7: Commit service behavior if working off main with approval**

```bash
git add src/service/answer.ts src/service/answer.integration.test.ts
git commit -m "feat(answer): delete selected evidence from MinIO"
```

Skip this step when still on `main` or when commit permission has not been granted.

---

### Task 4: Route Contract, Maintained Documentation, and Final Verification

**Files:**
- Modify: `src/routes/factories/assessments/index.ts:182-234`
- Modify: `docs/api-conventions.md:102-113`
- Modify: `docs/business-rules.md:144-153`
- Modify: `docs/superpowers/specs/2026-07-21-answer-evidence-deletion-design.md`

**Interfaces:**
- Consumes: Task 3 service error bodies and successful behavior.
- Produces: accurate runtime response declarations and maintained documentation; no generated OpenAPI changes.

- [ ] **Step 1: Extend the PATCH response schema**

Add these variants to the route's HTTP 400 union in `src/routes/factories/assessments/index.ts`:

```ts
t.Object({
  message: t.String({
    default: "answer files can only be deleted while answer is in_review",
  }),
}),
t.Object({
  message: t.String({
    default: "file_1_2 cannot be uploaded and deleted in the same request",
    description: "The slot name varies with the conflicting multipart fields",
  }),
}),
```

Add an HTTP 500 declaration:

```ts
500: t.Object({
  message: t.String({ default: "failed to delete answer files; update aborted" }),
}),
```

- [ ] **Step 2: Align maintained documentation**

In `docs/api-conventions.md`, preserve the user's existing deletion paragraph and make these points explicit:

```md
Answer PATCH requests may explicitly remove an existing evidence object with the matching optional
`delete_file_<row>_<slot>=true` multipart field. Omission or `false` keeps the existing object;
supplying a PDF replaces it. Explicit deletion is available only while the Answer's latest status is
`in_review`, deletes the exact MinIO object, and persists `null` in the matching Answer column.
Uploading and deleting the same slot returns 400, as does deleting evidence required by the effective
choice. Evaluator rejection remains separate: files stay on verdict save and all files for rejected
Answers are removed when ODPC/admin finalizes.
```

Replace BR-13's “offer no explicit delete operation” statement in `docs/business-rules.md` with:

```md
PATCH supports optional `delete_file_<row>_<slot>` flags while the latest Answer status is
`in_review`. Deletion eligibility is independent of `Question.special`; the projected evidence must
still satisfy the existing choice matrix. Omission preserves a stored file. Explicit deletion uses
strict MinIO removal before the Answer columns are updated, so MinIO success followed by database
failure can leave a dangling filename.
```

Mark the design specification status as `Implemented` only after all authorized verification passes.

- [ ] **Step 3: Run focused tests and checks**

Always run the isolated tests separately:

```bash
bun test src/schema/answer.test.ts
bun test src/service/answer-file-update.test.ts
```

Run the integration test only if the disposable database precondition remains confirmed:

```bash
bun test src/service/answer.integration.test.ts
```

Run the read-only static check:

```bash
bun ./node_modules/.bin/biome check src/schema/answer.ts src/schema/answer.test.ts src/service/answer-file-update.ts src/service/answer-file-update.test.ts src/service/answer.ts src/service/answer.integration.test.ts src/routes/factories/assessments/index.ts
```

Expected: focused tests pass. For Biome, report baseline versus introduced diagnostics; do not claim a clean repository-wide gate from this focused command.

- [ ] **Step 4: Inspect the final diff for scope and secret safety**

Run:

```bash
git diff --check
git diff -- src/schema/answer.ts src/schema/answer.test.ts src/service/answer-file-update.ts src/service/answer-file-update.test.ts src/service/answer.ts src/service/answer.integration.test.ts src/routes/factories/assessments/index.ts docs/api-conventions.md docs/business-rules.md docs/superpowers/specs/2026-07-21-answer-evidence-deletion-design.md
git status --short
```

Expected: no whitespace errors; no credentials, full presigned URLs, unrelated changes, database schema changes, evaluator-finalization changes, or generated API artifacts in the feature diff.

- [ ] **Step 5: Record skipped verification honestly**

If no disposable database was approved, report `src/service/answer.integration.test.ts` as not run and do not claim end-to-end completion. If a real MinIO test bucket was not explicitly approved, report that strict helper invocation was verified with a mock but physical object removal was not exercised against MinIO.

- [ ] **Step 6: Commit documentation and route contract if working off main with approval**

```bash
git add src/routes/factories/assessments/index.ts docs/api-conventions.md docs/business-rules.md docs/superpowers/specs/2026-07-21-answer-evidence-deletion-design.md
git commit -m "docs(answer): document evidence deletion contract"
```

Skip this step when still on `main` or when commit permission has not been granted.
