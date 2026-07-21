import { describe, expect, it } from "bun:test";
import {
  type AnswerFileState,
  buildAnswerFilePlan,
  findUploadDeleteConflict,
  hasExplicitDeletion,
  hasProjectedFile,
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
