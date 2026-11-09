import { randomBytes } from "node:crypto";
import * as bcrypt from "bcrypt";
import { and, eq, gt, ne, or, sql, TransactionRollbackError } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
  type evaluatorLevels,
  evaluators,
  invitations,
  provinces,
  provincialOfficers,
} from "../drizzle/schema";
import { emailQueue } from "../queue/email";
import type { CreateInvitationDto } from "../schema/invitation";

export const INVITATION_TTL_SECONDS = 600;

type DbHandle = Pick<typeof db, "select" | "insert" | "update">;
type EvaluatorLevel = (typeof evaluatorLevels.enumValues)[number];

type TargetByRole = {
  Evaluator: { role: "Evaluator"; level: EvaluatorLevel; region: number };
  Provincial: { role: "Provincial"; provinceId: number };
};
export type InvitedRole = keyof TargetByRole;
export type InvitationTarget = TargetByRole[InvitedRole];

type InvitationRow<R extends InvitedRole = InvitedRole> = typeof invitations.$inferSelect &
  TargetByRole[R];

type RoleRule<R extends InvitedRole> = {
  checkTarget(database: DbHandle, target: TargetByRole[R]): Promise<string | null>;
  createProfile(tx: DbHandle, accountId: number, invitation: InvitationRow<R>): Promise<void>;
};

const roleRules: { [R in InvitedRole]: RoleRule<R> } = {
  Evaluator: {
    checkTarget: async (database, { region }) => {
      const [province] = await database
        .select({ id: provinces.provinceId })
        .from(provinces)
        .where(eq(provinces.healthRegion, region))
        .limit(1);
      return province ? null : "health region not found";
    },
    createProfile: async (tx, accountId, invitation) => {
      await tx.insert(evaluators).values({
        accountId,
        level: invitation.level,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        region: invitation.region,
        phoneNumber: invitation.phoneNumber,
        isChangePassword: true,
      });
    },
  },
  Provincial: {
    checkTarget: async (database, { provinceId }) => {
      const [province] = await database
        .select({ id: provinces.provinceId })
        .from(provinces)
        .where(eq(provinces.provinceId, provinceId))
        .limit(1);
      return province ? null : "province not found";
    },
    createProfile: async (tx, accountId, invitation) => {
      await tx.insert(provincialOfficers).values({
        accountId,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        phoneNumber: invitation.phoneNumber,
        provinceId: invitation.provinceId,
        isChangePassword: true,
      });
    },
  },
};

const ruleFor = <R extends InvitedRole>(role: R): RoleRule<R> => roleRules[role];

const hashToken = (token: string) => Bun.SHA256.hash(token, "hex");
const generateToken = () => randomBytes(32).toString("hex");
const expiredLinkPlaceholder = () => ({
  tokenHash: hashToken(generateToken()),
  expiresAt: new Date(0),
});
const equalsIgnoringCase = (column: AnyPgColumn, lowercased: string) =>
  eq(sql`lower(${column})`, lowercased);

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export const findEmailConflict = async (
  database: DbHandle,
  email: string,
  excludeInvitationId?: number,
): Promise<string | null> => {
  const [account] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      or(equalsIgnoringCase(accounts.email, email), equalsIgnoringCase(accounts.username, email)),
    )
    .limit(1);
  if (account) return "email already exists";

  const [invitation] = await database
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email),
        excludeInvitationId === undefined ? undefined : ne(invitations.id, excludeInvitationId),
      ),
    )
    .limit(1);
  return invitation ? "email already invited" : null;
};

export const issueLink = async (database: DbHandle, invitationId: number): Promise<boolean> => {
  const token = generateToken();
  const [invitation] = await database
    .update(invitations)
    .set({
      tokenHash: hashToken(token),
      expiresAt: sql`now() + make_interval(secs => ${INVITATION_TTL_SECONDS})`,
    })
    .where(eq(invitations.id, invitationId))
    .returning({ email: invitations.email });
  if (!invitation) return false;

  await emailQueue.add(
    "invitation",
    { email: invitation.email, token },
    {
      attempts: 3,
      backoff: 5000,
      removeOnComplete: true,
      removeOnFail: { count: 10 },
    },
  );
  return true;
};

export const createInvitationService = (database: typeof db) => ({
  create: async (input: CreateInvitationDto) => {
    const email = normalizeEmail(input.email);

    const conflict = await findEmailConflict(database, email);
    if (conflict) return status(400, { message: conflict });

    const targetProblem = await ruleFor(input.role).checkTarget(database, input);
    if (targetProblem) return status(400, { message: targetProblem });

    const [invitation] = await database
      .insert(invitations)
      .values({ ...input, email, ...expiredLinkPlaceholder() })
      .onConflictDoNothing({ target: invitations.email })
      .returning({ id: invitations.id });
    if (!invitation) return status(400, { message: "email already invited" });

    await issueLink(database, invitation.id);

    return status(201, { id: invitation.id, message: "invitation sent" });
  },

  acceptInvitation: async (token: string, password: string) => {
    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      await database.transaction(async (tx) => {
        // The DELETE is the claim: concurrent accepts serialize on the row lock and the loser
        // gets no row.
        const [claimed] = await tx
          .delete(invitations)
          .where(
            and(eq(invitations.tokenHash, hashToken(token)), gt(invitations.expiresAt, sql`now()`)),
          )
          .returning();
        if (!claimed) tx.rollback();

        if (await findEmailConflict(tx, claimed.email)) tx.rollback();

        const [account] = await tx
          .insert(accounts)
          .values({
            username: claimed.email,
            email: claimed.email,
            password: hashedPassword,
            role: claimed.role,
          })
          .onConflictDoNothing()
          .returning({ id: accounts.id });
        if (!account) tx.rollback();

        const invitation = claimed as InvitationRow;
        await ruleFor(invitation.role).createProfile(tx, account.id, invitation);
      });
    } catch (error) {
      if (error instanceof TransactionRollbackError) {
        return status(400, { message: "invalid token" });
      }
      throw error;
    }

    return { message: "invitation accepted" };
  },
});

export const invitationService = createInvitationService(db);
