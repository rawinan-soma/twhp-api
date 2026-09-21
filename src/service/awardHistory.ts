import { and, eq, inArray } from "drizzle-orm";
import { db } from "../drizzle";
import {
  CONSEC_GOLD_LOOKBACK_YEARS,
  GOLD_ENROLMENT_LOCKOUT_YEARS,
  GOLD_TIER_GRADES,
} from "../drizzle/grades";
import { awards } from "../drizzle/schema";

/**
 * The one reader of the `Awards` table for the question "did this factory hold a gold-tier award in
 * fiscal year Y" — see docs/adr/0014-consec-gold-and-the-gold-gate.md.
 *
 * Grading at finalize (`consec-gold`) and the enrolment lockout both ask it. A second ad-hoc query
 * over `Awards` for this question is a review failure — two implementations of "held gold" is how
 * two subtly different definitions enter one codebase (the same rule `coverStatus.ts` sets for
 * Cover status under ADR-0010).
 *
 * Gold-tier means the row's grade is `gold` or `consec-gold`. The row's origin does not matter: it
 * may come from a finalize or from the imported FY2566 history. A missing row is "did not hold".
 *
 * Fiscal years are Common Era integers (FY2569 -> 2026), so every lookback is plain arithmetic.
 */
export const createAwardHistory = (database: typeof db) => {
  /**
   * Which of `factoryIds` held a gold-tier award in `fiscalYear`, in one query however many are
   * asked for (ADR-0011) — so a list path can resolve a whole page at once.
   */
  const goldTierFactoriesIn = async (
    factoryIds: number[],
    fiscalYear: number,
  ): Promise<Set<number>> => {
    if (factoryIds.length === 0) return new Set();
    const rows = await database
      .select({ factoryId: awards.factoryId })
      .from(awards)
      .where(
        and(
          inArray(awards.factoryId, factoryIds),
          eq(awards.fiscalYear, fiscalYear),
          inArray(awards.grade, [...GOLD_TIER_GRADES]),
        ),
      );
    return new Set(rows.map((r) => r.factoryId));
  };

  const heldGoldTierIn = async (factoryId: number, fiscalYear: number): Promise<boolean> =>
    (await goldTierFactoriesIn([factoryId], fiscalYear)).has(factoryId);

  return {
    goldTierFactoriesIn,
    heldGoldTierIn,
    /** `consec-gold`'s lookback, from the Cover's own fiscal year — never the current one. */
    heldGoldTierAtConsecGoldLookback: (factoryId: number, coverFiscalYear: number) =>
      heldGoldTierIn(factoryId, coverFiscalYear - CONSEC_GOLD_LOOKBACK_YEARS),
    /**
     * The first fiscal year the factory may enrol in, when a gold-tier award in one of the
     * `GOLD_ENROLMENT_LOCKOUT_YEARS` fiscal years before `enrolFiscalYear` bars it from enrolling
     * in `enrolFiscalYear`; `null` when it is free to enrol now. The latest award decides, so a factory
     * holding gold in both years is barred until the later one lapses.
     */
    firstEligibleEnrolmentYear: async (factoryId: number, enrolFiscalYear: number) => {
      for (let back = 1; back <= GOLD_ENROLMENT_LOCKOUT_YEARS; back++) {
        if (await heldGoldTierIn(factoryId, enrolFiscalYear - back)) {
          return enrolFiscalYear - back + GOLD_ENROLMENT_LOCKOUT_YEARS + 1;
        }
      }
      return null;
    },
  };
};

export const awardHistory = createAwardHistory(db);
