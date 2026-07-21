import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import { Pool } from "pg";
import {
  accounts,
  answerLogs,
  answers,
  coverLogs,
  covers,
  enrolls,
  factories,
} from "../drizzle/schema";
import * as utils from "../utils";
import { createAnswerService } from "./answer";

// ─── Test DB ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const answerService = createAnswerService(db);
const realUtilities = utils.utilities;

// ─── Fixture constants ───────────────────────────────────────────────────────

const FACTORY = 99981;
const NO_DATA_FACTORY = 99982; // never seeded → 404
const PROVINCE = 10;
const SEEDED_EVALUATOR_ID = 78;

// one seeded question id per scenario
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

let coverId: number;

const enrollValues = (factoryId: number) => ({
  factoryId,
  evalDohId: SEEDED_EVALUATOR_ID,
  evalOdpcId: SEEDED_EVALUATOR_ID,
  evalMentalId: SEEDED_EVALUATOR_ID,
  employeeThM: 1,
  employeeMmM: 0,
  employeeKhM: 0,
  employeeLaM: 0,
  employeeVnM: 0,
  employeeCnM: 0,
  employeePhM: 0,
  employeeJpM: 0,
  employeeInM: 0,
  employeeOtherM: 0,
  employeeThF: 1,
  employeeMmF: 0,
  employeeKhF: 0,
  employeeLaF: 0,
  employeeVnF: 0,
  employeeCnF: 0,
  employeePhF: 0,
  employeeJpF: 0,
  employeeInF: 0,
  employeeOtherF: 0,
  standardHc: false,
  standardSan: false,
  standardSanPlus: false,
  standardWellness: false,
  standardSafety: false,
  standardTis18001: false,
  standardIso45001: false,
  standardIso14001: false,
  standardZero: false,
  standard5S: false,
  standardHas: false,
  safetyOfficerPrefix: "นาย",
  safetyOfficerFirstName: "ทดสอบ",
  safetyOfficerLastName: "ทดสอบ",
  safetyOfficerPosition: "เจ้าหน้าที่",
});

/** Insert an answer + its answerLog history (latest log = latest verdict). */
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

async function cleanupFactory(factoryId: number) {
  const prevEnrolls = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId));
  for (const e of prevEnrolls) {
    const prevCovers = await db
      .select({ id: covers.id })
      .from(covers)
      .where(eq(covers.enrollId, e.id));
    for (const c of prevCovers) {
      const aIds = await db
        .select({ id: answers.id })
        .from(answers)
        .where(eq(answers.coverId, c.id))
        .then((rows) => rows.map((r) => r.id));
      if (aIds.length > 0) await db.delete(answerLogs).where(inArray(answerLogs.answerId, aIds));
      await db.delete(answers).where(eq(answers.coverId, c.id));
      await db.delete(coverLogs).where(eq(coverLogs.coverId, c.id));
      await db.delete(covers).where(eq(covers.id, c.id));
    }
    await db.delete(enrolls).where(eq(enrolls.id, e.id));
  }
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
}

