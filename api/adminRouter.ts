import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { activities, auditState, users } from "@db/schema";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity, verifyAuditChain } from "./queries/labHelpers";

export const adminRouter = createRouter({
  users: adminQuery.query(async () =>
    getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .orderBy(desc(users.lastSignInAt)),
  ),

  setUserRole: adminQuery
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["viewer", "user", "reviewer", "admin"]),
        reason: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "不能修改自己的角色，请由另一位管理员操作",
        });
      }
      return getDb().transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
          .for("update");
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        await tx.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "修改了用户角色",
          entityType: "user",
          entityId: target.id,
          entityName: target.name,
          before: { role: target.role },
          after: { role: input.role },
          reason: input.reason,
        });
        return { ok: true };
      });
    }),

  verifyAuditTrail: adminQuery.query(async () => {
    const db = getDb();
    const records = await db.select().from(activities).orderBy(asc(activities.id));
    const result = verifyAuditChain(records.map((record) => ({
      ...record,
      userName: record.userName ?? "系统",
    })));
    const [state] = await db.select().from(auditState).where(eq(auditState.id, 1));
    const stateMatches = (state?.lastHash ?? null) === result.lastHash;
    return {
      ...result,
      valid: result.valid && stateMatches,
      stateMatches,
      verifiedAt: new Date(),
    };
  }),
});
