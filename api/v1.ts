/**
 * 开放 REST API（/api/v1/*）—— 供外部系统与 AI Agent 调用。
 * 鉴权：Authorization: Bearer <token>，令牌由环境变量 API_TOKENS 配置，
 * 格式为 "名称:令牌:权限" 逗号分隔；权限为 read 或 write。
 * 未配置 API_TOKENS 时，所有 /api/v1 请求一律 401（默认关闭，安全兜底）。
 *
 * 设计原则：读多写少；写操作（库存流水、创建 ELN）全部走与 Web 端相同的
 * 一致性路径（流水表 + 数量同事务、活动日志留痕），并标注来源为 API 令牌名。
 */
import { Hono } from "hono";
import { and, desc, eq, like, or, sql, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "./queries/connection";
import {
  activities,
  equipment,
  equipmentBookings,
  experiments,
  projects,
  samples,
  sequenceFeatures,
  sequences,
  stockTransactions,
  storageLocations,
  workflowEdges,
  workflowNodes,
  workflows,
} from "@db/schema";
import { buildLineage } from "./queries/lineage";
import { appendActivity, nextExperimentCode } from "./queries/labHelpers";
import { changeInventory, InventoryError } from "./services/inventoryService";
import { appendExperimentRevision } from "./services/elnService";
import {
  authenticateApiToken,
  canWrite,
  parseApiTokens,
  type ApiTokenIdentity,
} from "./security/apiTokens";

const configuredTokens = parseApiTokens(process.env.API_TOKENS ?? "");
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

export const v1App = new Hono<{ Variables: { api: ApiTokenIdentity } }>();

/* ── 鉴权中间件 ── */
v1App.use("*", async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const identity = authenticateApiToken(configuredTokens, token);
  if (!identity) {
    return c.json({ error: "Unauthorized", hint: "需提供有效的 Bearer Token（环境变量 API_TOKENS 配置）" }, 401);
  }

  const now = Date.now();
  const window = requestWindows.get(identity.fingerprint);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    requestWindows.set(identity.fingerprint, { startedAt: now, count: 1 });
  } else if (window.count >= RATE_LIMIT) {
    c.header("Retry-After", String(Math.ceil((RATE_WINDOW_MS - (now - window.startedAt)) / 1000)));
    return c.json({ error: "Too Many Requests" }, 429);
  } else {
    window.count += 1;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !canWrite(identity)) {
    return c.json({ error: "Forbidden", hint: "该令牌只有只读权限" }, 403);
  }

  c.set("api", identity);
  await next();
});

const num = (v: string | undefined, dflt: number, max: number) =>
  Math.min(Math.max(parseInt(v ?? "", 10) || dflt, 1), max);
const validId = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/* ── 健康检查 ── */
v1App.get("/health", (c) =>
  c.json({
    ok: true,
    service: "BioMap OS Open API",
    version: "v1",
    token: c.get("api").tokenName,
    scope: c.get("api").scope,
  }));

/* ── 项目 ── */
v1App.get("/projects", async (c) => {
  const db = getDb();
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(num(c.req.query("limit"), 100, 200));
  return c.json({ data: rows });
});

/* ── 样本 / 耗材 ── */
v1App.get("/samples", async (c) => {
  const db = getDb();
  const search = c.req.query("search");
  const type = c.req.query("type");
  const conds = [isNull(samples.archivedAt)];
  if (search) conds.push(or(like(samples.name, `%${search}%`), like(samples.sku, `%${search}%`))!);
  if (type) conds.push(eq(samples.type, type as never));
  const rows = await db.select().from(samples)
    .where(and(...conds)!)
    .orderBy(desc(samples.updatedAt))
    .limit(num(c.req.query("limit"), 100, 500));
  return c.json({ data: rows });
});

