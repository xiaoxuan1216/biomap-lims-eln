# BioMap OS

一体化 LIMS · ELN 实验室操作系统 —— **One Suite, No Data Silos**。

面向合成生物学与抗体研发实验室，把项目管理、实验记录（ELN）、业务流程编排（BioFlow DAG）、
序列设计（SnapGene 级工具）、样本/耗材库存、存储位置、设备机时统一在一个数据模型之上，
并以 Lab Agent / Copilot 提供自然语言操作入口。

## 快速开始

```bash
npm install
cp .env.example .env     # 填写 DATABASE_URL、Kimi OAuth 等配置
npm run build
PORT=3100 npm start      # 首次启动自动建表并写入演示数据
```

## 给 AI / 外部系统的入口

| 入口 | 用途 | 文档 |
| --- | --- | --- |
| `AGENTS.md` | AI 编程助手开发本项目的说明书 | 仓库根目录 |
| REST `/api/v1` | 外部系统/脚本读写核心数据（Bearer Token） | `docs/api.md` |
| MCP Server | Claude 等 AI Agent 直接挂载为工具集 | `mcp/` |

## 文档

- 产品需求文档（PRD）：`BioMap_OS_产品需求文档_PRD.docx`（发行包附件）
- 版本验收记录：`verifier/README.md`（索引）及 `verifier/v<N>/acceptance.md`

## 许可

内部项目，保留所有权利。
