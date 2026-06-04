import { Elysia, status } from "elysia";
import type { Role } from "../service/authentication";
import { jwtPlugin } from "./jwt";

export const requireRoles = (...allowedRoles: Role[]) =>
  new Elysia().use(jwtPlugin).derive({ as: "local" }, ({ jwtPayload }) => {
    const payload = jwtPayload as { role: Role } | undefined;

    if (!payload?.role || !allowedRoles.includes(payload.role)) {
      return status(403, "forbidden");
    }

    return { role: payload.role };
  });
