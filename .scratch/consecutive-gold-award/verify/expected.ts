import { calculateBreakdown, computeGrade } from "../../../src/service/scoreHelpers";
const rows = (await Bun.stdin.text()).trim().split("\n").map((l) => l.split(","));
const byCover = new Map<string, any[]>(); const hist = new Set<string>();
for (const [kind, cover, choice, cat, special] of rows) {
  if (kind === "H") hist.add(cover); else (byCover.get(cover) ?? byCover.set(cover, []).get(cover)!).push({ selectedChoice: choice, category: cat, special: Number(special) });
}
for (const [cover, answers] of [...byCover].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`${cover},${computeGrade(calculateBreakdown(answers), answers, { heldGoldTierInFyMinus3: hist.has(cover) })}`);
}
