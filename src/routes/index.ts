import { type App } from "..";
import { t } from "elysia";

export default (app: App) =>
  app.get("/health", () => "Ready to work!!", {
    response: t.String({ default: "Ready to work!!" }),
  });
