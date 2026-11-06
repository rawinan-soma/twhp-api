import type { Grade } from "../drizzle/grades";

export type VerdictEmailContact = {
  email: string;
  ccEmail: string | null;
  factoryNameTh: string;
};

export const verdictEmailCc = (contact: VerdictEmailContact): string | undefined =>
  contact.ccEmail && contact.ccEmail !== contact.email ? contact.ccEmail : undefined;

export const verdictFinishedJob = (contact: VerdictEmailContact, grade: Grade | null) => ({
  email: contact.email,
  cc: verdictEmailCc(contact),
  grade,
  factoryNameTh: contact.factoryNameTh,
});
