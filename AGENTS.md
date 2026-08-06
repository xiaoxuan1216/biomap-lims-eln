# AGENTS.md — BioMap OS 开发上岗说明书

> 面向 AI 编程助手（Claude Code / Cursor / Codex 等）的项目说明书。
> 读完本文件即可独立开发、构建、验证本项目。**先读「不可破坏的约定」再动手。**

## 1. 项目是什么

BioMap OS：面向合成生物学与抗体研发实验室的一体化 **LIMS + ELN** 套件
（"One Suite, No Data Silos"）。核心模块：仪表盘、Lab Agent 指令台、项目管理、
实验记录本（ELN）、BioFlow 工作流（DAG）、序列库（SnapGene 级工具）、
样本/耗材库存与生命周期追溯、存储管理、设备管理、活动审计。
详见根目录 `verifier/` 各版本验收文档与《BioMap_OS_产品需求文档_PRD.docx》。

## 2. 技术栈与目录

| 层 | 技术 | 位置 |
| --- | --- | --- |
| 前端 | React 19 + TS + Vite + Tailwind + shadcn/ui；流程图 @xyflow/react；3D 结构 3Dmol.js | `src/`（页面 `src/pages/`，组件 `src/components/`） |
| 后端 | Hono + tRPC 11（superjson）+ Drizzle ORM | `api/`（路由 `api/*Router.ts`，汇总于 `api/router.ts`） |
| 开放 API | REST `/api/v1/*`（Bearer Token） | `api/v1.ts` |
| MCP | stdio MCP Server（封装 /api/v1） | `mcp/` |
| 数据库 | MySQL 协议（TiDB 兼容），18 张表 | `db/schema.ts` + `db/*.mts` 脚本 |
| 国际化 | 中文为主语言，`src/i18n/en.ts` 为 zh→en 字典 | `src/i18n/` |

## 3. 常用命令

```bash
npm install                 # 安装依赖（本仓库挂载点不支持软链时用 --install-links=true 或先装到 /tmp 再 cp -rL）
npm run build               # 前端 + 后端全量构建（输出 dist/，含 dist/boot.js）
PORT=3100 npm start         # 生产模式启动（启动时自动校验数据库结构）
npx tsx db/_qa.mts          # 生成 QA 登录令牌到 /tmp/token.txt
npx tsx db/<script>.mts     # 运行数据库脚本（幂等脚本是本仓库惯例）
```

## 4. 不可破坏的约定（红线）

1. **BioFlow 节点关联键是 `nodeKey`，不是节点数据库 id**——saveGraph 会删除重建节点行，
   ELN/子流程等一切关联都用 `(workflowId, nodeKey)`。
2. **ELN 签署后不可改**：`status=signed` 的记录禁止修改内容；任何关键操作必须写活动日志
   （`logActivity`，见 `api/queries/labHelpers.ts`）。
3. **库存三方一致**：消耗/补货必须同时更新 `samples.quantity` 并写 `stock_transactions` 流水；
   ELN 消耗重记时先回滚再重插（参考 `db/_seed_eln.mts`）。
4. **枚举变更走 SQL**：drizzle-kit push 会阻塞；改 enum/表结构用 `db.execute(sql\`ALTER ...\`)`
   并先 `SHOW COLUMNS` 判存（参考 `db/_seed_consumables.mts`）。schema.ts 与 DB 必须同步改。
5. **双语纪律**：所有界面文案过 `t()`，新增中文键必须同步在 `src/i18n/en.ts` 加英文翻译；
   禁止重复键（构建会告警）。
6. **tRPC 外部调用格式**：GET 需 superjson 包装
   `?batch=1&input={"0":{"json":{...}}}` + Cookie。外部系统请优先用 `/api/v1` REST。
7. **开放 API 默认关闭**：未配置 `API_TOKENS` 时 /api/v1 一律 401，不要绕过此设计。

## 5. 验证流程（交付前必做）

1. `npm run build` 零 error、零 duplicate-key 告警；
2. 重启：`pkill -f "node dist/boot.js"`，再 `PORT=3100 nohup npm start &`；
3. 实机 QA：`/qa-login.html?token=<db/_qa.mts 输出>` 登录，Playwright 走查涉及页面（中/英双语）；
4. 在 `verifier/v<N>/acceptance.md` 写验收记录、`verifier/runs/` 留运行日志、`verifier/README.md` 加索引行。

## 6. 数据资产锚点（演示库）

- 项目 1373513「重组抗体表达与表征」；系统项目「BioFlow 执行记录」（API/节点 ELN 兜底归属）
- ELN：EXP-0013（id 479273，已签署全流程样例）、EXP-0014（节点联动样例）
- 业务流 134264（14 节点 Pipeline）；谱系演示样本 319695（抗体）→ 319701（质粒）
- 耗材储位：工具酶盒 504058 / 感受态细胞盒 504059

## 7. 对接入口

- 开放 REST API：见 `docs/api.md`（Bearer Token，读多写少）
- MCP Server：见 `mcp/`（Claude Desktop 等直接挂载，16 个工具）
