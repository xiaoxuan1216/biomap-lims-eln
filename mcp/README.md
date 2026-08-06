# BioMap OS MCP Server

把 BioMap OS 的开放 REST API（`/api/v1`）封装为 [MCP](https://modelcontextprotocol.io) 工具，
让 Claude Desktop 等 AI Agent 直接用自然语言查询/操作实验室数据：
"哪些耗材快用完了？" → `get_low_stock`；"给 Q5 聚合酶入库 5 支" → `add_stock_transaction`……

## 安装与配置

```bash
cd mcp
npm install
```

环境变量：

| 变量 | 说明 |
| --- | --- |
| `BIOMAP_BASE_URL` | BioMap OS 服务地址，默认 `http://localhost:3100` |
| `BIOMAP_API_TOKEN` | `/api/v1` 的 Bearer Token（服务端 `API_TOKENS` 中配置，必填） |

## Claude Desktop 挂载

`claude_desktop_config.json` 加入：

```json
{
  "mcpServers": {
    "biomap-os": {
      "command": "node",
      "args": ["/绝对路径/app/mcp/index.js"],
      "env": {
        "BIOMAP_BASE_URL": "http://localhost:3100",
        "BIOMAP_API_TOKEN": "sk-biomap-xxxx"
      }
    }
  }
}
```

## 工具清单（16 个）

- 样本/耗材：`list_samples` `get_low_stock` `get_sample` `get_sample_lineage` `add_stock_transaction`
- ELN：`list_experiments` `get_experiment` `create_experiment`
- 业务流：`list_workflows` `get_workflow`
- 序列：`list_sequences` `get_sequence`
- 其他：`list_equipment` `get_equipment_bookings` `list_projects` `list_activities`

写操作（`add_stock_transaction` / `create_experiment`）与 Web 端共用一致性与审计链路，
操作者记为 `api:<令牌名>`。
