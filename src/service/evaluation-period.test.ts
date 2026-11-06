import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { env } from "../config";
import { evaluationPeriodApplies, utilities } from "../utils";

/** Reviewers audit the year that just ended from 1 Oct through 31 Oct; the rule recurs yearly. */

const bkk = (isoWallClock: string) => new Date(`${isoWallClock}+07:00`);

afterEach(() => {
  setSystemTime();
});

describe("evaluationPeriodApplies", () => {
  it("is open at the rollover instant", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-10-01T00:00:00.000"))).toBe(true);
  });

  it("is open at the last millisecond of 31 Oct", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-10-31T23:59:59.999"))).toBe(true);
  });

  it("is closed from 1 Nov 00:00 Bangkok", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-11-01T00:00:00.000"))).toBe(false);
  });

  it("covers only the immediately preceding year", () => {
    const now = bkk("2026-10-15T12:00:00.000");
    expect(evaluationPeriodApplies(2026, now)).toBe(true);
    expect(evaluationPeriodApplies(2025, now)).toBe(false);
    expect(evaluationPeriodApplies(2027, now)).toBe(false);
  });

  it("is closed before the rollover and mid-year", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-09-30T23:59:59.999"))).toBe(false);
    expect(evaluationPeriodApplies(2026, bkk("2027-03-01T12:00:00.000"))).toBe(false);
  });

  it("recurs in later fiscal years", () => {
    expect(evaluationPeriodApplies(2030, bkk("2030-10-31T23:59:59.999"))).toBe(true);
    expect(evaluationPeriodApplies(2030, bkk("2030-11-01T00:00:00.000"))).toBe(false);
  });
});

describe("evaluationPeriodApplies with an EVALUATION_PERIOD_END override", () => {
  const end = new Date("2027-01-01T00:00:00+07:00");

  it("extends the period for the prior year", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-11-06T12:00:00.000"), end)).toBe(true);
    expect(evaluationPeriodApplies(2026, new Date("2026-12-31T23:59:59+07:00"), end)).toBe(true);
    expect(evaluationPeriodApplies(2026, bkk("2026-12-31T23:59:59.999"), end)).toBe(true);
  });

  it("closes at the override instant and after", () => {
    expect(evaluationPeriodApplies(2026, new Date("2027-01-01T00:00:00+07:00"), end)).toBe(false);
    expect(evaluationPeriodApplies(2026, bkk("2027-03-01T12:00:00.000"), end)).toBe(false);
  });

  it("never opens another year", () => {
    for (const now of [bkk("2026-11-06T12:00:00.000"), bkk("2026-12-31T23:59:59.999")]) {
      expect(evaluationPeriodApplies(2025, now, end)).toBe(false);
      expect(evaluationPeriodApplies(2027, now, end)).toBe(false);
    }
  });

  it("ignores an override before the default end", () => {
    const early = new Date("2026-10-15T00:00:00+07:00");
    expect(evaluationPeriodApplies(2026, bkk("2026-11-06T12:00:00.000"), early)).toBe(false);
    expect(evaluationPeriodApplies(2026, bkk("2026-10-20T12:00:00.000"), early)).toBe(true);
  });

  it("ignores an override in another fiscal year", () => {
    for (const other of ["2026-01-01T00:00:00+07:00", "2028-01-01T00:00:00+07:00"]) {
      const now = bkk("2026-11-06T12:00:00.000");
      expect(evaluationPeriodApplies(2026, now, new Date(other))).toBe(false);
    }
  });

  it("leaves the default rule untouched when unset", () => {
    expect(evaluationPeriodApplies(2026, bkk("2026-10-31T23:59:59.999"), undefined)).toBe(true);
    expect(evaluationPeriodApplies(2026, bkk("2026-11-01T00:00:00.000"), undefined)).toBe(false);
  });
});

describe("getReviewerFiscalYear with EVALUATION_PERIOD_END set", () => {
  const config = env as { EVALUATION_PERIOD_END?: Date };
  const original = config.EVALUATION_PERIOD_END;

  afterEach(() => {
    config.EVALUATION_PERIOD_END = original;
  });

  it("defaults to the year under evaluation on 2026-12-15", () => {
    config.EVALUATION_PERIOD_END = new Date("2027-01-01T00:00:00+07:00");
    setSystemTime(bkk("2026-12-15T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear().fiscalYear).toBe(2026);
  });

  it("still honours an explicit year", () => {
    config.EVALUATION_PERIOD_END = new Date("2027-01-01T00:00:00+07:00");
    setSystemTime(bkk("2026-12-15T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear(2027).fiscalYear).toBe(2027);
  });

  it("defaults to the current year on 2026-12-15 when unset", () => {
    config.EVALUATION_PERIOD_END = undefined;
    setSystemTime(bkk("2026-12-15T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear().fiscalYear).toBe(2027);
  });
});

describe("getReviewerFiscalYear — default year for staff reads", () => {
  it("defaults to the year under evaluation during 1-31 Oct", () => {
    setSystemTime(bkk("2026-10-20T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear().fiscalYear).toBe(2026);
  });

  it("defaults to the current year from 1 Nov", () => {
    setSystemTime(bkk("2026-11-01T00:00:00.000"));
    expect(utilities().getReviewerFiscalYear().fiscalYear).toBe(2027);
  });

  it("defaults to the current year before the rollover", () => {
    setSystemTime(bkk("2026-09-30T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear().fiscalYear).toBe(2026);
  });

  it("honours an explicit year at any time", () => {
    setSystemTime(bkk("2026-10-20T12:00:00.000"));
    expect(utilities().getReviewerFiscalYear(2027).fiscalYear).toBe(2027);
  });

  it("leaves getFiscalYear untouched", () => {
    setSystemTime(bkk("2026-10-20T12:00:00.000"));
    expect(utilities().getFiscalYear().fiscalYear).toBe(2027);
  });
});
