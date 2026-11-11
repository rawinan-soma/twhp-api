import { describe, expect, it } from "bun:test";
import { Role } from "../../../service/authentication";
import { authenticatedRequest, signAccessToken } from "../../../test/authenticated-request";

const ROUTE = "src/routes/admins/factories/index.ts";
const NO_SUCH_FACTORY = 0;

const refusedBodies: [string, string, string][] = [
  ["malformed JSON", "{not json", "application/json"],
  ["a non-object JSON value", "[1,2]", "application/json"],
  ["an empty multipart body", "--b--\r\n", "multipart/form-data; boundary=b"],
  ["a form-encoded body", "awards=2025", "application/x-www-form-urlencoded"],
];

const send = (rawBody: string, contentType: string, token?: string) =>
  authenticatedRequest(ROUTE, {
    method: "PATCH",
    path: `/validate/${NO_SUCH_FACTORY}`,
    rawBody,
    headers: { "content-type": contentType },
    token,
  });

describe("PATCH /validate/:id answers who is calling before it judges the body", () => {
  for (const [name, rawBody, contentType] of refusedBodies) {
    it(`anonymous gets 401 for ${name}`, async () => {
      expect((await send(rawBody, contentType)).status).toBe(401);
    });

    for (const role of [Role.Factory, Role.Provincial, Role.Evaluator]) {
      it(`${role} gets 403 for ${name}`, async () => {
        const token = await signAccessToken({ id: 1, username: "not_doed", role });

        expect((await send(rawBody, contentType, token)).status).toBe(403);
      });
    }

    it(`DOED gets 400 for ${name}`, async () => {
      const token = await signAccessToken({ id: 1, username: "doed", role: Role.DOED });

      expect((await send(rawBody, contentType, token)).status).toBe(400);
    });
  }
});