beforeAll(async () => {
  await cleanupFactory(FACTORY);

  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);

  await db.insert(accounts).values({
    id: FACTORY,
    username: "test_factory_answer_verdict",
    password: "hashed",
    email: "test_factory_answer_verdict@test.com",
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: FACTORY,
    factoryType: 1,
    nameTh: "โรงงานทดสอบคำตัดสิน",
    nameEn: "Test Answer Verdict Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: PROVINCE,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });

  const [enroll] = await db.insert(enrolls).values(enrollValues(FACTORY)).returning();
  const [cover] = await db.insert(covers).values({ enrollId: enroll.id }).returning();
  coverId = cover.id;

  // in_review: no evaluator action yet
  await seedAnswer(Q.inReview, [{ status: "in_review" }]);
  // change_score: evaluator proposed a new score (rejected + verdictChoice set), after an in_review log
  await seedAnswer(Q.changeScore, [
    { status: "in_review" },
    { status: "rejected", verdictChoice: "3", description: "ปรับเป็น 3" },
  ]);
  // hard reject: rejected + verdictChoice null
  await seedAnswer(Q.hardReject, [
    { status: "in_review" },
    { status: "rejected", verdictChoice: null, description: "เอกสารไม่ครบ" },
  ]);
  // finished
  await seedAnswer(Q.finished, [{ status: "in_review" }, { status: "finished" }]);
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
});

afterAll(async () => {
  await cleanupFactory(FACTORY);
  await pool.end();
});

// ─── getAnswerByFactoryId — verdict enrichment ───────────────────────────────

describe("getAnswerByFactoryId — verdict enrichment", () => {
  type Row = {
    questionId: number;
    selectedChoice: string;
    status: string;
    verdictChoice: string | null;
    description: string | null;
    fileUrl1_1: string | null;
  };

  it("AC: surfaces latest status + verdictChoice + description per answer (latest-log-wins)", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(9);
    const byQ = (qid: number) => rows.find((r) => r.questionId === qid)!;

    // in_review — no evaluator action
    expect(byQ(Q.inReview).status).toBe("in_review");
    expect(byQ(Q.inReview).verdictChoice).toBeNull();
    expect(byQ(Q.inReview).description).toBeNull();

    // change_score — rejected with a proposed score (latest wins over the earlier in_review log)
    expect(byQ(Q.changeScore).status).toBe("rejected");
    expect(byQ(Q.changeScore).verdictChoice).toBe("3");
    expect(byQ(Q.changeScore).description).toBe("ปรับเป็น 3");

    // hard reject — rejected with no proposed score
    expect(byQ(Q.hardReject).status).toBe("rejected");
    expect(byQ(Q.hardReject).verdictChoice).toBeNull();
    expect(byQ(Q.hardReject).description).toBe("เอกสารไม่ครบ");

    // finished
    expect(byQ(Q.finished).status).toBe("finished");
    expect(byQ(Q.finished).verdictChoice).toBeNull();
  });

  it("AC: existing answer fields are preserved (backward compatible)", async () => {
    const rows = (await answerService.getAnswerByFactoryId(FACTORY)) as Row[];
    const r = rows.find((row) => row.questionId === Q.inReview);
    expect(r).toBeDefined();
    expect(r?.selectedChoice).toBe("2");
    expect(typeof r?.questionId).toBe("number");
    expect(r ? "fileUrl1_1" in r : false).toBe(true);
  });

  it("AC: factory with no answers → 404", async () => {
    const res = await answerService.getAnswerByFactoryId(NO_DATA_FACTORY);
    expect(res).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect((res as { code: number }).code).toBe(404);
  });
});

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

    try {
      const result = await answerService.update(FACTORY, {
        questionId: Q.deleteOptional,
        delete_file_1_2: true,
      });

      expect(responseCode(result)).toBe(200);
      expect(deleted).toEqual(["optional-delete.pdf"]);
      const row = await answerForQuestion(Q.deleteOptional);
      expect(row.fileUrl1_2).toBeNull();
      expect(row.fileUrl1_1).toBe("optional-anchor-1.pdf");
      expect(row.fileUrl2_1).toBe("optional-anchor-2.pdf");
      expect(row.fileUrl3_1).toBe("optional-anchor-3.pdf");
    } finally {
      utilitySpy.mockRestore();
    }
  });

  it("rejects deletion of evidence required by choice 3 before MinIO I/O", async () => {
    let calls = 0;
    const utilitySpy = spyOn(utils, "utilities").mockImplementation(() => ({
      ...realUtilities(),
      deleteFileStrict: async () => {
        calls += 1;
      },
    }));
    try {
      const result = await answerService.update(FACTORY, {
        questionId: Q.deleteRequired,
        delete_file_2_1: true,
      });

      expect(responseCode(result)).toBe(400);
      expect(calls).toBe(0);
      expect((await answerForQuestion(Q.deleteRequired)).fileUrl2_1).toBe("required-anchor-2.pdf");
    } finally {
      utilitySpy.mockRestore();
    }
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
    try {
      const replacement = new File(["pdf"], "replacement.pdf", { type: "application/pdf" });
      const result = await answerService.update(FACTORY, {
        questionId: Q.deleteRequired,
        file_1_2: replacement,
        delete_file_1_2: true,
      });

      expect(responseCode(result)).toBe(400);
      expect(calls).toEqual({ strictDelete: 0, delete: 0, upload: 0 });
    } finally {
      utilitySpy.mockRestore();
    }
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
    try {
      const result = await answerService.update(FACTORY, {
        questionId: Q.deleteSpecial,
        delete_file_3_2: true,
      });

      expect(responseCode(result)).toBe(200);
      expect(deleted).toContain("special-optional.pdf");
      expect((await answerForQuestion(Q.deleteSpecial)).fileUrl3_2).toBeNull();
    } finally {
      utilitySpy.mockRestore();
    }
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
    try {
      const result = await answerService.update(FACTORY, {
        questionId: Q.deleteFailure,
        delete_file_1_2: true,
      });

      expect(responseCode(result)).toBe(500);
      expect((await answerForQuestion(Q.deleteFailure)).fileUrl1_2).toBe("failure-optional.pdf");
      const [{ value: logsAfter }] = await db
        .select({ value: count() })
        .from(answerLogs)
        .where(eq(answerLogs.answerId, before.id));
      expect(logsAfter).toBe(logsBefore);
    } finally {
      utilitySpy.mockRestore();
    }
  });
});
