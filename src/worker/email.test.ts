import { beforeEach, describe, expect, it, mock } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import * as realLogger from "../logger";
import { testSpans } from "../test/spans";

// ── Mock definitions (must precede dynamic import) ────────────────────────

const logLines: string[] = [];
const stream = { write: (line: string) => logLines.push(line) };

const mockSendMail = mock(async (..._: unknown[]) => ({
  accepted: ["factory@example.com", "officer@example.com"],
  rejected: [] as string[],
  messageId: "<0a1b2c3d@twhp.example.com>",
  response: "250 2.0.0 Ok: queued for factory@example.com",
}));

mock.module("nodemailer", () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

mock.module("../service/admin", () => ({
  adminService: {
    getPendingValidationData: async () => ({
      doedAdmins: [
        { accountId: 9, email: "doed@example.com", firstName: "Somchai", lastName: "Jaidee" },
      ],
      pendingFactories: [
        {
          accountId: 1,
          nameTh: "โรงงาน",
          nameEn: "Factory",
          provinceName: "Bangkok",
          phoneNumber: "021234567",
        },
      ],
    }),
  },
}));

// Copy the real exports first: mocking "../logger" rewrites the live `realLogger` namespace.
const loggerExports = { ...realLogger };
mock.module("../logger", () => ({
  ...loggerExports,
  createLogger: (service: "twhp-worker") => loggerExports.createLogger(service, { stream }),
}));

const { processEmailJob: processor } = await import("./email");

const VERDICT_JOB = {
  id: "job-17",
  name: "verdict-result-finished",
  data: {
    email: "factory@example.com",
    cc: "officer@example.com",
    grade: "gold",
    factoryNameTh: "โรงงานทดสอบ",
  },
};

const lines = () => logLines.map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  logLines.length = 0;
  mockSendMail.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("email worker logs", () => {
  it("logs a sent email with job ids and recipient counts but no address", async () => {
    await processor(VERDICT_JOB);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(logLines.join("")).not.toContain("@");
    expect(lines()).toEqual([
      expect.objectContaining({
        service: "twhp-worker",
        jobId: "job-17",
        jobName: "verdict-result-finished",
        accepted: 2,
        rejected: 0,
        messageId: "0a1b2c3d",
        msg: "Email sent",
      }),
    ]);
  });

  it("logs a partial rejection as an error with counts only", async () => {
    mockSendMail.mockImplementationOnce(async () => ({
      accepted: ["factory@example.com"],
      rejected: ["officer@example.com"],
      messageId: "<0a1b2c3d@twhp.example.com>",
      response: "250 ok",
    }));

    await processor(VERDICT_JOB);

    expect(logLines.join("")).not.toContain("@");
    expect(lines()[0]).toMatchObject({ level: 50, accepted: 1, rejected: 1 });
  });

  it("logs a send failure without the error message, which quotes addresses", async () => {
    const smtpError = Object.assign(
      new Error("Recipient address rejected: <officer@example.com>"),
      {
        code: "EENVELOPE",
        responseCode: 550,
        command: "RCPT TO",
        rejected: ["officer@example.com"],
      },
    );
    mockSendMail.mockImplementationOnce(async () => {
      throw smtpError;
    });

    await expect(processor(VERDICT_JOB)).rejects.toBe(smtpError);

    expect(logLines.join("")).not.toContain("@");
    expect(lines()[0]).toMatchObject({
      jobId: "job-17",
      err: { type: "Error", code: "EENVELOPE", responseCode: 550, command: "RCPT TO" },
    });
  });

  it("logs the validation reminder without admin names or addresses", async () => {
    await processor({ id: "job-18", name: "factory-validation-reminder", data: {} });

    const raw = logLines.join("");
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("Somchai");
    expect(lines()[0]).toMatchObject({ jobName: "factory-validation-reminder", accepted: 2 });
  });
});

describe("email worker spans", () => {
  beforeEach(() => testSpans.reset());

  const smtpSpans = () => testSpans.getFinishedSpans().filter((s) => s.name === "smtp.send");

  it("wraps a send in an smtp.send span with counts and the local messageId only", async () => {
    await processor(VERDICT_JOB);

    const [span] = smtpSpans();
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes).toEqual({
      "email.job.name": "verdict-result-finished",
      "email.recipients.count": 2,
      "email.accepted.count": 2,
      "email.rejected.count": 0,
      "email.message_id": "0a1b2c3d",
    });
  });

  it("marks the span an error when the relay accepts no recipient", async () => {
    mockSendMail.mockImplementationOnce(async () => ({
      accepted: [],
      rejected: ["factory@example.com", "officer@example.com"],
      messageId: "<0a1b2c3d@twhp.example.com>",
      response: "550",
    }));

    await processor(VERDICT_JOB);

    expect(smtpSpans()[0].status.code).toBe(SpanStatusCode.ERROR);
  });

  it("marks the span an error with the SMTP code, never the message, when the relay throws", async () => {
    mockSendMail.mockImplementationOnce(async () => {
      throw Object.assign(new Error("rejected: <officer@example.com>"), { code: "EENVELOPE" });
    });

    await expect(processor(VERDICT_JOB)).rejects.toThrow();

    const [span] = smtpSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes["error.type"]).toBe("EENVELOPE");
    expect(span.events).toEqual([]);
  });

  it("wraps the reminder's DB read in db.pending_factories, parent of its sends", async () => {
    await processor({ id: "job-18", name: "factory-validation-reminder", data: {} });

    const spans = testSpans.getFinishedSpans();
    const db = spans.find((s) => s.name === "db.pending_factories");
    expect(db?.attributes).toEqual({
      "db.system.name": "postgresql",
      "twhp.doed_admins.count": 1,
      "twhp.pending_factories.count": 1,
    });
    expect(smtpSpans()).toHaveLength(1);
    const values = spans.flatMap((s) => Object.values(s.attributes).map(String));
    expect(values.filter((v) => v.includes("@") || v.includes("Somchai"))).toEqual([]);
  });
});