v1App.get("/samples/low-stock", async (c) => {
  const db = getDb();
  const rows = await db.select().from(samples).where(and(
    isNull(samples.archivedAt),
    or(
      and(isNotNull(samples.alertThreshold), sql`${samples.quantity} <= ${samples.alertThreshold}`),
      and(isNull(samples.alertThreshold), lte(samples.quantity, 2)),
    ),
  )).limit(200);
  return c.json({ data: rows, rule: "quantity <= alertThreshold（未设阈值时按 <= 2）" });
});

v1App.get("/samples/:id", async (c) => {
  const db = getDb();
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const s = await db.query.samples.findFirst({
    where: and(eq(samples.id, id), isNull(samples.archivedAt)),
  });
  if (!s) return c.json({ error: "Not Found" }, 404);
  const location = s.locationId
    ? await db.query.storageLocations.findFirst({ where: eq(storageLocations.id, s.locationId) })
    : null;
  const txs = await db.select().from(stockTransactions)
    .where(eq(stockTransactions.sampleId, id)).orderBy(desc(stockTransactions.createdAt)).limit(50);
  return c.json({ data: { ...s, location, transactions: txs } });
});

v1App.get("/samples/:id/lineage", async (c) => {
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const result = await buildLineage("sample", id);
  if (!result) return c.json({ error: "Not Found" }, 404);
  return c.json({ data: result });
});

v1App.post("/samples/:id/transactions", async (c) => {
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const body = await c.req.json<{ delta?: number; reason?: string; note?: string }>().catch(() => null);
  const delta = Number(body?.delta);
  const reason = body?.reason ?? "";
  if (!body || !Number.isFinite(delta) || delta === 0 || !["restock", "consume", "adjust", "dispose"].includes(reason)) {
    return c.json({ error: "Bad Request", hint: "需 JSON：{delta: 非零数字, reason: restock|consume|adjust|dispose, note?}" }, 400);
  }
  const operator = `api:${c.get("api").tokenName}`;
  try {
    const result = await changeInventory({
      sampleId: id,
      delta,
      reason: reason as "restock" | "consume" | "adjust" | "dispose",
      note: body.note,
      actorName: operator,
      source: "api",
      idempotencyKey: c.req.header("Idempotency-Key"),
    });
    return c.json({ data: result }, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof InventoryError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "insufficient" ? 409 : 400;
      return c.json({ error: error.message }, status);
    }
    throw error;
  }
});

/* ── 实验记录（ELN）── */
v1App.get("/experiments", async (c) => {
  const db = getDb();
  const status = c.req.query("status");
  const rows = await db.select({
    id: experiments.id, code: experiments.code, title: experiments.title,
    status: experiments.status, projectId: experiments.projectId,
    workflowId: experiments.workflowId, nodeKey: experiments.nodeKey,
    createdByName: experiments.createdByName, signedAt: experiments.signedAt,
    createdAt: experiments.createdAt, updatedAt: experiments.updatedAt,
  }).from(experiments)
    .where(status ? eq(experiments.status, status as never) : undefined)
    .orderBy(desc(experiments.updatedAt))
    .limit(num(c.req.query("limit"), 100, 500));
  return c.json({ data: rows });
});

v1App.get("/experiments/:id", async (c) => {
  const db = getDb();
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const e = await db.query.experiments.findFirst({ where: eq(experiments.id, id) });
  if (!e) return c.json({ error: "Not Found" }, 404);
  return c.json({ data: e });
});

