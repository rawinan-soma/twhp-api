import { Elysia, status, t } from "elysia";
import type { App } from "..";
import { ReadinessSchema } from "../schema/health";
import { type HealthService, healthService } from "../service/health";

export const createHealthRoutes = (health: HealthService) =>
  new Elysia()
    .get("/health", () => "Ready to work!!", {
      response: t.String({ default: "Ready to work!!" }),
      detail: {
        summary: "Liveness (alias of /health/live)",
        description: "Kept for existing callers. Checks no dependencies.",
      },
    })
    .get("/health/live", () => "Ready to work!!", {
      response: t.String({ default: "Ready to work!!" }),
      detail: {
        summary: "Liveness",
        description:
          "200 whenever the API process is serving. Checks no dependencies; use for container healthchecks.",
      },
    })
    .get(
      "/health/ready",
      async () => {
        const checks = await health.checkReadiness();
        const ready = Object.values(checks).every((c) => c === "up");
        return ready
          ? ({ status: "ready", checks } as const)
          : status(503, { status: "not_ready", checks } as const);
      },
      {
        response: { 200: ReadinessSchema, 503: ReadinessSchema },
        detail: {
          summary: "Readiness",
          description:
            "Checks PostgreSQL (`select 1`), Redis (`PING`) and MinIO (bucket exists) in parallel, each with a 1 s timeout. 200 when all are up, otherwise 503 with the failing ones marked `down`.",
        },
      },
    );

export default (app: App) => app.use(createHealthRoutes(healthService));
