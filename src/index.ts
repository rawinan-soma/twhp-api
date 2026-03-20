import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { adminController } from "./controller/admin";
import { authenticationController } from "./controller/authentication";
import { evaluatorController } from "./controller/evaluator";
import { factoryController } from "./controller/factory";
import { locationController } from "./controller/location";

const EXPECTED_CODES = new Set([
  "VALIDATION",
  "NOT_FOUND",
  "PARSE",
  "INVALID_COOKIE_SIGNATURE",
  "INVALID_FILE_TYPE",
]);

const app = new Elysia({ prefix: "/twhp/api" })
  .use(openapi({ path: "document" }))
  .onError(({ code, error, set }) => {
    if (typeof code === "number" || EXPECTED_CODES.has(code as string)) {
      return error;
    }

    set.status = 500;
    console.error(error);
    return { message: "Unexpected error" };
  })
  .get("/health", () => "Ready to work!!", {
    response: t.String({ default: "Ready to work!!" }),
  })
  .use(locationController)
  .use(adminController)
  .use(authenticationController)
  .use(evaluatorController)
  .use(factoryController)
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
