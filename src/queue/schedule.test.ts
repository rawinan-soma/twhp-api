import { describe, expect, test } from "bun:test";
import parser from "cron-parser";
import { VALIDATION_REMINDER_PATTERN } from "./schedule";

describe("validation reminder schedule", () => {
  test("never fires on a Bangkok weekend", () => {
    const it = parser.parseExpression(VALIDATION_REMINDER_PATTERN, {
      currentDate: new Date("2026-11-01T00:00:00+07:00"),
      tz: "Asia/Bangkok",
    });
    const weekdays = new Set<string>();
    for (let i = 0; i < 30; i++) {
      weekdays.add(
        it
          .next()
          .toDate()
          .toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }),
      );
    }
    expect([...weekdays].sort()).toEqual(["Fri", "Mon", "Thu", "Tue", "Wed"]);
  });
});
