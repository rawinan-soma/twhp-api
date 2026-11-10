-- Creates the Invitations table for the first release that contains Invitations (issue #47).
-- Production does not run schema pushes, so run this once, before `make deploy`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/production/invitations.sql
-- Generated with `drizzle-kit export` from src/drizzle/schema.ts, which stays authoritative.
-- It fails on a rerun by design. An existing table must be inspected, not skipped.

BEGIN;

CREATE TABLE "Invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "Roles" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"level" "EvaluatorLevels",
	"region" integer,
	"province_id" integer,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "Invitations_email_key" UNIQUE("email"),
	CONSTRAINT "Invitations_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "Invitations_role_target" CHECK (("Invitations"."role" = 'Evaluator' AND "Invitations"."level" IS NOT NULL AND "Invitations"."region" IS NOT NULL AND "Invitations"."province_id" IS NULL)
        OR ("Invitations"."role" = 'Provincial' AND "Invitations"."province_id" IS NOT NULL AND "Invitations"."level" IS NULL AND "Invitations"."region" IS NULL))
);

ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_province_id_Provinces_province_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."Provinces"("province_id") ON DELETE restrict ON UPDATE cascade;

COMMIT;
