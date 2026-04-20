import Elysia from "elysia";
import { jwtPlugin } from "./jwt";
import { requireRoles } from "./rbac";
import { Role } from "../service/authentication";

export const adminGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.DOED));

export const factoryGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.Factory));

export const evalGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.Evaluator));

export const officerGuard = new Elysia().use(jwtPlugin).use(requireRoles(Role.Provincial));
