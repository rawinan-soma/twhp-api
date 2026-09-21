/**
 * The Grade values, in ladder order. The single declaration: the `Grades` database enum, the wire
 * `GradeSchema` and the `Grade` type all derive from it. Pure module — no ORM import — so the scoring
 * helpers can depend on it without depending on the schema.
 */
export const GRADE_VALUES = ["consec-gold", "gold", "silver", "certificate", "joined"] as const;

export type Grade = (typeof GRADE_VALUES)[number];

/** The Grades that count as a gold-tier award when a later fiscal year looks back at history. */
export const GOLD_TIER_GRADES = ["consec-gold", "gold"] as const satisfies readonly Grade[];

/** How many fiscal years back `consec-gold` looks for a gold-tier award (docs/adr/0014). */
export const CONSEC_GOLD_LOOKBACK_YEARS = 3;

/**
 * How many fiscal years after a gold-tier award a factory may not enrol (docs/adr/0014). The plaque
 * is valid for three fiscal years: an award in year A blocks A + 1 and A + 2, and A + 3 is open.
 */
export const GOLD_ENROLMENT_LOCKOUT_YEARS = 2;
