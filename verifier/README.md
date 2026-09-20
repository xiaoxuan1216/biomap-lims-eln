# Verifier 索引

| 版本 | 内容 | 验收 | 运行记录 | 交付版本 |
| --- | --- | --- | --- | --- |
| v2 | Command Deck / 仪器管理 / 质粒图谱 reviewer 修复 | （随早期快照丢失，已重建于 v4 索引） | — | ef37de1 |
| v3 | 项目驾驶舱（仪表盘/实验任务/业务流节点追踪）+ 全自动分子克隆机械臂 subflow | （同上） | — | d0c9564 |
| v4 | 样本全生命周期追溯（蛋白→表达体系→质粒→载体骨架/基因片段，3D 结构 + 序列） | verifier/v4/acceptance.md | verifier/runs/v4-acceptance.log | 71f9faf |
| v5 | 典型 ELN 演示数据（EXP-0013 scFv 表达与纯化，已签署；项目/业务流/样本消耗/活动全链路） | verifier/v5/acceptance.md | verifier/runs/v5-acceptance.log | 417bb54 |
| v6 | 节点↔ELN 联动 / 面板折叠 / Lab Agent 独立页 / 序列工具（密码子优化·酶切·Gibson）/ 耗材追踪 | verifier/v6/acceptance.md | verifier/runs/v6-acceptance.log | 7d3f0a9 |

> 注：v2/v3 的验收文档在版本快照回滚中随工作区一起被覆盖丢失；对应功能回归已在 v4 验收中顺带覆盖（样本详情、质粒图谱组件复用、双语渲染均正常）。
| v7 | 开放 REST API（/api/v1，Bearer Token）+ MCP Server（16 工具）+ AGENTS.md/README/API 文档 | （见 runs/v7-openapi.log） | verifier/runs/v7-openapi.log | e95d701 |
| v8 | 仪器属性智能体 V2（HPLC / 蛋白纯化 / 酶标 / 稳定性）+ Sample ID 扫码闭环 + 跨仪器数据谱系 | verifier/v8/acceptance.md | verifier/runs/v8-instrument-agent.log | 工作区版本 |
| v9 | 仪器运行控制中心工程化升级（显式能力门禁 / Run 状态机 / 精确扫码 / 幂等事务 / 可信异步状态） | verifier/v9/acceptance.md | verifier/runs/v9-instrument-control-center.log | 工作区版本 |
| v10 | 样品请求与履约中心（可用量校验 / 库存预占 / 工作队列 / 发放扣减 / 取消释放） | verifier/v10/acceptance.md | verifier/runs/v10-sample-request-fulfillment.log | 工作区版本 |
| v11 | 设备驱动平台（Hamilton / CytoControl / Octet 协议契约、驱动中心、设备绑定、BioFlow 动态节点） | verifier/v11/acceptance.md | verifier/runs/v11-device-driver-platform.log | 工作区版本 |
| v12 | 分子克隆动态排板（内嵌 BioFlow 与节点孔板、项目卡片摘要、条件推荐、版本与审计） | verifier/v12/acceptance.md | verifier/runs/v12-cloning-verify.log、v12-cloning-api.log | 工作区版本；中英文 UI 走查通过，依赖审计因网络超时待完成 |
| v13 | BioMapOS Run Center（流程实例化、样本/物料绑定、设备当次参数、不可变 RunPlan、受控模拟状态机） | verifier/v13/acceptance.md | verifier/runs/v13-lab-run-api.log | 工作区版本；现场 Edge 通道保持锁定 |
| v14 | Mosaic-style Run 数据流转（发起前计划预览、五段对象泳道、对象检查器、事实证据与结果空态） | verifier/v14/acceptance.md | verifier/runs/v14-mosaic-data-flow.log | 工作区版本；无结果记录时不生成结果节点 |

| v15 | 研究员任务工作区（方法发布、三步准备、草稿交接、人工证据、逐样本结果、独立 ELN 签署、异常与选样重做） | [verifier/v15/acceptance.md](v15/acceptance.md) | v15-complete-verify、method-draft-acceptance、journey-acceptance、ui-acceptance、restart | 本地工作区；工程 QA 通过，真实 SOP 可用性待测 |
| v16 | 抗体四阶段方法、产物登记与放行、重轻链来源、逐指标结果及阶段交接 | [verifier/v16/acceptance.md](v16/acceptance.md) | v16-antibody-chain、v16-ui-acceptance、v16-verify、v16-restart-health | 本地工作区已重启；软件 QA 通过，真实实验尚未验收 |
| v17 | 原始文件流式保存、100 MiB 边界、重传去重、取消、鉴权与完整性检查 | [verifier/v17/acceptance.md](v17/acceptance.md) | v17-raw-files、file-boundary、transport-abort、verify、restart-files | 本地工作区；文件传输 QA 通过，客户原始数据待接入 |
| v18 | 四阶段 19 步实验记录、表格批量粘贴、顺序列表编辑及阶段检索 | [verifier/v18/acceptance.md](v18/acceptance.md) | v18-verify、stage-records、ui-readback、i18n | 现有产品功能更新；QA 数据与物理实验分开 |

| v19 | Incoming sample identity, matching chains and stage entry | [verifier/v19/acceptance.md](v19/acceptance.md) | v19-intake-seed, v19-entry-ui | Synthetic intake-expression-release-purification handoff passed; no physical experiment |

| v20 | Reusable batch references in method fields and execution records | [verifier/v20/acceptance.md](v20/acceptance.md) | v20-verify, v20-readback | Method 72 / Run 65 synthetic UI example; actual observations remain blank |

| v21 | Experiment workspace and configuration workspace navigation | [verifier/v21/acceptance.md](v21/acceptance.md) | v21-verify-final | Original workflow canvas retained in configuration workspace; zh/en UI checked |
| v22 | BioView embedded into method configuration, Run launch and immutable Run detail | [verifier/v22/acceptance.md](v22/acceptance.md) | [v22-bioview-integration.log](runs/v22-bioview-integration.log) | QA Run 66: complete/100 BioView with LIMS links and planning-only plate flow |
| v23 | BioView deep LIMS integration: generic frozen plates, live evidence projection, direct Run entry, historical-link-safe workflow archival | [verifier/v23/acceptance.md](v23/acceptance.md) | `generic-plate-bioview-seed.mts` | QA Run 67: generic 96-well snapshot and Run evidence flow inside the original Run detail; synthetic simulation only |
| v24 | BioView converged into native BioMap OS method, launch and Run views | [verifier/v24/acceptance.md](v24/acceptance.md) | [v24-bioview-native-integration.log](runs/v24-bioview-native-integration.log) | No parallel workbench entry; QA Run 67 and method 76 browser-verified with synthetic data |
| v25 | A–P per-well Mock QC: Qsep traces, sequencing variants and target-level rates | [verifier/v25/acceptance.md](v25/acceptance.md) | [v25-verify.log](runs/v25-verify.log) | Read-only generated QC; customer-facing Mock labels removed on request; sequencing exceptions reduced to 2/96 failures; zh/en checked; no real QC or release records written |
