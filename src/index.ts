import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { adminController } from "./controller/admin";
import { authenticationController } from "./controller/authentication";
import { evaluatorController } from "./controller/evaluator";
import { factoryController } from "./controller/factory";
import { locationController } from "./controller/location";
import { logger, createPinoLogger } from "@bogeychan/elysia-logger";
import { provincialOfficerController } from "./controller/provincialOfficer";

const globalLogger = createPinoLogger();

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE"]);

const app = new Elysia({ prefix: "/twhp/api" })
  .use(openapi({ path: "document" }))
  .use(
    logger({
      level: "info",
      serializers: {
        request: (request) => {
          return {
            method: request?.method,
            url: request?.url,
            // Use optional chaining and bracket notation if .get() is missing
            referrer: request?.headers?.get?.("Referer") || request?.headers?.["referer"],
          };
        },
      },
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
      },
      autoLogging: {
        ignore(request) {
          const url = new URL(request.request.url);
          return url.pathname === "/twhp/api/health";
        },
      },
    }),
  )
  .onError(({ code, error, set, request, log }) => {
    if (EXPECTED_CODES.has(code as string)) {
      return error;
    }

    set.status = 500;
    const activeLogger = log ?? globalLogger;
    activeLogger.error({ err: error, request }, "Unexpected error occurred");
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
  .use(provincialOfficerController);

app.listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
