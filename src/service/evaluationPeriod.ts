// TEMPORARY (FY2026 extension, revert 2026-10-16)
// See .scratch/fiscal-year-extension-2026/issues/01-extend-fy2026-evaluation-period.md
import { env } from "../config";
import { utilities } from "../utils";

/**
 * The Evaluation Period runs until `end` (exclusive). While it is open, factories are not told
 * their Grade. Its tail — from the Oct 1 rollover before `end` up to `end` — is the extension
 * window: factories have moved on to the new fiscal year, but reviewers keep the one that just
 * ended, and hard rejects are refused because the factory could no longer see the Cover to redo.
 *
 * An `end` exactly on Oct 1 has an empty window: it only withholds Grades until then.
 */
export const createEvaluationPeriod = (end: Date | null, clock: () => Date = () => new Date()) => {
  const rollover = end && utilities().getFiscalYear(end).fiscalYearStart;

  const isOpen = () => end !== null && clock() < end;
  const isExtensionWindow = () => rollover !== null && isOpen() && clock() >= rollover;

  return {
    isOpen,
    isExtensionWindow,
    /** Fiscal-year scope for staff lists; factory-side reads keep `getFiscalYear()`. */
    reviewerFiscalYear: () =>
      utilities().getFiscalYear(
        rollover && isExtensionWindow() ? new Date(rollover.getTime() - 1) : clock(),
      ),
  };
};

export type EvaluationPeriod = ReturnType<typeof createEvaluationPeriod>;

export const evaluationPeriod = createEvaluationPeriod(env.EVALUATION_PERIOD_END);
