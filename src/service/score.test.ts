import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { ScoreReportListSchema, ScoreReportSchema } from "../schema/score";
import { calculateBreakdown, scoreGroup } from "./scoreHelpers";

// ─── helpers ────────────────────────────────────────────────────────────────

type AC = {
  selectedChoice: string;
  category: "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome";
};

const make = (choices: string[], category: AC["category"] = "Collaborate"): AC[] =>
  choices.map((selectedChoice) => ({ selectedChoice, category }));

const EMPTY_GROUP = { scoredCount: 0, maxScore: 0, achievedScore: 0, percentage: 0 };

// ─── Story 001: Score Formula (now via ScoreGroup.percentage) ────────────────

describe("Story 001 — Score Formula", () => {
  it('AC1: choices ["3","2","1","0"] → percentage = 50', () => {
    expect(scoreGroup(make(["3", "2", "1", "0"])).percentage).toBe(50);
  });

  it("AC2: all n/a → empty group (division-by-zero guard)", () => {
    expect(scoreGroup(make(["n/a", "n/a", "n/a"]))).toEqual(EMPTY_GROUP);
  });

  it('AC3: mix of "3" and "n/a" → n/a excluded from denominator → 100%', () => {
    expect(scoreGroup(make(["3", "n/a"])).percentage).toBe(100);
  });

  it('AC4: all "3" → 100%', () => {
    expect(scoreGroup(make(["3", "3", "3"])).percentage).toBe(100);
  });

  it('AC5: all "0" → 0%', () => {
    expect(scoreGroup(make(["0", "0", "0"])).percentage).toBe(0);
  });

  it("AC6: special field has no effect — same answers produce same group", () => {
    const a = scoreGroup(make(["2", "2"]));
    const b = scoreGroup(make(["2", "2"]));
    expect(a).toEqual(b);
    expect(a.percentage).toBe(67); // round((2+2)/(3*2)*100) = round(66.67) = 67
  });
});

// ─── Story 002: Category Breakdown ──────────────────────────────────────────

describe("Story 002 — Category Breakdown", () => {
  it("AC1: total + all 5 category keys present in response", () => {
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "3", category: "Disease" },
      { selectedChoice: "3", category: "Safety" },
      { selectedChoice: "3", category: "Mental" },
      { selectedChoice: "3", category: "Outcome" },
    ];
    const result = calculateBreakdown(items);
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("collaborate");
    expect(result).toHaveProperty("disease");
    expect(result).toHaveProperty("safety");
    expect(result).toHaveProperty("mental");
    expect(result).toHaveProperty("outcome");
  });

  it("AC2: category with no answers → empty group", () => {
    const result = calculateBreakdown(make(["3", "3"], "Collaborate"));
    expect(result.disease).toEqual(EMPTY_GROUP);
    expect(result.safety).toEqual(EMPTY_GROUP);
    expect(result.mental).toEqual(EMPTY_GROUP);
    expect(result.outcome).toEqual(EMPTY_GROUP);
  });

  it("AC3: category with only n/a answers → empty group", () => {
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "n/a", category: "Disease" },
      { selectedChoice: "n/a", category: "Disease" },
    ];
    expect(calculateBreakdown(items).disease).toEqual(EMPTY_GROUP);
  });

  it('AC4: all "3" in Collaborate → collaborate.percentage = 100', () => {
    expect(calculateBreakdown(make(["3", "3", "3"], "Collaborate")).collaborate.percentage).toBe(
      100,
    );
  });

  it("AC5: total uses all answers combined, not average of category percentages", () => {
    // Collaborate: "3" → 100%; Disease: "0","0","0" → 0%
    // avg of category percentages = 50, but total = round(3/(3*4)*100) = 25
    const items: AC[] = [
      { selectedChoice: "3", category: "Collaborate" },
      { selectedChoice: "0", category: "Disease" },
      { selectedChoice: "0", category: "Disease" },
      { selectedChoice: "0", category: "Disease" },
    ];
    const result = calculateBreakdown(items);
    expect(result.collaborate.percentage).toBe(100);
    expect(result.disease.percentage).toBe(0);
    expect(result.total.percentage).toBe(25);
  });
});

// ─── Story 009: Scoring Breakdown Fields (scoredCount/maxScore/achievedScore) ─

