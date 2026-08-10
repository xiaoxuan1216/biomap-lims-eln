import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import {
  createOAuthCallbackHandler,
  createOAuthLoginHandler,
} from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { migrateDatabase } from "./queries/migrate";
import { v1App } from "./v1";
import { isTrustedOrigin } from "./security/origin";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(secureHeaders({
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: { camera: false, microphone: false, geolocation: false },
}));
app.use(bodyLimit({ maxSize: 5 * 1024 * 1024 }));
app.get("/healthz", (c) => c.json({ ok: true }));
app.get(Paths.oauthLogin, createOAuthLoginHandler());
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
/* 开放 REST API（Bearer Token 鉴权，供外部系统与 AI Agent 调用） */
app.route("/api/v1", v1App);
app.use("/api/trpc/*", async (c) => {
  if (c.req.method !== "GET" && !isTrustedOrigin(c.req.raw, env.publicBaseUrl)) {
    return c.json({ error: "Forbidden", message: "请求来源校验失败" }, 403);
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// 启动必须先完成版本化迁移；失败即停止，避免带着半套 schema 提供服务。
await migrateDatabase();

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
