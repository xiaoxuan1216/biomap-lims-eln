# v6 计划：BioFlow × ELN 联动 + 工作台布局 + Lab Agent + 序列工具 + 耗材物料

## 需求映射
1. **节点↔ELN**：`experiments` 增加 `workflowId`/`nodeId` 可空列；层级 = 项目 → 业务流 → 节点 → ELN 条目（一个节点可挂多条 ELN，一条 ELN 最多属一个节点）。节点检查面板可「创建/查看关联 ELN」；ELN 详情显示来源面包屑回跳节点。
2. **画布空间**：WorkflowEditor 左（节点库）右（检查器）栏改为可折叠，折叠态留细条把手；状态持久化到 localStorage。
3. **用户名**：users 表 登月者7772 → Xiaoxuan。
4. **Lab Agent**：新菜单 + 路由 `/lab-agent`，指令台组件整页化（大输入区 + 历史）；仪表盘原模块替换为入口卡。
5. **序列库增强**：序列详情新增「序列工具」——密码子优化（E. coli K12 密码子表，CAI 风格加权随机 + 避免重复）、酶切位点扫描（常用酶库，切点数/位置/末端类型）、Gibson 组装设计（多片段排序 + 重叠区计算 + 引物建议）。纯前端计算库 `src/lib/seqtools.ts`。
6. **耗材物料**：samples.type 枚举扩展 `buffer`/`enzyme`/`competent_cell`；SAMPLE_TYPES 标签 + 库存筛选 + 指令台低库存口径覆盖；种子一批典型耗材（LB/PBS/感受态/T4 连接酶/高保真酶等）并放入存储位置，接入既有预警/生命周期体系。

## 阶段
- S0 勘察：WorkflowEditor 布局、指令台组件、Sequences 页、schema 枚举、commandRouter
- S1 #3 用户名（DB）→ #2 编辑器布局（前端）
- S2 #4 Lab Agent 页
- S3 #1 节点↔ELN（schema ALTER + router + 双侧 UI）
- S4 #5 序列工具
- S5 #6 耗材
- S6 构建/QA/自审/版本/verifier