describe("Story 009 — Scoring Breakdown Fields", () => {
  it("AC: a group reports scoredCount, maxScore, achievedScore, percentage", () => {
    // K=4 non-n/a summing P = 3+2+1+0 = 6 → max = 3*4 = 12 → pct = round(6/12*100) = 50
    expect(scoreGroup(make(["3", "2", "1", "0"]))).toEqual({
      scoredCount: 4,
      maxScore: 12,
      achievedScore: 6,
      percentage: 50,
    });
  });

  it("AC: n/a answers are excluded from scoredCount, maxScore, achievedScore", () => {
    // one scorable "3" plus two n/a → K=1, max=3, achieved=3, pct=100
    expect(scoreGroup(make(["3", "n/a", "n/a"]))).toEqual({
      scoredCount: 1,
      maxScore: 3,
      achievedScore: 3,
      percentage: 100,
    });
  });

  it("AC: maxScore === 3 × scoredCount for every group", () => {
    const result = calculateBreakdown([
      ...make(["3", "2"], "Collaborate"),
      ...make(["1", "0", "n/a"], "Disease"),
    ]);
    for (const g of Object.values(result)) {
      expect(g.maxScore).toBe(3 * g.scoredCount);
    }
  });

  it("AC: percentage === round(achievedScore / maxScore × 100) when scoredCount > 0", () => {
    const g = scoreGroup(make(["2", "2"])); // achieved 4, max 6
    expect(g.percentage).toBe(Math.round((g.achievedScore / g.maxScore) * 100));
    expect(g.percentage).toBe(67);
  });

  it("AC: empty group (zero non-n/a) → all four values are 0", () => {
    expect(scoreGroup(make(["n/a", "n/a"]))).toEqual(EMPTY_GROUP);
  });

  it("AC: total consistency — total counts/achieved/max equal the sum across categories", () => {
    const items: AC[] = [
      ...make(["3", "2"], "Collaborate"), // count 2, achieved 5, max 6
      ...make(["1", "n/a"], "Disease"), //    count 1, achieved 1, max 3
      ...make(["0"], "Safety"), //            count 1, achieved 0, max 3
    ];
    const r = calculateBreakdown(items);
    const cats = [r.collaborate, r.disease, r.safety, r.mental, r.outcome];
    expect(r.total.scoredCount).toBe(cats.reduce((s, g) => s + g.scoredCount, 0));
    expect(r.total.achievedScore).toBe(cats.reduce((s, g) => s + g.achievedScore, 0));
    expect(r.total.maxScore).toBe(cats.reduce((s, g) => s + g.maxScore, 0));
    expect(r.total).toEqual({ scoredCount: 4, maxScore: 12, achievedScore: 6, percentage: 50 });
  });

  it("AC: worked example — 50 non-n/a answers summing 120 → {50,150,120,80}", () => {
    // 40×"3" (=120) + 10×"0" (=0) = 50 answers, sum 120
    const items = make([...Array(40).fill("3"), ...Array(10).fill("0")]);
    expect(scoreGroup(items)).toEqual({
      scoredCount: 50,
      maxScore: 150,
      achievedScore: 120,
      percentage: 80,
    });
  });
});

// ─── Story 008 + 009: Score Report Shape (nested `scoring`) ──────────────────

describe("Story 008/009 — Score Report Shape (nested scoring)", () => {
  const group = { scoredCount: 10, maxScore: 30, achievedScore: 24, percentage: 80 };
  const validReport = {
    factoryId: 1,
    factoryNameTh: "โรงงานทดสอบ",
    coverId: 10,
    coverStatus: "in_review",
    enrollId: 5,
    grade: null,
    scoring: {
      total: group,
      collaborate: group,
      disease: group,
      safety: group,
      mental: group,
      outcome: group,
    },
  };

  it("AC: ScoreReportSchema validates a well-formed nested report", () => {
    expect(Value.Check(ScoreReportSchema, validReport)).toBe(true);
  });

  it("AC: the existing contract accepts null Grade for an in-review Cover", () => {
    expect(Value.Check(ScoreReportSchema, validReport)).toBe(true);
    expect(validReport.grade).toBeNull();
  });

  it("AC: the existing contract accepts every Grade for a finished Cover", () => {
    for (const grade of ["gold", "silver", "certificate", "joined"] as const) {
      expect(
        Value.Check(ScoreReportSchema, {
          ...validReport,
          coverStatus: "finished",
          grade,
        }),
      ).toBe(true);
    }
  });

  it("AC: values outside the Grade enum are rejected", () => {
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        coverStatus: "finished",
        grade: "platinum",
      }),
    ).toBe(false);
  });

  it("AC: flat score fields are no longer part of the schema (breaking)", () => {
    // a legacy-shaped report (flat totalScore, no `scoring`) must FAIL
    const legacy = {
      factoryId: 1,
      factoryNameTh: "x",
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
    expect(Value.Check(ScoreReportSchema, legacy)).toBe(false);
  });

  it("AC: percentage rejects non-integer / out-of-range; counts reject negatives", () => {
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        scoring: { ...validReport.scoring, total: { ...group, percentage: 80.5 } },
      }),
    ).toBe(false);
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        scoring: { ...validReport.scoring, total: { ...group, percentage: 101 } },
      }),
    ).toBe(false);
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        scoring: { ...validReport.scoring, total: { ...group, scoredCount: -1 } },
      }),
    ).toBe(false);
  });

  it("AC edge: percentage 0 and 100 are valid boundaries", () => {
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        scoring: { ...validReport.scoring, total: { ...group, percentage: 0 } },
      }),
    ).toBe(true);
    expect(
      Value.Check(ScoreReportSchema, {
        ...validReport,
        scoring: { ...validReport.scoring, total: { ...group, percentage: 100 } },
      }),
    ).toBe(true);
  });

  it("AC: ScoreReportListSchema validates an array (and empty array)", () => {
    expect(Value.Check(ScoreReportListSchema, [validReport, validReport])).toBe(true);
    expect(Value.Check(ScoreReportListSchema, [])).toBe(true);
  });

  it("AC: missing `scoring` fails validation", () => {
    const { scoring: _, ...withoutScoring } = validReport;
    expect(Value.Check(ScoreReportSchema, withoutScoring)).toBe(false);
  });
});

// ─── Story 003: Cover Status Guard ──────────────────────────────────────────
// NOTE: ACs 1-4 require integration testing against a real DB (CoverLogs table).
// Unchanged by this bolt — the in_progress→400 / no-cover→404 guards are untouched.
//
// AC1: in_progress cover → status(400, { message: "cover is not ready for scoring" })
// AC2: in_review cover  → ScoreReport (HTTP 200)
// AC3: finished cover   → ScoreReport (HTTP 200)
// AC4: no cover         → status(404, { message: "cover not found" })
