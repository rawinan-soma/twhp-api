import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { grades } from "../drizzle/schema";
import { GradeSchema, ScoreReportListSchema, ScoreReportSchema } from "../schema/score";
import { GRADE_LABEL } from "../worker/gradeLabel";
import { calculateBreakdown, computeGrade, scoreGroup } from "./scoreHelpers";

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
    for (const grade of ["consec-gold", "gold", "silver", "certificate", "joined"] as const) {
      expect(
        Value.Check(ScoreReportSchema, {
          ...validReport,
          coverStatus: "finished",
          grade,
        }),
      ).toBe(true);
    }
  });

  it("AC: the Grades database enum holds exactly the wire values", () => {
    expect([...grades.enumValues]).toEqual([
      "consec-gold",
      "gold",
      "silver",
      "certificate",
      "joined",
    ]);
  });

  it("AC: GradeSchema accepts every value of the Grades enum and nothing else", () => {
    for (const grade of grades.enumValues) expect(Value.Check(GradeSchema, grade)).toBe(true);
    expect(Value.Check(GradeSchema, "platinum")).toBe(false);
    expect(Value.Check(GradeSchema, null)).toBe(false);
  });

  it("AC: GradeSchema keeps the JSON-schema shape it had before it was derived from the enum", () => {
    // The OpenAPI contract is the schema's JSON shape, which the finalize and Score Report routes
    // publish — deriving it from the database enum must not change it.
    expect(JSON.parse(JSON.stringify(GradeSchema))).toEqual({
      anyOf: [
        { const: "consec-gold", type: "string" },
        { const: "gold", type: "string" },
        { const: "silver", type: "string" },
        { const: "certificate", type: "string" },
        { const: "joined", type: "string" },
      ],
    });
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

// ─── Ticket 02: the five-grade ladder ───────────────────────────────────────

type GA = AC & { special?: number };

const CATEGORIES: AC["category"][] = ["Collaborate", "Disease", "Safety", "Mental", "Outcome"];

/**
 * A Cover of ordinary Answers (`special` 0) plus one Answer per special value 1, 2 and 3. Every
 * category holds `ordinary` ordinary Answers at the given choice, so percentages are easy to set.
 * The specials are spread across categories so no category is made of specials alone.
 */
const cover = (opts: {
  ordinary: string[];
  special1?: string;
  special2?: string;
  special3?: string;
}): GA[] => {
  const out: GA[] = [];
  for (const category of CATEGORIES) {
    for (const selectedChoice of opts.ordinary) out.push({ selectedChoice, category, special: 0 });
  }
  out.push({ selectedChoice: opts.special1 ?? "3", category: "Collaborate", special: 1 });
  out.push({ selectedChoice: opts.special2 ?? "3", category: "Outcome", special: 2 });
  out.push({ selectedChoice: opts.special3 ?? "3", category: "Disease", special: 3 });
  return out;
};

const grade = (answers: GA[], heldGoldTierInFyMinus3 = false) =>
  computeGrade(calculateBreakdown(answers), answers, { heldGoldTierInFyMinus3 });

const PERFECT = ["3", "3", "3", "3"];

describe("Ticket 02 — consec-gold", () => {
  it("AC: the gold gate, every special == 2 at 3, and gold held in FY-3 grades consec-gold", () => {
    expect(grade(cover({ ordinary: PERFECT }), true)).toBe("consec-gold");
  });

  it("AC: the same Cover grades gold when FY-3 gold is not held", () => {
    expect(grade(cover({ ordinary: PERFECT }), false)).toBe("gold");
  });

  it('AC: a special == 2 Answer at "2" grades gold, not consec-gold, given the history', () => {
    expect(grade(cover({ ordinary: PERFECT, special2: "2" }), true)).toBe("gold");
  });

  it("AC: an n/a on a special == 2 Question grades gold, not consec-gold", () => {
    expect(grade(cover({ ordinary: PERFECT, special2: "n/a" }), true)).toBe("gold");
  });

  it("AC: history alone never grants consec-gold to a Cover below the gold gate", () => {
    expect(grade(cover({ ordinary: ["3", "3", "2", "2"] }), true)).toBe("silver");
  });
});

describe("Ticket 02 — the settled gold gate (corrected by ticket 05: special == 1 only)", () => {
  /** Nine ordinary "3"s per category leave every percentage above 90 even with one special at "0". */
  const DEEP = Array.from({ length: 9 }, () => "3");

  it("AC: a special == 1 Answer below 3 cannot reach gold or consec-gold, whatever the percentages", () => {
    for (const special1 of ["2", "1", "0", "n/a"]) {
      const answers = cover({ ordinary: DEEP, special1 });
      expect(grade(answers)).toBe("silver");
      expect(grade(answers, true)).toBe("silver");
    }
  });

  it("AC: a special == 3 Answer below 3 does not block gold", () => {
    for (const special3 of ["2", "1", "0", "n/a"]) {
      expect(grade(cover({ ordinary: DEEP, special3 }))).toBe("gold");
    }
  });

  it("AC: a special == 3 Answer below 3 does not block consec-gold", () => {
    for (const special3 of ["2", "1", "0", "n/a"]) {
      expect(grade(cover({ ordinary: DEEP, special3 }), true)).toBe("consec-gold");
    }
  });

  it("AC: a special == 2 Answer at 1 does not block gold", () => {
    expect(grade(cover({ ordinary: PERFECT, special2: "1" }))).toBe("gold");
  });

  it("AC: n/a on a special == 1 Answer does not satisfy the gold gate", () => {
    expect(grade(cover({ ordinary: PERFECT, special1: "n/a" }))).toBe("silver");
  });

  it("AC: a Cover with no special Answers is gated on percentages alone", () => {
    const plain = CATEGORIES.map((category) => ({ selectedChoice: "3", category }));
    expect(grade(plain)).toBe("gold");
  });
});

describe("Ticket 02 — boundaries and the lower tiers are unchanged", () => {
  /** Every category holds `threes` Answers at "3" and `zeros` at "0"; no special Answers. */
  const uniform = (threes: number, zeros: number): GA[] =>
    CATEGORIES.flatMap((category) => [
      ...Array.from({ length: threes }, () => ({ selectedChoice: "3", category })),
      ...Array.from({ length: zeros }, () => ({ selectedChoice: "0", category })),
    ]);

  const gradeOf = (answers: GA[]) => {
    const breakdown = calculateBreakdown(answers);
    return {
      breakdown,
      // History held: any tier short of the gold gate must ignore it.
      grade: computeGrade(breakdown, answers, { heldGoldTierInFyMinus3: true }),
    };
  };

  it("AC: a category at exactly 80.0% is not gold", () => {
    const { breakdown, grade } = gradeOf(uniform(4, 1));
    expect(breakdown.collaborate.percentage).toBe(80);
    expect(grade).toBe("silver");
  });

  it("AC: a category at exactly 60.0% is not silver", () => {
    const { breakdown, grade } = gradeOf(uniform(3, 2));
    expect(breakdown.collaborate.percentage).toBe(60);
    expect(grade).toBe("certificate");
  });

  it("AC: totals use >=, so a total of exactly 90% with every category above 80% is gold", () => {
    const { breakdown, grade } = gradeOf(uniform(9, 1));
    expect(breakdown.total.percentage).toBe(90);
    expect(grade).toBe("consec-gold");
    expect(computeGrade(breakdown, uniform(9, 1), { heldGoldTierInFyMinus3: false })).toBe("gold");
  });

  it("AC: every category above 80% but a total below 90% is silver", () => {
    const answers: GA[] = CATEGORIES.flatMap((category) => [
      ...Array.from({ length: 17 }, () => ({ selectedChoice: "3", category })),
      ...Array.from({ length: 3 }, () => ({ selectedChoice: "0", category })),
    ]);
    const { breakdown, grade } = gradeOf(answers);
    expect(breakdown.total.percentage).toBe(85);
    expect(grade).toBe("silver");
  });

  it("AC: a total at exactly 60% is a certificate and below 60% is joined", () => {
    expect(gradeOf(uniform(3, 2)).grade).toBe("certificate");
    expect(gradeOf(uniform(1, 1)).grade).toBe("joined");
  });
});

describe("Ticket 02 — the result email label", () => {
  it("AC: consec-gold renders the plaque label, not the raw grade key", () => {
    expect(GRADE_LABEL["consec-gold"]).toBe(
      "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท โล่ทองต่อเนื่อง",
    );
  });

  it("AC: every Grade has a label of its own, none of them a raw key", () => {
    const labels = grades.enumValues.map((g) => GRADE_LABEL[g]);
    expect(new Set(labels).size).toBe(grades.enumValues.length);
    for (const g of grades.enumValues) expect(GRADE_LABEL[g]).not.toBe(g);
  });
});