v1App.post("/experiments", async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    title?: string; objective?: string; projectId?: number;
    content?: unknown;
  }>().catch(() => null);
  if (!body?.title?.trim()) {
    return c.json({ error: "Bad Request", hint: "需 JSON：{title: 必填, objective?, projectId?, content?（块数组）}" }, 400);
  }
  const title = body.title.trim();
  const operator = `api:${c.get("api").tokenName}`;
  /* projectId 缺省时归入系统项目「BioFlow 执行记录」（与 Web 端 createForNode 同一口径） */
  let projectId = body.projectId ?? null;
  if (projectId) {
    const p = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!p) return c.json({ error: "Bad Request", hint: `项目 ${projectId} 不存在` }, 400);
  } else {
    const SYSTEM_PROJECT = "BioFlow 执行记录";
    let sp = await db.query.projects.findFirst({ where: eq(projects.name, SYSTEM_PROJECT) });
    if (!sp) {
      await db.insert(projects).values({
        name: SYSTEM_PROJECT,
        description: "由 BioFlow 节点 / Open API 自动创建的 ELN 执行记录汇总（系统项目）",
        color: "slate", status: "active",
      });
      sp = await db.query.projects.findFirst({ where: eq(projects.name, SYSTEM_PROJECT) });
    }
    projectId = sp!.id;
  }
  const content = Array.isArray(body.content) && body.content.length
    ? body.content
    : [
        { id: "b1", type: "heading", text: "实验目的" },
        { id: "b2", type: "text", text: body.objective ?? "" },
      ];
  const created = await db.transaction(async (tx) => {
    const code = await nextExperimentCode(tx);
    const [{ id }] = await tx.insert(experiments).values({
      code, title, objective: body.objective ?? null,
      projectId,
      content: JSON.stringify(content),
      status: "planning",
      createdByName: operator,
    }).$returningId();
    const [experiment] = await tx.select().from(experiments).where(eq(experiments.id, id));
    await appendExperimentRevision(
      tx,
      experiment,
      { name: operator, source: "api" },
      "通过 API 创建实验记录",
    );
    await appendActivity(tx, {
      userName: operator,
      source: "api",
      action: "通过 API 创建了实验记录",
      entityType: "experiment",
      entityId: id,
      entityName: `${code} ${title}`,
    });
    return { id, code };
  });
  return c.json({ data: { ...created, projectId, status: "planning" } }, 201);
});

/* ── 业务流（BioFlow）── */
v1App.get("/workflows", async (c) => {
  const db = getDb();
  const rows = await db.select().from(workflows).orderBy(desc(workflows.updatedAt)).limit(num(c.req.query("limit"), 100, 200));
  return c.json({ data: rows });
});

v1App.get("/workflows/:id", async (c) => {
  const db = getDb();
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, id) });
  if (!wf) return c.json({ error: "Not Found" }, 404);
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, id));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, id));
  return c.json({ data: { ...wf, nodes, edges } });
});

/* ── 序列 ── */
v1App.get("/sequences", async (c) => {
  const db = getDb();
  const search = c.req.query("search");
  const rows = await db.select({
    id: sequences.id, name: sequences.name, type: sequences.type,
    description: sequences.description, pdbId: sequences.pdbId,
    length: sql<number>`CHAR_LENGTH(${sequences.sequence})`.as("length"),
    createdAt: sequences.createdAt,
  }).from(sequences)
    .where(search ? like(sequences.name, `%${search}%`) : undefined)
    .orderBy(desc(sequences.createdAt))
    .limit(num(c.req.query("limit"), 100, 200));
  return c.json({ data: rows });
});

v1App.get("/sequences/:id", async (c) => {
  const db = getDb();
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, id) });
  if (!seq) return c.json({ error: "Not Found" }, 404);
  const features = await db.select().from(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, id));
  return c.json({ data: { ...seq, features } });
});

/* ── 设备与预约 ── */
v1App.get("/equipment", async (c) => {
  const db = getDb();
  const rows = await db.select().from(equipment).limit(num(c.req.query("limit"), 100, 500));
  return c.json({ data: rows });
});

v1App.get("/equipment/:id/bookings", async (c) => {
  const db = getDb();
  const id = validId(c.req.param("id"));
  if (!id) return c.json({ error: "Bad Request", hint: "id 必须是正整数" }, 400);
  const rows = await db.select().from(equipmentBookings)
    .where(eq(equipmentBookings.equipmentId, id))
    .orderBy(desc(equipmentBookings.startTime)).limit(100);
  return c.json({ data: rows });
});

/* ── 活动日志 ── */
v1App.get("/activities", async (c) => {
  const db = getDb();
  const rows = await db.select().from(activities).orderBy(desc(activities.createdAt)).limit(num(c.req.query("limit"), 50, 200));
  return c.json({ data: rows });
});
