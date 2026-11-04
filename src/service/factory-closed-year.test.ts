import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { db } from "../drizzle";
import { createAnswerService } from "./answer";

/**
 * A Factory writes only the current fiscal year. It finishes self-evaluation before the 1 Oct
 * rollover; there is no grace window. A closed year is refused before any database read, so no
 * fixtures are needed — which is also why these run without a live database.
 */

/** Bangkok wall-clock as an absolute instant, independent of the host's TZ. */
const bkk = (isoWallClock: string) => new Date(`${isoWallClock}+07:00`);

afterEach(() => {
  setSystemTime();
});

const answerService = createAnswerService(db);

const LONG_CLOSED = 2020;
const FACTORY = 99951;

const messageOf = (result: unknown) => {
  const r = result as { response?: { message?: string }; message?: string };
  return r?.response?.message ?? r?.message;
};

describe("Factory write paths refuse a closed fiscal year", () => {
  it.each([
    ["saveAnswer", () => answerService.saveAnswer(FACTORY, {} as never, LONG_CLOSED)],
    ["update", () => answerService.update(FACTORY, {} as never, LONG_CLOSED)],
    ["negotiate", () => answerService.negotiate(FACTORY, {} as never, LONG_CLOSED)],
    ["submit", () => answerService.submit(FACTORY, LONG_CLOSED)],
  ])("%s refuses a long-closed fiscal year", async (_name, call) => {
    const result = await call();

    expect(messageOf(result)).toBe(`fiscal year ${LONG_CLOSED} is closed to factories`);
  });

  it("refuses the year that just ended from the instant of rollover — no grace", async () => {
    setSystemTime(bkk("2026-10-01T00:00:00.000"));
    const result = await answerService.submit(FACTORY, 2026);

    expect(messageOf(result)).toBe("fiscal year 2026 is closed to factories");
  });

  it("still refuses it in the middle of October", async () => {
    setSystemTime(bkk("2026-10-15T12:00:00.000"));
    const result = await answerService.submit(FACTORY, 2026);

    expect(messageOf(result)).toBe("fiscal year 2026 is closed to factories");
  });
});
