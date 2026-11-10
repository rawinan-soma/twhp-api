import { t } from "elysia";

export const FactoryNameSearchQuery = t.Object({
  search: t.Optional(
    t.String({
      maxLength: 100,
      description:
        "Returns only factories whose Thai or English name contains this term, ignoring letter case. Surrounding spaces are ignored; a blank value applies no filter.",
    }),
  ),
});
