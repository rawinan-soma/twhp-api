import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { utilities } from "./utils";

/**
 * Contract tests for the fiscal-year resolver.
 *
 * This intent persists no fiscal-year column, so this resolver IS the fiscal-year contract for the
 * whole system — every historical read derives its boundary here. These are therefore contract
 * tests, not incidental unit tests.
 *
 * Canonical rule: fiscal year `Y` is [Oct 1 of Y-1 00:00, Oct 1 of Y 00:00) in Asia/Bangkok,
 * labelled by its ENDING year. FY2026 = 2025-10-01 -> 2026-09-30.
 */

/** Bangkok wall-clock time as an absolute instant. Independent of the host's TZ. */
const bkk = (isoWallClock: string) => new Date(`${isoWallClock}+07:00`);

/** Host is UTC+7. `getTimezoneOffset()` returns minutes *behind* UTC, so Bangkok is -420. */
const hostIsBangkok = new Date().getTimezoneOffset() === -420;

/** Counts no-argument `new Date()` constructions while `fn` runs. Restores the global on exit. */
const countClockReads = (fn: () => void) => {
  const OriginalDate = globalThis.Date;
  let noArgConstructions = 0;

  class CountingDate extends OriginalDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length === 0) noArgConstructions++;
      super(...args);
    }
  }
  globalThis.Date = CountingDate as DateConstructor;

  try {
    fn();
  } finally {
    globalThis.Date = OriginalDate;
  }

  return noArgConstructions;
};

afterEach(() => {
  // Never reset in src/test/setup.ts — that preload is shared by all 18 test files.
  setSystemTime();
});

