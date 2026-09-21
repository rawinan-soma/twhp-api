import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { db } from "../drizzle";
import { factoryGraceApplies, GRACE_DAYS, utilities } from "../utils";
import { createAnswerService } from "./answer";

/**
 * The 31-day window in which a Factory may still complete a prior-year Cover.
 *
 * The window is expressed relative to the rollover boundary, never as literal 2026 dates. The
 * recurrence tests below are the ones that would catch a hard-coded year — they assert the window
 * still means "31 days after rollover" in a later fiscal year.
 */

/** Bangkok wall-clock as an absolute instant, independent of the host's TZ. */
const bkk = (isoWallClock: string) => new Date(`${isoWallClock}+07:00`);

afterEach(() => {
  setSystemTime();
});

describe("factoryGraceApplies — window boundaries", () => {
  it("admits the prior year at the instant of rollover", () => {
    setSystemTime(bkk("2026-10-01T00:00:00.000"));

    expect(factoryGraceApplies(2026)).toBe(true);
  });

  it("still admits it at the last millisecond of the window", () => {
    setSystemTime(bkk("2026-10-31T23:59:59.999"));

    expect(factoryGraceApplies(2026)).toBe(true);
  });

  it("refuses at the first instant after the window", () => {
    setSystemTime(bkk("2026-11-01T00:00:00.000"));

    expect(factoryGraceApplies(2026)).toBe(false);
  });

  it("spans exactly GRACE_DAYS days", () => {
    setSystemTime(bkk("2026-10-01T00:00:00.000"));
    const start = utilities().getFiscalYear().fiscalYearStart.getTime();

    // The last admitted instant is one millisecond before start + GRACE_DAYS.
    setSystemTime(new Date(start + GRACE_DAYS * 86_400_000 - 1));
    expect(factoryGraceApplies(2026)).toBe(true);

    setSystemTime(new Date(start + GRACE_DAYS * 86_400_000));
    expect(factoryGraceApplies(2026)).toBe(false);
  });
});

describe("factoryGraceApplies — which year", () => {
  it("admits only the immediately preceding fiscal year", () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));

    expect(factoryGraceApplies(2026)).toBe(true); // preceding
    expect(factoryGraceApplies(2025)).toBe(false); // two years back
    expect(factoryGraceApplies(2024)).toBe(false);
  });

  it("never admits the current year — grace is not consulted for it", () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));

    expect(factoryGraceApplies(2027)).toBe(false);
  });

  it("never admits a future year", () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));

    expect(factoryGraceApplies(2028)).toBe(false);
  });

  it("does not apply mid-year, outside any window", () => {
    setSystemTime(bkk("2027-03-01T12:00:00.000"));

    expect(factoryGraceApplies(2026)).toBe(false);
  });
});

describe("factoryGraceApplies — recurrence", () => {
  // These are the tests that catch a hard-coded 2026. The window is a rule, not a date range.
  it("applies again in a later fiscal year", () => {
    setSystemTime(bkk("2030-10-15T12:00:00.000"));

    expect(factoryGraceApplies(2030)).toBe(true);
  });

  it("closes on the same schedule in that later year", () => {
    setSystemTime(bkk("2030-10-31T23:59:59.999"));
    expect(factoryGraceApplies(2030)).toBe(true);

    setSystemTime(bkk("2030-11-01T00:00:00.000"));
    expect(factoryGraceApplies(2030)).toBe(false);
  });

  it("applied in a past fiscal year on the same schedule", () => {
    setSystemTime(bkk("2024-10-20T12:00:00.000"));

    expect(factoryGraceApplies(2024)).toBe(true);
  });
});

describe("factoryGraceApplies — host timezone independence", () => {
  it("decides on absolute instants, not host-local dates", () => {
    // Bangkok 2026-11-01 00:00 is 2026-10-31 17:00 UTC. A host-local implementation would still
    // read "October" under TZ=UTC and wrongly admit the write.
    setSystemTime(bkk("2026-11-01T00:00:00.000"));

    expect(factoryGraceApplies(2026)).toBe(false);
  });
});

// ─── Wiring ──────────────────────────────────────────────────────────────────
//
// The policy above is tested in isolation. These prove the four Factory write paths actually
// CONSULT it. A closed year is refused before any database read, so no fixtures are needed — which
// is also why these run without a live database.

const answerService = createAnswerService(db);

/** Definitively closed: far enough back that no grace window could ever admit it. */
const LONG_CLOSED = 2020;
const FACTORY = 99951;

const messageOf = (result: unknown) => {
  const r = result as { response?: { message?: string }; message?: string };
  return r?.response?.message ?? r?.message;
};

describe("Factory write paths consult the grace policy", () => {
  it.each([
    ["saveAnswer", () => answerService.saveAnswer(FACTORY, {} as never, LONG_CLOSED)],
    ["update", () => answerService.update(FACTORY, {} as never, LONG_CLOSED)],
    ["negotiate", () => answerService.negotiate(FACTORY, {} as never, LONG_CLOSED)],
    ["submit", () => answerService.submit(FACTORY, LONG_CLOSED)],
  ])("%s refuses a long-closed fiscal year", async (_name, call) => {
    const result = await call();

    expect(messageOf(result)).toBe(`fiscal year ${LONG_CLOSED} is closed to factories`);
  });

  it("refuses before any database read — the refusal needs no fixtures to occur", async () => {
    // If the check ran after the Cover lookup, this would surface "cover not found" instead.
    const result = await answerService.submit(FACTORY, LONG_CLOSED);

    expect(messageOf(result)).not.toBe("cover not found");
  });

  it("refuses a year two back even during a grace window", async () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));
    const result = await answerService.submit(FACTORY, 2025);

    expect(messageOf(result)).toBe("fiscal year 2025 is closed to factories");
  });

  it("admits the immediately preceding year during the window", async () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));
    const result = await answerService.submit(FACTORY, 2026);

    // Past the grace check, so it proceeds to the Cover lookup — which finds nothing for this
    // non-existent factory. Reaching that failure IS the evidence grace admitted the write.
    expect(messageOf(result)).toBe("cover not found");
  });

  it("admits the preceding year without naming it explicitly being required for the current one", async () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));
    const result = await answerService.submit(FACTORY);

    // No year named → current year → no grace consulted → straight to the lookup.
    expect(messageOf(result)).toBe("cover not found");
  });
});
