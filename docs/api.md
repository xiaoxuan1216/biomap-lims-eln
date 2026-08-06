# BioMap OS 开放 API（/api/v1）

供外部系统、脚本与 AI Agent 调用的 REST 接口。读多写少；写操作与 Web 端走同一套
一致性路径（库存流水 + 活动审计），操作者记录为 `api:<令牌名>`。

## 1. 鉴权

请求头携带 Bearer Token：

```http
Authorization: Bearer <token>
```

令牌在服务端环境变量 `API_TOKENS` 中配置，格式 `名称:令牌`，逗号分隔：

```bash
API_TOKENS="claude:sk-biomap-xxxx,n8n:sk-biomap-yyyy"
```

**未配置 `API_TOKENS` 时所有 /api/v1 请求一律 401（默认关闭）。**

## 2. 通用约定

- 响应统一 JSON：成功 `{ "data": ... }`；失败 `{ "error", "hint?" }` + HTTP 状态码
- 列表参数：`limit`（默认 100，上限见各端点）、`search`、`type`/`status` 过滤
- 时间字段为 ISO 8601；数量为数值（最多 3 位小数）

## 3. 端点一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 健康检查，返回令牌名 |
| GET | `/api/v1/projects` | 项目列表 |
| GET | `/api/v1/samples?search=&type=&limit=` | 样本/耗材列表（type：cell_line/plasmid/primer/antibody/reagent/chemical/protein/virus/tissue/**buffer**/**enzyme**/**competent_cell**/other） |
| GET | `/api/v1/samples/low-stock` | 低库存预警清单（quantity ≤ alertThreshold，未设阈值按 ≤2） |
| GET | `/api/v1/samples/:id` | 样本详情（含储位与最近 50 条流水） |
| GET | `/api/v1/samples/:id/lineage` | 生命周期追溯（节点 + 关系边，内嵌序列/特性/PDB） |
| POST | `/api/v1/samples/:id/transactions` | 库存变更：`{delta, reason: restock/consume/adjust/dispose, note?}`；库存会为负时返回 409 |
| GET | `/api/v1/experiments?status=&limit=` | ELN 列表（status：planning/in_progress/completed/signed） |
| GET | `/api/v1/experiments/:id` | ELN 详情（内容块、签署状态、来源 workflowId/nodeKey） |
| POST | `/api/v1/experiments` | 创建 ELN：`{title*, objective?, projectId?, content?}`；projectId 缺省归入系统项目「BioFlow 执行记录」；初始状态 planning |
| GET | `/api/v1/workflows?limit=` | 业务流列表 |
| GET | `/api/v1/workflows/:id` | 业务流完整 DAG（nodes + edges） |
| GET | `/api/v1/sequences?search=&limit=` | 序列列表（含长度） |
| GET | `/api/v1/sequences/:id` | 序列全文 + 特性注释 |
| GET | `/api/v1/equipment` | 设备台账 |
| GET | `/api/v1/equipment/:id/bookings` | 设备机时预约 |
| GET | `/api/v1/activities?limit=` | 活动/审计日志 |

## 4. 示例

```bash
TOKEN="sk-biomap-xxxx"
BASE="http://localhost:3100"

# 查低库存
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/v1/samples/low-stock

# 追溯样本 319695 的生命周期
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/v1/samples/319695/lineage

# 创建一条实验记录
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"qPCR 定量复检","objective":"复核 EXP-0013 表达量"}' \
  $BASE/api/v1/experiments

# 耗材出库（消耗 1 支 Q5 聚合酶）
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"delta":-1,"reason":"consume","note":"EXP-0015 使用"}' \
  $BASE/api/v1/samples/349699/transactions
```

## 5. MCP（AI Agent 直连）

`mcp/` 目录是封装本 API 的 stdio MCP Server（16 个工具）。Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "biomap-os": {
      "command": "node",
      "args": ["/path/to/app/mcp/index.js"],
      "env": {
        "BIOMAP_BASE_URL": "http://localhost:3100",
        "BIOMAP_API_TOKEN": "sk-biomap-xxxx"
      }
    }
  }
}
```

工具清单：list_samples / get_low_stock / get_sample / get_sample_lineage /
add_stock_transaction / list_experiments / get_experiment / create_experiment /
list_workflows / get_workflow / list_sequences / get_sequence / list_equipment /
get_equipment_bookings / list_projects / list_activities
