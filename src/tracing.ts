import {
  context,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { Elysia } from "elysia";
import { pathOf, scrubErrorMessage } from "./logger";
import { isUnexpectedError } from "./logging";
import { isHealthPath } from "./routes";

/**
 * One SERVER span per request, written by hand instead of `@elysiajs/opentelemetry` (ADR-0014).
 * `src/index.ts` mounts it before request logging and autoload.
 *
 * Attributes are an allow-list: method, route template, path without query string, status, and
 * `enduser.id` when authenticated. Never headers, cookies, query strings, bodies, IPs or
 * user-agents. An inbound `traceparent` is ignored: every request starts a new trace, and its trace
 * ID is returned as `X-Request-Id`. The health routes are not traced.
 *
 * Elysia has no public hook that runs a handler *inside* a context, so the span is opened in
 * `wrap`, which wraps the whole fetch handler (pinned Elysia, exercised by `src/tracing.test.ts`).
 * Every hook, handler, service call and DB query then runs in the span's context. The response
 * status is read in `wrap`; the route template and user are only known to `onAfterResponse`. The
 * span ends when both have reported, whichever comes last.
 */

type RequestSpan = { span: Span; responded: boolean; described: boolean };

const requestSpans = new WeakMap<Request, RequestSpan>();

const endWhenComplete = (request: Request, entry: RequestSpan) => {
  if (!entry.responded || !entry.described) return;
  requestSpans.delete(request);
  entry.span.end();
};

const withRequestId = (response: Response, traceId: string) => {
  try {
    response.headers.set("x-request-id", traceId);
    return response;
  } catch {
    // Immutable headers (e.g. a proxied fetch response): copy the response.
    const copy = new Response(response.body, response);
    copy.headers.set("x-request-id", traceId);
    return copy;
  }
};

type Fetch = (request: Request) => Response | Promise<Response>;

type AfterResponseContext = {
  request: Request;
  route?: string;
  jwtPayload?: { sub?: string };
};

export const requestTracing = new Elysia({ name: "request-tracing" })
  .wrap((next) => {
    const fetch = next as unknown as Fetch;
    return ((request: Request) => {
      const path = pathOf(request);
      if (isHealthPath(path)) return fetch(request);

      const span = trace.getTracer("twhp-api").startSpan(
        request.method,
        {
          kind: SpanKind.SERVER,
          root: true,
          attributes: { "http.request.method": request.method, "url.path": path },
        },
        ROOT_CONTEXT,
      );
      const entry: RequestSpan = { span, responded: false, described: false };
      requestSpans.set(request, entry);

      return context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
        let response: Response;
        try {
          response = await fetch(request);
        } catch (error) {
          // Elysia answers errors itself, so this is not expected; don't leave the span open.
          requestSpans.delete(request);
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          throw error;
        }
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
        entry.responded = true;
        endWhenComplete(request, entry);
        return withRequestId(response, span.spanContext().traceId);
      });
    }) as never;
  })
  .onError(({ code, error, request }) => {
    if (!isUnexpectedError(code)) return;
    const span = requestSpans.get(request)?.span;
    const message = error instanceof Error ? error.message : "";
    // No stack, and Drizzle's bound params dropped: the message is all a span carries.
    span?.recordException({
      name: error instanceof Error ? error.name : "Error",
      message: scrubErrorMessage(message),
    });
  })
  .onAfterResponse((ctx) => {
    const { request, route, jwtPayload } = ctx as unknown as AfterResponseContext;
    const entry = requestSpans.get(request);
    if (!entry) return;
    if (route) {
      entry.span.updateName(`${request.method} ${route}`);
      entry.span.setAttribute("http.route", route);
    }
    if (jwtPayload?.sub) entry.span.setAttribute("enduser.id", jwtPayload.sub);
    entry.described = true;
    endWhenComplete(request, entry);
  })
  .as("global");
