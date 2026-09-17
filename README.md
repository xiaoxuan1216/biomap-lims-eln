# BioMap OS

一体化 LIMS · ELN 实验室操作系统 —— **One Suite, No Data Silos**。

面向合成生物学与抗体研发实验室，把项目管理、实验记录（ELN）、业务流程编排（BioFlow DAG）、
序列设计（SnapGene 级工具）、样本/耗材库存、存储位置、设备机时统一在一个数据模型之上，
并把 CRO / CDMO 外部委托的需求、送样、执行、交付与验收接入 BioFlow，
同时以 Lab Agent / Copilot 提供自然语言操作入口。

## 团队同步

当前产品开发分支：`codex/production-hardening`。首次获取：

```bash
git clone --branch codex/production-hardening https://github.com/xiaoxuan1216/biomap-lims-eln.git
cd biomap-lims-eln
```

后续更新先提交或妥善保存自己的修改，再运行 `git pull --ff-only`。开发新功能请从该分支创建个人分支，并通过 Pull Request 合并；不要强制推送共享分支。

当前版本包含实验运行入口与运行工作台、样本/物料绑定、设备参数配置、流程与孔板联动视图、设备驱动中心、样本请求和外部委托管理。设备驱动及运行演示不代表真机已经完成联调或验收。

## 快速开始（完整系统）

需要 Node.js 24 LTS（最低 22.22.0）、npm，以及单独创建的 MySQL 数据库。统一使用已提交的 `package-lock.json` 安装依赖。

```bash
npm ci
cp .env.example .env     # 填写数据库、BioMap 登录账号、会话密钥和公开地址
npm run verify           # 规范、测试、类型检查与生产构建
PORT=3100 npm start      # 启动前自动执行版本化迁移；迁移失败则拒绝启动
```

打开 <http://localhost:3100>，使用自己在 `.env` 配置的账号登录。开发模式使用 `npm run dev`，以终端输出的地址为准。

`.env.example` 只含占位值，不能直接作为有效配置。未启用的可选模型/API 令牌配置应留空或注释，不要把示例占位值当作真实密钥。不要在仓库、聊天记录或浏览器代码中分享数据库密码、登录密码与会话密钥。

数据库内容不随 Git 同步。历史 `db/seed*.ts` 中有清空业务表的逻辑，**不要在已有实验数据的数据库上运行**。`db/_seed_*.mts` 为不同演示场景脚本，部分依赖已有项目、管理员、样本和固定流程 ID；必须在隔离演示库中核对脚本前置条件后使用，不是通用生产初始化命令。

## 无需数据库的离线演示

只看当前产品交互，可下载仓库后，用浏览器打开：

- [实验运行完整工作台（离线演示）](public/share/BioMapOS_实验运行完整工作台_离线演示.html)
- [通用实验工作流（带演示数据）](public/share/BioMapOS_通用实验工作流_带数据.html)

这些页面使用演示数据，不能替代后端存储、权限、审计或真实设备执行。GitHub 文件页展示源码；下载 HTML 后打开即可预览。发布仓库不等于部署了可联网访问的完整系统。

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
- 设备驱动协议与接入边界：`docs/device-driver-sdk.md`
- 分子克隆动态排板与整体产品整合：`docs/cloning-planner-integration.md`；现有 BioFlow 编辑器 `/workflows/:id` 内的“孔板与样本”与节点预览

## 数据完整性边界

- 库存数量、流水、审计记录在同一事务内写入，并支持幂等键。
- ELN 每次保存形成不可变版本快照；复核签署绑定 SHA-256 哈希，签署不能撤销，更正以追加修订完成。
- 活动日志采用串行哈希链，可由管理员执行完整性校验。
- 系统是 RUO 实验室信息工具，不因这些技术控制自动获得 GLP/GCP 等法规认证；验证、SOP、权限审批和运维证据仍需由部署组织建立。

## 许可

内部项目，保留所有权利。

本地录音/视频、客户原始 SOP、临时文件、数据库与密钥不纳入代码同步。厂商原始接口文档也不随本仓库分发。
