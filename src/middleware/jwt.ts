import { Elysia, status } from "elysia";
import { auth } from "../auth";

export const jwtPlugin = new Elysia({ name: "session-middleware" }).derive(
  { as: "global" },
  async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      return status(401, { message: "unauthorized" });
    }

    const user = session.user as typeof session.user & { role: string; username: string };
    return {
      jwtPayload: {
        sub: String(user.id),
        role: user.role,
        username: user.username,
      },
    };
  },
);
