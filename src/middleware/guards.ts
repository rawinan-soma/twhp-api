import Elysia from "elysia";
import { Role } from "../service/authentication";
import { jwtPlugin } from "./jwt";
import { requireRoles } from "./rbac";

// `.as("scoped")` lifts the role check one level, onto the instance that mounts the guard, without
// reaching that instance's parent. Together with `as: "scoped"` inside `requireRoles`, it is what
// makes the check apply to the mounting route; `as: "global"` would leak onto sibling routes.
export const adminGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.DOED)).as("scoped");

export const factoryGuard = new Elysia()
  .use(jwtPlugin)
  .use(requireRoles(Role.Factory))
  .as("scoped");

export const evalGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.Evaluator)).as("scoped");

export const officerGuard = new Elysia()
  .use(jwtPlugin)
  .use(requireRoles(Role.Provincial))
  .as("scoped");
