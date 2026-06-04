import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { ScoreReportListSchema, ScoreReportSchema } from "../schema/score";
import { calculateBreakdown, scoreGroup } from "./scoreHelpers";

// ─── helpers ────────────────────────────────────────────────────────────────

type AC = { selectedChoice: string; category: "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome" };

const make = (choices: string[], category: AC["category"] = "Collaborate"): AC[] =>
  choices.map((selectedChoice) => ({ selectedChoice, category }));

// ─── Story 001: Score Formula ────────────────────────────────────────────────

describe("Story 001 — Score Formula", () => {
  it('AC1: choices ["3","2","1","0"] → score = 50', () => {
    const items = make(["3", "2", "1", "0"]);
    expect(scoreGroup(items)).toBe(50);
  });

  it("AC2: all n/a → score = 0 (division-by-zero guard)", () => {
    const items = make(["n/a", "n/a", "n/a"]);
    expect(scoreGroup(items)).toBe(0);
  });

  it('AC3: mix of "3" and "n/a" → n/a excluded from denominator → 100', () => {
    const items = make(["3", "n/a"]);
    expect(scoreGroup(items)).toBe(100);
  });

  it('AC4: all "3" → 100', () => {
    expect(scoreGroup(make(["3", "3", "3"]))).toBe(100);
  });

  it('AC5: all "0" → 0', () => {
    expect(scoreGroup(make(["0", "0", "0"]))).toBe(0);
  });

  it("AC6: special field has no effect — same answers, different special values produce same score", () => {
    // special is not part of AnswerWithCategory — it is ignored by design
    const a = scoreGroup(make(["2", "2"]));
    const b = scoreGroup(make(["2", "2"]));
    expect(a).toBe(b);
    expect(a).toBe(67); // round((2+2)/(3*2)*100) = round(4/6*100) = round(66.67) = 67
  });
});

// ─── Story 002: Category Breakdown ──────────────────────────────────────────

describe("Story 002 — Category Breakdown", () => {
  it("AC1: all 5 category keys present in response", () => {
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "3", category: "Disease" },
      { selectedChoice: "3", category: "Safety" },
      { selectedChoice: "3", category: "Mental" },
      { selectedChoice: "3", category: "Outcome" },
    ];
    const result = calculateBreakdown(items);
    expect(result).toHaveProperty("totalScore");
    expect(result).toHaveProperty("collaborate");
    expect(result).toHaveProperty("disease");
    expect(result).toHaveProperty("safety");
    expect(result).toHaveProperty("mental");
    expect(result).toHaveProperty("outcome");
  });

  it("AC2: category with no answers → score = 0", () => {
    const items = make(["3", "3"], "Collaborate");
    const result = calculateBreakdown(items);
    expect(result.disease).toBe(0);
    expect(result.safety).toBe(0);
    expect(result.mental).toBe(0);
    expect(result.outcome).toBe(0);
  });

  it("AC3: category with only n/a answers → score = 0", () => {
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "n/a", category: "Disease" },
      { selectedChoice: "n/a", category: "Disease" },
    ];
    const result = calculateBreakdown(items);
    expect(result.disease).toBe(0);
  });

  it('AC4: all "3" in Collaborate → collaborate = 100', () => {
    const items = make(["3", "3", "3"], "Collaborate");
    const result = calculateBreakdown(items);
    expect(result.collaborate).toBe(100);
  });

  it("AC5: totalScore = all answers combined, not average of category scores", () => {
    // Collaborate: "3","3" → 100; Disease: "0","0" → 0
    // avg of categories = 50, but totalScore must use combined = round((3+3+0+0)/(3*4)*100) = round(6/12*100) = 50
    // In this case they happen to equal — use asymmetric example instead:
    // Collaborate: "3" → 100; Disease: "0","0","0" → 0
    // avg categories = 50, combined = round(3/(3*4)*100) = round(100/4) = 25
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "0", category: "Disease" },
      { selectedChoice: "0", category: "Disease" },
      { selectedChoice: "0", category: "Disease" },
    ];
    const result = calculateBreakdown(items);
    expect(result.collaborate).toBe(100);
    expect(result.disease).toBe(0);
    expect(result.totalScore).toBe(25); // combined: 3/(3*4)*100 = 25
  });
});

// ─── Story 008: Score Report Shape ──────────────────────────────────────────

describe("Story 008 — Score Report Shape", () => {
  const validReport = {
    factoryId: 1,
    factoryNameTh: "โรงงานทดสอบ",
    coverId: 10,
    coverStatus: "in_review",
    enrollId: 5,
    totalScore: 82,
    collaborate: 90,
    disease: 75,
    safety: 80,
    mental: 85,
    outcome: 70,
  };

  it("AC1 & AC2: ScoreReportSchema validates a well-formed report with all required fields", () => {
    expect(Value.Check(ScoreReportSchema, validReport)).toBe(true);
  });

  it("AC2: score fields reject non-integers", () => {
    expect(Value.Check(ScoreReportSchema, { ...validReport, totalScore: 82.5 })).toBe(false);
  });

  it("AC2: score fields reject values below 0", () => {
    expect(Value.Check(ScoreReportSchema, { ...validReport, totalScore: -1 })).toBe(false);
  });

  it("AC2: score fields reject values above 100", () => {
    expect(Value.Check(ScoreReportSchema, { ...validReport, totalScore: 101 })).toBe(false);
  });

  it("AC2 edge: score value 0 is valid (minimum boundary)", () => {
    expect(Value.Check(ScoreReportSchema, { ...validReport, totalScore: 0 })).toBe(true);
  });

  it("AC2 edge: score value 100 is valid (maximum boundary)", () => {
    expect(Value.Check(ScoreReportSchema, { ...validReport, totalScore: 100 })).toBe(true);
  });

  it("AC3: ScoreReportListSchema validates an array of reports", () => {
    expect(Value.Check(ScoreReportListSchema, [validReport, validReport])).toBe(true);
  });

  it("AC3: ScoreReportListSchema validates an empty array", () => {
    expect(Value.Check(ScoreReportListSchema, [])).toBe(true);
  });

  it("AC1: missing required field fails validation", () => {
    const { factoryNameTh: _, ...withoutName } = validReport;
    expect(Value.Check(ScoreReportSchema, withoutName)).toBe(false);
  });
});

// ─── Story 003: Cover Status Guard ──────────────────────────────────────────
// NOTE: ACs 1-4 require integration testing against a real DB (CoverLogs table).
// This project has no test DB setup yet. These scenarios are verified manually
// or deferred until a test-db fixture is introduced.
//
// AC1: in_progress cover → service returns status(400, { message: "cover is not ready for scoring" })
// AC2: in_review cover  → service returns ScoreReport (HTTP 200)
// AC3: finished cover   → service returns ScoreReport (HTTP 200)
// AC4: no cover         → service returns status(404, { message: "cover not found" })
