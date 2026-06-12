export type CategoryKey = "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome";
export type AnswerWithCategory = { selectedChoice: string; category: CategoryKey };

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
