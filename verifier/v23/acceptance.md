# V23 BioView 深度接入 BioMapOS

BioView 仍然是 BioMapOS 内部的受控视图引擎，没有新增独立工作台或独立业务数据。主验收入口为 `/runs/:id?tab=bio-view`，设计入口为 `/workflows/:id/edit?view=bioview`，实例化入口为 `/runs/new`。

本版验收点：

- Run 列表和“我的工作”均可直达原 Run 详情页的 BioView 标签，仍保留“进入任务”主入口。
- `sample-plate-layout@1` 只读渲染 RunPlan 中已冻结的通用孔板方案；孔位中的样本继续回链 LIMS 样本详情。页面明确区分“规划位置”与“实际执行事实”。
- `run-data-flow@1` 复用 BioMapOS 原有 Run 数据流投影，在 BioView 中读取样本、库存、设备、输出、结果、原始文件与 ELN 证据，不建立第二份结果数据。
- 旧 Run 的 BioView 快照不被重写。新增的孔板绑定字段为可选字段；运行时证据链是来自权威 LIMS 记录的只读叠加层，不参与历史快照哈希重算。
- Renderer 仍只能从静态 allowlist 中选择；用户配置不能变成模块路径或可执行代码。
- 工作流已被方法版本、Run、Run 草稿、通用孔板方案、分子克隆布局或 ELN 实验引用时，删除操作改为事务内归档并写入审计链，保留历史来源链接。

验证记录（2026-09-20）：

- ESLint 全量通过。
- Vitest `31` 个测试文件、`283` 个测试通过。
- TypeScript `tsc -b` 通过。
- Vite 生产构建和服务端 esbuild 构建通过。仅有已知 3Dmol `eval` 与 bundle size 警告。
- 浏览器走查 `http://127.0.0.1:3115/runs/66?tab=bio-view`：原 BioMapOS Run 详情中同时出现 BioView 和“Run 数据流转”证据投影，控制台无 warning/error。
- 在隔离 QA 库新建 Run 67 / `RUN-20260919-80F43C`，只冻结通用 96 孔板方案，不使用分子克隆专用布局。浏览器走查 `http://127.0.0.1:3115/runs/67?tab=bio-view` 确认同页显示“冻结规划快照”、通用孔板图和“Run 数据流转”，控制台无 warning/error。由于来源方法的 Blueprint 同时声明了分子克隆 Renderer，缺少专用布局时编译器会如实记录 fallback，但不影响通用孔板与 LIMS 证据的安全渲染。

Run 66 与 Run 67 都是隔离 QA 库中的合成 simulation 数据，上述结果是软件集成验收，不代表真实设备连机、物理实验或方法学验证。
