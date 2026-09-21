import type { Grade } from "../drizzle/grades";

export type CategoryKey = "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome";
export type AnswerWithCategory = {
  selectedChoice: string;
  category: CategoryKey;
  special?: number;
};

export type ScoreGroup = {
  scoredCount: number;
  maxScore: number;
  achievedScore: number;
  percentage: number;
};

export const CHOICE_POINTS: Record<string, number | null> = {
  "3": 3,
  "2": 2,
  "1": 1,
  "0": 0,
  "n/a": null,
};

export const scoreGroup = (items: AnswerWithCategory[]): ScoreGroup => {
  const valid = items.filter((a) => CHOICE_POINTS[a.selectedChoice] !== null);
  const scoredCount = valid.length;
  if (scoredCount === 0) {
    return { scoredCount: 0, maxScore: 0, achievedScore: 0, percentage: 0 };
  }
  const achievedScore = valid.reduce(
    (acc, a) => acc + (CHOICE_POINTS[a.selectedChoice] as number),
    0,
  );
  const maxScore = 3 * scoredCount;
  const percentage = Math.round((achievedScore / maxScore) * 100);
  return { scoredCount, maxScore, achievedScore, percentage };
};

export const calculateBreakdown = (items: AnswerWithCategory[]) => ({
  total: scoreGroup(items),
  collaborate: scoreGroup(items.filter((a) => a.category === "Collaborate")),
  disease: scoreGroup(items.filter((a) => a.category === "Disease")),
  safety: scoreGroup(items.filter((a) => a.category === "Safety")),
  mental: scoreGroup(items.filter((a) => a.category === "Mental")),
  outcome: scoreGroup(items.filter((a) => a.category === "Outcome")),
});

export type { Grade };

/**
 * What the calculator needs to know about the factory's past. Resolved by the caller — the
 * calculator stays pure and synchronous, and a list path can resolve a whole page's history in one
 * batched query (ADR-0011). See `awardHistory.ts` for the one reader of the `Awards` table.
 */
export type GradeHistory = {
  /** The factory held a gold-tier award in the Cover's fiscal year minus 3. */
  heldGoldTierInFyMinus3: boolean;
};

/** A special gate: every Answer of the given `special` values is scored the literal choice "3". */
const specialsAllFullScore = (answers: AnswerWithCategory[], specials: readonly number[]) =>
  answers.filter((a) => specials.includes(a.special ?? 0)).every((a) => a.selectedChoice === "3");

/**
 * The Grade ladder, strictly top-down; the first match wins (docs/adr/0014).
 *
 *   consec-gold  the gold gate AND every `special == 2` Answer at "3" AND `history` holds gold in FY-3
 *   gold         every category > 80%, total >= 90%, every `special` 1 and 3 Answer at "3"
 *   silver       every category > 60% AND total >= 80%
 *   certificate  total >= 60%
 *   joined       otherwise
 *
 * A gate on the literal "3" is not met by "n/a", even though "n/a" is excluded from the percentages.
 * A further tier is a new rung above `consec-gold`, not a rewrite of the ones below it.
 */
export const computeGrade = (
  breakdown: ReturnType<typeof calculateBreakdown>,
  answers: AnswerWithCategory[],
  history: GradeHistory,
): Grade => {
  const categories = [
    breakdown.collaborate,
    breakdown.disease,
    breakdown.safety,
    breakdown.mental,
    breakdown.outcome,
  ];

  const meetsGoldGate =
    categories.every((c) => c.percentage > 80) &&
    breakdown.total.percentage >= 90 &&
    specialsAllFullScore(answers, [1, 3]);

  if (meetsGoldGate && specialsAllFullScore(answers, [2]) && history.heldGoldTierInFyMinus3)
    return "consec-gold";

  if (meetsGoldGate) return "gold";

  if (categories.every((c) => c.percentage > 60) && breakdown.total.percentage >= 80)
    return "silver";

  if (breakdown.total.percentage >= 60) return "certificate";

  return "joined";
};
