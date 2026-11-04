import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
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
