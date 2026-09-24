// TEMPORARY (FY2026 extension, revert 2026-10-16)
import { describe, expect, it } from "bun:test";
import { utilities } from "../utils";
import { createEvaluationPeriod } from "./evaluationPeriod";

// Local-time constructors keep these cases independent of the host timezone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const FY2026 = { fiscalYearStart: at(2025, 10, 1), fiscalYearEnd: at(2026, 10, 1) };
const FY2027 = { fiscalYearStart: at(2026, 10, 1), fiscalYearEnd: at(2027, 10, 1) };

const END = at(2026, 10, 16);
const periodAt = (now: Date, end: Date | null = END) => createEvaluationPeriod(end, () => now);

describe("Evaluation Period — EVALUATION_PERIOD_END = 2026-10-16", () => {
  it.each([
    ["2026-09-24 (before rollover)", at(2026, 9, 24), true, false, FY2026],
    ["2026-10-01 00:00 (rollover)", at(2026, 10, 1), true, true, FY2026],
    ["2026-10-15 23:59 (last minute)", at(2026, 10, 15, 23, 59), true, true, FY2026],
    ["2026-10-16 00:00 (period over)", at(2026, 10, 16), false, false, FY2027],
  ])("%s → open=%p, extension window=%p", (_, now, open, window, reviewerFy) => {
    const period = periodAt(now);
    expect(period.isOpen()).toBe(open);
    expect(period.isExtensionWindow()).toBe(window);
    expect(period.reviewerFiscalYear()).toEqual(reviewerFy);
  });

  it("factory-side fiscal year still rolls over on 2026-10-01", () => {
    expect(utilities().getFiscalYear(at(2026, 10, 1))).toEqual(FY2027);
  });
});

describe("Evaluation Period — end exactly on the rollover (2026-10-01)", () => {
  it("withholds Grades until Oct 1 but has no extension window and never reaches back to FY2025", () => {
    const before = periodAt(at(2026, 9, 24), at(2026, 10, 1));
    expect(before.isOpen()).toBe(true);
    expect(before.isExtensionWindow()).toBe(false);
    expect(before.reviewerFiscalYear()).toEqual(FY2026);

    const after = periodAt(at(2026, 10, 1), at(2026, 10, 1));
    expect(after.isOpen()).toBe(false);
    expect(after.reviewerFiscalYear()).toEqual(FY2027);
  });
});

describe("Evaluation Period — unset", () => {
  it("is never open and reviewers follow the ordinary fiscal year", () => {
    const period = periodAt(at(2026, 10, 5), null);
    expect(period.isOpen()).toBe(false);
    expect(period.isExtensionWindow()).toBe(false);
    expect(period.reviewerFiscalYear()).toEqual(FY2027);
  });
});
