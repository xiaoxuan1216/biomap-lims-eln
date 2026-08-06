#!/usr/bin/env node
/**
 * BioMap OS MCP Server（stdio）
 * 把 BioMap OS 开放 REST API（/api/v1）封装为 MCP 工具，供 Claude Desktop 等
 * AI Agent 挂载调用。
 *
 * 环境变量：
 *   BIOMAP_BASE_URL   BioMap OS 服务地址，如 http://localhost:3100
 *   BIOMAP_API_TOKEN  /api/v1 的 Bearer Token（服务端 API_TOKENS 中配置）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.BIOMAP_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const TOKEN = process.env.BIOMAP_API_TOKEN || "";

if (!TOKEN) {
  console.error("[biomap-mcp] 缺少 BIOMAP_API_TOKEN 环境变量");
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`BioMap API ${res.status}: ${json.error || res.statusText} ${json.hint || ""}`.trim());
  }
  return json.data ?? json;
}

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (err) => ({ content: [{ type: "text", text: `错误：${err.message}` }], isError: true });
const wrap = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } };

const server = new McpServer({ name: "biomap-os", version: "1.0.0" });

/* ── 样本与耗材 ── */
server.registerTool("list_samples", {
  description: "查询 BioMap OS 样本/耗材库存列表，可按关键词与类型过滤。类型枚举：cell_line/plasmid/primer/antibody/reagent/chemical/protein/virus/tissue/buffer(缓冲液)/enzyme(工具酶)/competent_cell(感受态细胞)/other",
  inputSchema: {
    search: z.string().optional().describe("名称或 SKU 关键词"),
    type: z.string().optional().describe("样本类型枚举值"),
    limit: z.number().optional().describe("返回条数，默认 100"),
  },
}, wrap(({ search, type, limit }) => {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (type) q.set("type", type);
  if (limit) q.set("limit", String(limit));
  return api(`/samples?${q}`);
}));

server.registerTool("get_low_stock", {
  description: "获取低库存预警清单（库存量 <= 预警阈值；未设阈值时按 <= 2 判定），覆盖样本与耗材",
  inputSchema: {},
}, wrap(() => api("/samples/low-stock")));

server.registerTool("get_sample", {
  description: "获取单个样本/耗材详情（含存储位置与最近库存流水）",
  inputSchema: { id: z.number().describe("样本 ID") },
}, wrap(({ id }) => api(`/samples/${id}`)));

server.registerTool("get_sample_lineage", {
  description: "追溯样本全生命周期：向上遍历谱系 DAG（蛋白→表达体系→转染质粒→载体骨架/基因片段），返回节点与关系边；样本节点内嵌完整序列（含 PDB 结构 ID 与特性注释）",
  inputSchema: { id: z.number().describe("样本 ID") },
}, wrap(({ id }) => api(`/samples/${id}/lineage`)));

server.registerTool("add_stock_transaction", {
  description: "变更样本/耗材库存（入库/消耗/调整/废弃），自动写流水与审计日志。delta 正数为入库、负数为出库",
  inputSchema: {
    id: z.number().describe("样本 ID"),
    delta: z.number().describe("数量变化（非零；正=入库，负=出库）"),
    reason: z.enum(["restock", "consume", "adjust", "dispose"]).describe("restock 入库 / consume 消耗 / adjust 调整 / dispose 废弃"),
    note: z.string().optional().describe("备注"),
  },
}, wrap(({ id, delta, reason, note }) =>
  api(`/samples/${id}/transactions`, { method: "POST", body: { delta, reason, note } })));

/* ── 实验记录（ELN）── */
server.registerTool("list_experiments", {
  description: "查询实验记录（ELN）列表。status：planning/in_progress/completed/signed",
  inputSchema: {
    status: z.string().optional(),
    limit: z.number().optional(),
  },
}, wrap(({ status, limit }) => {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (limit) q.set("limit", String(limit));
  return api(`/experiments?${q}`);
}));

server.registerTool("get_experiment", {
  description: "获取实验记录详情（含结构化内容块、签署状态、来源业务流节点）",
  inputSchema: { id: z.number().describe("实验记录 ID") },
}, wrap(({ id }) => api(`/experiments/${id}`)));

server.registerTool("create_experiment", {
  description: "创建一条新的实验记录（初始状态 planning；projectId 缺省时归入系统项目「BioFlow 执行记录」）。content 为内容块数组：[{id,type:'heading'|'text'|'checklist',text}]",
  inputSchema: {
    title: z.string().describe("实验标题"),
    objective: z.string().optional().describe("实验目的"),
    projectId: z.number().optional().describe("归属项目 ID"),
    content: z.array(z.record(z.any())).optional().describe("ELN 内容块数组"),
  },
}, wrap((body) => api("/experiments", { method: "POST", body })));

/* ── 业务流（BioFlow DAG）── */
server.registerTool("list_workflows", {
  description: "查询 BioFlow 业务流列表",
  inputSchema: { limit: z.number().optional() },
}, wrap(({ limit }) => api(`/workflows?${new URLSearchParams(limit ? { limit: String(limit) } : {})}`)));

server.registerTool("get_workflow", {
  description: "获取业务流完整 DAG（节点含 nodeKey/类型/负责人/状态/设备绑定/子流程，边含连接关系）",
  inputSchema: { id: z.number().describe("业务流 ID") },
}, wrap(({ id }) => api(`/workflows/${id}`)));

/* ── 序列库 ── */
server.registerTool("list_sequences", {
  description: "查询序列库（DNA/RNA/蛋白），可按名称搜索",
  inputSchema: { search: z.string().optional(), limit: z.number().optional() },
}, wrap(({ search, limit }) => {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (limit) q.set("limit", String(limit));
  return api(`/sequences?${q}`);
}));

server.registerTool("get_sequence", {
  description: "获取序列全文与特性注释（含 PDB 结构 ID）",
  inputSchema: { id: z.number().describe("序列 ID") },
}, wrap(({ id }) => api(`/sequences/${id}`)));

/* ── 设备 / 项目 / 活动 ── */
server.registerTool("list_equipment", {
  description: "查询设备台账（名称/型号/状态）",
  inputSchema: {},
}, wrap(() => api("/equipment")));

server.registerTool("get_equipment_bookings", {
  description: "查询某设备的机时预约记录",
  inputSchema: { id: z.number().describe("设备 ID") },
}, wrap(({ id }) => api(`/equipment/${id}/bookings`)));

server.registerTool("list_projects", {
  description: "查询项目列表",
  inputSchema: {},
}, wrap(() => api("/projects")));

server.registerTool("list_activities", {
  description: "查询最近活动/审计日志（全平台操作留痕）",
  inputSchema: { limit: z.number().optional() },
}, wrap(({ limit }) => api(`/activities?${new URLSearchParams(limit ? { limit: String(limit) } : {})}`)));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[biomap-mcp] connected → ${BASE}`);
