# BioMap OS

一体化 LIMS · ELN 实验室操作系统 —— **One Suite, No Data Silos**。

面向合成生物学与抗体研发实验室，把项目管理、实验记录（ELN）、业务流程编排（BioFlow DAG）、
序列设计（SnapGene 级工具）、样本/耗材库存、存储位置、设备机时统一在一个数据模型之上，
并以 Lab Agent / Copilot 提供自然语言操作入口。

## 快速开始

```bash
npm install
cp .env.example .env     # 填写数据库、OAuth、会话密钥和公开地址
npm run verify           # 规范、测试、类型检查与生产构建
PORT=3100 npm start      # 启动前自动执行版本化迁移；迁移失败则拒绝启动
```

## 给 AI / 外部系统的入口

| 入口 | 用途 | 文档 |
| --- | --- | --- |
| `AGENTS.md` | AI 编程助手开发本项目的说明书 | 仓库根目录 |
| REST `/api/v1` | 外部系统/脚本读写核心数据（分只读/读写令牌） | `docs/api.md` |
| MCP Server | Claude 等 AI Agent 直接挂载为工具集 | `mcp/` |

## 文档

- 产品需求文档（PRD）：`BioMap_OS_产品需求文档_PRD.docx`（发行包附件）
- 版本验收记录：`verifier/README.md`（索引）及 `verifier/v<N>/acceptance.md`
- 生产部署与升级：`docs/deployment.md`

## 数据完整性边界

- 库存数量、流水、审计记录在同一事务内写入，并支持幂等键。
- ELN 每次保存形成不可变版本快照；复核签署绑定 SHA-256 哈希，签署不能撤销，更正以追加修订完成。
- 活动日志采用串行哈希链，可由管理员执行完整性校验。
- 系统是 RUO 实验室信息工具，不因这些技术控制自动获得 GLP/GCP 等法规认证；验证、SOP、权限审批和运维证据仍需由部署组织建立。

## 许可

内部项目，保留所有权利。
