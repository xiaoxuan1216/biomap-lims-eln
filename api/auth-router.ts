import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "./lib/env";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { findUserByUnionId, upsertUser } from "./queries/users";
import {
  credentialsMatch,
  localLoginRateLimiter,
  normalizeUsername,
} from "./security/localAuth";
import {
  createExpiredSessionCookie,
  createSessionCookie,
  signSessionToken,
} from "./security/session";

function loginRateKey(headers: Headers, username: string): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = headers.get("x-real-ip")?.trim() || forwardedFor || "direct";
  return `${client}:${normalizeUsername(username)}`;
}

export const authRouter = createRouter({
  login: publicQuery
    .input(
      z.object({
        username: z.string().trim().min(1).max(128),
        password: z.string().min(1).max(1024),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!env.authUsername || !env.authPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "本地登录尚未配置" });
      }

      const rateKey = loginRateKey(ctx.req.headers, input.username);
      if (localLoginRateLimiter.retryAfterMs(rateKey) > 0) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "登录尝试过于频繁，请稍后再试" });
      }

      if (!credentialsMatch(input.username, input.password, env.authUsername, env.authPassword)) {
        localLoginRateLimiter.recordFailure(rateKey);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "账号或密码错误" });
      }

      localLoginRateLimiter.clear(rateKey);
      const username = normalizeUsername(input.username);
      const unionId = `local:${username}`;
      await upsertUser({
        unionId,
        name: env.authDisplayName,
        role: "admin",
        lastSignInAt: new Date(),
      });
      const user = await findUserByUnionId(unionId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "登录会话创建失败" });

      const token = await signSessionToken({ unionId });
      ctx.resHeaders.append("set-cookie", createSessionCookie(ctx.req.headers, token));
      return user;
    }),
  me: authedQuery.query((opts) => opts.ctx.user),
  logout: publicQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("set-cookie", createExpiredSessionCookie(ctx.req.headers));
    return { success: true };
  }),
});
