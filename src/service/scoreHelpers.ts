export type CategoryKey = "Collaborate" | "Disease" | "Safety" | "Mental" | "Outcome";
export type AnswerWithCategory = { selectedChoice: string; category: CategoryKey };

export const CHOICE_POINTS: Record<string, number | null> = {
  "3": 3,
  "2": 2,
  "1": 1,
  "0": 0,
  "n/a": null,
};

export const scoreGroup = (items: AnswerWithCategory[]): number => {
  const valid = items.filter((a) => CHOICE_POINTS[a.selectedChoice] !== null);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, a) => acc + (CHOICE_POINTS[a.selectedChoice] as number), 0);
  return Math.round((sum / (3 * valid.length)) * 100);
};

export const calculateBreakdown = (items: AnswerWithCategory[]) => ({
  totalScore: scoreGroup(items),
  collaborate: scoreGroup(items.filter((a) => a.category === "Collaborate")),
  disease: scoreGroup(items.filter((a) => a.category === "Disease")),
  safety: scoreGroup(items.filter((a) => a.category === "Safety")),
  mental: scoreGroup(items.filter((a) => a.category === "Mental")),
  outcome: scoreGroup(items.filter((a) => a.category === "Outcome")),
});
