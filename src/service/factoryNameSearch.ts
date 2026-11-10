import { ilike, or, type SQL } from "drizzle-orm";
import { factories } from "../drizzle/schema";

/** Returns `undefined` for a blank term, which `and()` drops, so a blank term applies no filter. */
export const factoryNameSearchPredicate = (search?: string): SQL | undefined => {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return or(ilike(factories.nameTh, pattern), ilike(factories.nameEn, pattern));
};
