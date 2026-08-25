/**
 * Per-choice evidence requirements for an Answer.
 *
 * One definition shared by the two paths that judge whether existing files support a choice:
 * the Factory's negotiation `accept` (`answer.ts`) and the Evaluator's `change_score` save
 * (`evaluator-review.ts`). Standard questions are exempt — the standard, not an upload, is the
 * evidence — and callers skip the check for them.
 */

export type AnswerFileUrls = {
  fileUrl1_1: string | null;
  fileUrl2_1: string | null;
  fileUrl3_1: string | null;
};

/**
 * Returns the 400 message describing the missing evidence for `choice`, or null when the
 * requirement is satisfied. `special === 3` questions take one file per choice; every other
 * question accumulates them.
 */
export const missingFileForChoice = (
  choice: string,
  special: number,
  files: AnswerFileUrls,
): string | null => {
  if (special === 3) {
    if (choice === "1" && !files.fileUrl1_1) return "choice 1 requires file_1_1";
    if (choice === "2" && !files.fileUrl2_1) return "choice 2 requires file_2_1";
    if (choice === "3" && !files.fileUrl3_1) return "choice 3 requires file_3_1";
    return null;
  }

  if (choice === "1" && !files.fileUrl1_1) return "choice 1 requires at least file_1_1";
  if (choice === "2" && (!files.fileUrl1_1 || !files.fileUrl2_1))
    return "choice 2 requires at least file_1_1 and file_2_1";
  if (choice === "3" && (!files.fileUrl1_1 || !files.fileUrl2_1 || !files.fileUrl3_1))
    return "choice 3 requires at least file_1_1, file_2_1, and file_3_1";

  return null;
};
