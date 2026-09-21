/**
 * The Grade values, in ladder order. The single declaration: the `Grades` database enum, the wire
 * `GradeSchema` and the `Grade` type all derive from it. Pure module — no ORM import — so the scoring
 * helpers can depend on it without depending on the schema.
 */
export const GRADE_VALUES = ["gold", "silver", "certificate", "joined"] as const;

export type Grade = (typeof GRADE_VALUES)[number];
