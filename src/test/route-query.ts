import { resolve } from "node:path";
import type { TSchema } from "@sinclair/typebox";
import { type AnyElysia, Elysia } from "elysia";

export type RouteDefinition = (app: AnyElysia) => AnyElysia;

type QuerySchema = { properties: Record<string, TSchema>; required?: string[] };

export const listQuerySchema = async (routeModule: string) => {
  const path = resolve(import.meta.dir, "../..", routeModule);
  const define = (await import(path)).default as RouteDefinition;
  const entry = define(new Elysia()).routes.find((r) => r.method === "GET" && r.path === "");
  if (!entry?.hooks.query) throw new Error(`no GET "" query schema registered by ${routeModule}`);
  return entry.hooks.query as unknown as QuerySchema;
};
