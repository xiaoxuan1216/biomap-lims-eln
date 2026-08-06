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
