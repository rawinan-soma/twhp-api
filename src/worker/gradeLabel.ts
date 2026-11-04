import type { Grade } from "../drizzle/grades";

const PLAQUE = "รางวัลเชิดชูเกียรติและประกาศนียบัตรระดับประเทศ ประเภท";

/**
 * The Thai label the result email shows for each Grade. `Record<Grade, string>` makes a new Grade
 * without a label a type error, so an email can never fall back to printing the raw grade key.
 */
export const GRADE_LABEL: Record<Grade, string> = {
  "consec-gold": `${PLAQUE} โล่ทองต่อเนื่อง`,
  gold: `${PLAQUE} โล่ทอง`,
  silver: `${PLAQUE} โล่เงิน`,
  certificate: "ใบประกาศเกียรติคุณระดับจังหวัด",
  joined: "ใบประกาศเกียรติคุณเข้าร่วมโครงการฯ",
};
