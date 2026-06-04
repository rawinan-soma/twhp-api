import { t } from "elysia";
import type { App } from "..";

export default (app: App) =>
  app.get("/health", () => "Ready to work!!", {
    response: t.String({ default: "Ready to work!!" }),
  });