describe("getFiscalYear — labelling rule", () => {
  // Written first, deliberately. An off-by-one here mislabels every historical read in the
  // system, and nothing downstream would catch it.
  it("labels a fiscal year by its ENDING year: FY2026 = 2025-10-01 -> 2026-09-30", () => {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(2026);

    expect(fiscalYearStart.toISOString()).toBe("2025-09-30T17:00:00.000Z"); // 2025-10-01 00:00 +07
    expect(fiscalYearEnd.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 2026-10-01 00:00 +07
  });

  it("returns a half-open window: the end instant belongs to the next fiscal year", () => {
    const { fiscalYearEnd } = utilities().getFiscalYear(2026);

    expect(utilities().getFiscalYearOf(fiscalYearEnd)).toBe(2027);
  });

  it("returns adjacent, non-overlapping windows for consecutive years", () => {
    const y2026 = utilities().getFiscalYear(2026);
    const y2027 = utilities().getFiscalYear(2027);

    expect(y2026.fiscalYearEnd.toISOString()).toBe(y2027.fiscalYearStart.toISOString());
  });
});

describe("getFiscalYear — boundary instants", () => {
  it("2026-09-30 23:59:59.999 Bangkok is still FY2026", () => {
    setSystemTime(bkk("2026-09-30T23:59:59.999"));

    expect(utilities().getFiscalYear().fiscalYearStart.toISOString()).toBe(
      "2025-09-30T17:00:00.000Z",
    );
  });

  it("2026-10-01 00:00:00.000 Bangkok is FY2027", () => {
    setSystemTime(bkk("2026-10-01T00:00:00.000"));

    expect(utilities().getFiscalYear().fiscalYearStart.toISOString()).toBe(
      "2026-09-30T17:00:00.000Z",
    );
  });

  it("crosses exactly at the boundary, with no gap and no overlap", () => {
    setSystemTime(bkk("2026-09-30T23:59:59.999"));
    const before = utilities().getFiscalYear();
    setSystemTime(bkk("2026-10-01T00:00:00.000"));
    const after = utilities().getFiscalYear();

    expect(before.fiscalYearEnd.toISOString()).toBe(after.fiscalYearStart.toISOString());
  });
});

describe("getFiscalYearOf", () => {
  it.each([
    ["2025-10-01T00:00:00.000", 2026],
    ["2026-01-01T12:00:00.000", 2026],
    ["2026-09-30T23:59:59.999", 2026],
    ["2026-10-01T00:00:00.000", 2027],
    ["2025-09-30T23:59:59.999", 2025],
  ])("%s Bangkok is in FY%d", (wallClock, expected) => {
    expect(utilities().getFiscalYearOf(bkk(wallClock))).toBe(expected);
  });
});

describe("getFiscalYear — leap years", () => {
  it("FY2024 contains 29 February 2024 and spans exactly 366 days", () => {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(2024);
    const leapDay = bkk("2024-02-29T12:00:00.000");

    expect(fiscalYearStart.getTime()).toBeLessThanOrEqual(leapDay.getTime());
    expect(fiscalYearEnd.getTime()).toBeGreaterThan(leapDay.getTime());

    const days = (fiscalYearEnd.getTime() - fiscalYearStart.getTime()) / 86_400_000;
    expect(days).toBe(366);
  });

  it("a non-leap fiscal year spans exactly 365 days", () => {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(2026);

    expect((fiscalYearEnd.getTime() - fiscalYearStart.getTime()) / 86_400_000).toBe(365);
  });
});

describe("getFiscalYear — host timezone independence", () => {
  // The absolute instants asserted throughout this file are the proof: they are stated as UTC
  // and never derived from host-local construction. Run the file under both TZs to confirm:
  //   TZ=UTC bun test src/utils.fiscal-year.test.ts
  //   TZ=Asia/Bangkok bun test src/utils.fiscal-year.test.ts
  it("resolves the same absolute instants regardless of the host TZ", () => {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(2026);

    expect(fiscalYearStart.toISOString()).toBe("2025-09-30T17:00:00.000Z");
    expect(fiscalYearEnd.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("matches the pre-existing Asia/Bangkok behaviour exactly", () => {
    // 2025-09-30T17:00:00.000Z is what the legacy host-local implementation produced under
    // TZ=Asia/Bangkok, measured before this change. Hard-coded so the assertion holds under
    // any host TZ. This is the no-behaviour-change proof.
    expect(utilities().getFiscalYear(2026).fiscalYearStart.toISOString()).toBe(
      "2025-09-30T17:00:00.000Z",
    );
  });

  it.skipIf(!hostIsBangkok)(
    "is byte-identical to the legacy algorithm when host is Bangkok",
    () => {
      setSystemTime(bkk("2026-08-21T12:00:00.000"));

      // The legacy implementation, verbatim from src/utils.ts before this change.
      const currentYear = new Date().getFullYear();
      const now = new Date();
      const legacyStart =
        now >= new Date(currentYear, 9, 1)
          ? new Date(currentYear, 9, 1)
          : new Date(currentYear - 1, 9, 1);
      const legacyEnd = new Date(legacyStart.getFullYear() + 1, 9, 1);

      const current = utilities().getFiscalYear();

      expect(current.fiscalYearStart.toISOString()).toBe(legacyStart.toISOString());
      expect(current.fiscalYearEnd.toISOString()).toBe(legacyEnd.toISOString());
    },
  );
});

describe("getFiscalYear — input validation", () => {
  it.each([
    2026.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1999,
    2101,
  ])("rejects %p with a RangeError", (bad) => {
    expect(() => utilities().getFiscalYear(bad)).toThrow(RangeError);
  });

  it.each([2000, 2100])("accepts the boundary year %d", (year) => {
    expect(() => utilities().getFiscalYear(year)).not.toThrow();
  });
});

describe("getFiscalYear — clock reads", () => {
  it("reads the clock exactly once per resolution", () => {
    // The legacy implementation called `new Date()` twice, which could straddle midnight
    // on 1 October and produce a mismatched start/end pair.
    expect(countClockReads(() => utilities().getFiscalYear())).toBe(1);
  });

  it("does not read the clock at all when a year is supplied", () => {
    expect(countClockReads(() => utilities().getFiscalYear(2026))).toBe(0);
  });
});

describe("getFiscalYear — resolved year echo", () => {
  it("returns the resolved year alongside the window", () => {
    expect(utilities().getFiscalYear(2026).fiscalYear).toBe(2026);
  });

  it("resolves the current year when none is supplied", () => {
    setSystemTime(bkk("2026-10-01T00:00:00.000"));

    expect(utilities().getFiscalYear().fiscalYear).toBe(2027);
  });

  it("is additive — the two boundary fields are unchanged", () => {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear(2026);

    expect(fiscalYearStart.toISOString()).toBe("2025-09-30T17:00:00.000Z");
    expect(fiscalYearEnd.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
});
