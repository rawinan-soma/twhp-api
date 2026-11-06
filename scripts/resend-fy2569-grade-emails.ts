/**
 * Send the FY2569 Grade email to factories whose Award was written by the manual Part B backfill
 * (.scratch/consecutive-gold-award/backfill-fy2569.sql) instead of by finalize.
 *
 * Usage (DRY RUN by default, enqueues nothing):
 *   bun scripts/resend-fy2569-grade-emails.ts                      list FY2569 awarded_at batches
 *   bun scripts/resend-fy2569-grade-emails.ts --batch "<ts>"       dry run for one batch
 *   bun scripts/resend-fy2569-grade-emails.ts --batch "<ts>" --send
 *
 * Flags:
 *   --batch "YYYY-MM-DD HH:MM:SS.mmm"  awarded_at of the backfill, as listed. Part B step 4 is one
 *                                      INSERT in one transaction, so all its rows share one awarded_at;
 *                                      finalize writes its own timestamps. Omit it to list the
 *                                      candidates. awarded_at is stored without a time zone, in the DB
 *                                      session's local time; copy the listed value, do not convert it.
 *   --exclude <file>                   Text file, one account email or cover id per line, for covers
 *                                      the worker logs show as already sent. '#' starts a comment.
 *   --send                             Actually enqueue. Nothing records who was sent, so a second
 *                                      --send for the same batch emails every factory again.
 */
import { readFileSync } from "node:fs";
import { and, count, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../src/drizzle";
import { accounts, awards, covers, enrolls, factories } from "../src/drizzle/schema";
import { latestCoverLogLateral } from "../src/service/coverStatus";
import { verdictFinishedJob } from "../src/service/verdictEmail";

const FISCAL_YEAR_CE = 2026;
const FY2569_START = "2025-09-30 17:00:00";
const FY2569_END = "2026-09-30 17:00:00";
const BATCH_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const batch = arg("batch");
const excludeFile = arg("exclude");
const doSend = process.argv.includes("--send");

if (process.argv.includes("--batch") && (!batch || !BATCH_FORMAT.test(batch))) {
  console.error('--batch must be "YYYY-MM-DD HH:MM:SS.mmm", as the listing prints it.');
  process.exit(1);
}

const latest = latestCoverLogLateral(db);

const [{ finishedCovers }] = await db
  .select({ finishedCovers: count() })
  .from(covers)
  .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
  .leftJoinLateral(latest, sql`true`)
  .where(
    and(
      gte(enrolls.enrollDate, FY2569_START),
      lt(enrolls.enrollDate, FY2569_END),
      eq(latest.status, "finished"),
    ),
  );

const fy2569Awards = and(eq(awards.fiscalYear, FISCAL_YEAR_CE), isNotNull(awards.coverId));

if (!batch) {
  const groups = await db
    // Postgres drops trailing zeros (".120" prints ".12"); to_char gives the exact --batch format.
    .select({
      awardedAt: sql<string>`to_char(${awards.awardedAt}, 'YYYY-MM-DD HH24:MI:SS.MS')`,
      rows: count(),
    })
    .from(awards)
    .where(fy2569Awards)
    .groupBy(awards.awardedAt)
    .orderBy(awards.awardedAt);
  console.log("awarded_at\trows");
  for (const g of groups) console.log(`${g.awardedAt}\t${g.rows}`);
  console.log(`\nFY2569 finished Covers: ${finishedCovers}`);
  console.log("Re-run with --batch <awarded_at> to dry-run one batch.");
  process.exit(0);
}

const exclude = new Set<string>();
if (excludeFile) {
  for (const raw of readFileSync(excludeFile, "utf8").split("\n")) {
    const line = raw.replace(/#.*/, "").trim().toLowerCase();
    if (line) exclude.add(line);
  }
}

const rows = await db
  .select({
    coverId: covers.id,
    email: accounts.email,
    ccEmail: enrolls.safetyOfficerEmail,
    grade: awards.grade,
    factoryNameTh: factories.nameTh,
    coverStatus: latest.status,
  })
  .from(awards)
  .innerJoin(covers, eq(covers.id, awards.coverId))
  .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
  .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
  .innerJoin(accounts, eq(accounts.id, factories.accountId))
  .leftJoinLateral(latest, sql`true`)
  .where(and(fy2569Awards, eq(awards.awardedAt, batch)))
  .orderBy(covers.id);

const [{ finalizeWritten }] = await db
  .select({ finalizeWritten: count() })
  .from(awards)
  .innerJoin(covers, eq(covers.id, awards.coverId))
  .leftJoinLateral(latest, sql`true`)
  .where(and(fy2569Awards, ne(awards.awardedAt, batch), eq(latest.status, "finished")));

const finished = rows.filter((r) => r.coverStatus === "finished");
const notFinished = rows.filter((r) => r.coverStatus !== "finished");
const isExcluded = (r: (typeof rows)[number]) =>
  exclude.has(r.email.toLowerCase()) || exclude.has(String(r.coverId));
const excluded = finished.filter(isExcluded);
const targets = finished.filter((r) => !isExcluded(r));

const jobFor = (r: (typeof rows)[number]) => verdictFinishedJob(r, r.grade);

for (const r of notFinished) {
  console.log(`SKIPPED cover ${r.coverId}\tlatest status ${r.coverStatus ?? "none"}, not finished`);
}
for (const r of excluded) {
  console.log(`EXCLUDED cover ${r.coverId}\t${r.email}\tlisted in ${excludeFile}`);
}
for (const r of targets) {
  const j = jobFor(r);
  console.log(`cover ${r.coverId}\t${j.grade}\t${j.email}\t${j.cc ?? "-"}\t${j.factoryNameTh}`);
}

console.log(
  `\nbatch ${batch} · ${rows.length} rows · ${notFinished.length} not finished · ` +
    `${excluded.length} excluded · ${targets.length} to send`,
);
const covered = finished.length + finalizeWritten;
console.log(
  `finished batch rows ${finished.length} + finished finalize-written FY2569 Awards ${finalizeWritten} = ${covered} ` +
    `(finished FY2569 Covers ${finishedCovers})${covered === finishedCovers ? "" : "  MISMATCH"}`,
);

if (!doSend) {
  console.log("\nDRY RUN, nothing enqueued. Re-run with --send to enqueue.");
} else {
  const { emailQueue } = await import("../src/queue/email");
  let ok = 0;
  let failed = 0;
  try {
    for (const r of targets) {
      try {
        await emailQueue.add("verdict-result-finished", jobFor(r));
        ok++;
      } catch (err) {
        failed++;
        console.error(`FAILED cover ${r.coverId}`, err);
      }
    }
  } finally {
    await emailQueue.close();
  }
  console.log(`\nenqueued ${ok}, failed ${failed}`);
}

process.exit(0);
