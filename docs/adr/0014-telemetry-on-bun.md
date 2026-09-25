# ADR 0014: Telemetry on Bun — own request spans, pulled metrics, and a compiled worker without auto DB spans

**Status:** Accepted (2026-09-25)

## Context

We are adding traces (OpenTelemetry → Alloy → Tempo), metrics (Prometheus) and central logs (Loki)
to an API and an email worker that run on Bun, not Node. Most OpenTelemetry tooling assumes Node.
Probes on Bun 1.3.6 and 1.4.2 found:

- Module-patching auto-instrumentation only works for modules loaded through CommonJS `require`.
  `pg` works when preloaded. `ioredis`, ESM-imported `node:http`, and Bun's `fetch` do not.
- Inside a `bun build --compile` binary, which is how the production worker ships, no
  auto-instrumentation works, and `--external pg` fails to resolve.
- `@elysiajs/opentelemetry` 1.4.11 copies every request header onto spans, including the
  `Authentication`/`Refresh` cookies and `authorization`. It also pins an old
  `@opentelemetry/sdk-node` (`^0.200`).
- BullMQ's native `telemetry` option with `bullmq-otel` does carry context from producer to worker,
  including inside the compiled binary.
- `prom-client` works under Bun.

Logs, spans and Grafana must hold no secrets or personal data. Grafana's audience is wider than the
database's.

## Decision

1. **We trace requests with our own Elysia hook, not `@elysiajs/opentelemetry`.** The hook sets an
   allow-list of attributes (method, route template, path without query, status, user ID) and never
   headers, cookies, query strings, bodies, IPs or user-agents. Scrubbing the plugin's output would
   be a deny-list, and a deny-list fails open for any header nobody thought of. It would also still
   pull in a second, older SDK.
2. **The API ignores inbound `traceparent`.** There is no browser tracing, so an inbound trace
   context can only come from outside, and accepting it would let anyone choose our trace IDs.
3. **The worker stays a compiled binary and gets no automatic DB spans.** Its traces come from
   BullMQ's telemetry plus hand-written spans (SMTP send, the reminder query). Running it from source
   would restore `pg` auto-spans for a process that makes very few DB calls, at the cost of the
   single-binary deployment.
4. **Metrics are pulled.** `prom-client` serves `/metrics` on a separate internal port (not under
   `/twhp/api`, so nginx can never expose it), and Prometheus scrapes it. Pulling gives "process
   down" (`up == 0`) for free, which the API-down and worker-down alerts depend on. Pushing metrics
   through OTLP was not verified under Bun.
5. **Redaction is strict and layered.** The app never emits secrets or personal data (allow-listed
   span attributes, redacted pino paths, no PII in metric labels). Alloy additionally deletes header,
   cookie and query attributes before export.

## Consequences

- Redis, MinIO, SMTP and outbound `fetch` calls appear in traces only where someone wrote a span.
  New integrations need a hand-written span to be visible.
- Revisit decisions 1 and 3 if Bun ships native OpenTelemetry (`BUN_OTEL`, an unmerged PR as of
  2026-09) or reliable ESM module patching, or if `@elysiajs/opentelemetry` gains header allow-listing.
- Bun and Elysia are pinned to exact versions, because tracing behavior changed between Bun minors.
