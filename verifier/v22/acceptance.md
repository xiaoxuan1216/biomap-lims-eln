# V22 BioView 内嵌 BioMapOS

BioView 不再作为独立工作台交付，而是 BioMapOS 内部的受控视图引擎。后台在原方法卡片和 BioFlow 编辑器中配置实验视图；方法提交、复核、发布时将 BioView Blueprint 纳入版本差异与并发保护；新建实验时再与本次样本、物料、设备和参数合并，冻结进不可变 RunPlan。

验收链路：

- `/configuration/methods` 在原方法配置后台提供“配置实验视图”，viewer 不显示配置操作。
- `/workflows/:id/edit?view=bioview` 使用当前 BioFlow DAG 生成语义绑定，保存时校验 graph hash。已发布方法和历史 Run 不被工作副本修改。
- `/runs/new?workflowId=:id` 在最终确认阶段展示本次 BioView，读取已选样本、物料、设备及当次参数。无效 workflowId 回到方法选择，不进入空状态。
- `/runs/:id?tab=bio-view` 只读取已通过完整性校验的冻结快照，样本、物料、设备和来源方法都可回链 LIMS 原对象；来源方法链接带冻结的 releaseId，避免后续发布覆盖历史语义。

QA 数据仅写入 `biomap_v15_qa`。`embedded-bioview-seed.mts` 在加载应用模块前改写并回读校验数据库名，然后通过正式业务动作创建方法、发布版本、排板方案和 simulation Run。Run 66 / `RUN-20260919-ADC84F` 包含 8 个合成质粒样本、1 项合成物料、2 个真实 LIMS 设备对象、4 个流程节点和 14 块 planning-only 孔板。回读结果为 `integrityValid=true`、`BioView complete/100`、issues 为 0，主库同幂等键记录数为 0。

页面走查确认原 BioMapOS Run 详情中同时显示精细孔板流、样本与物料表、当次设备参数、时间线、样本谱系及 LIMS 回链。这是软件功能和合成数据验收，不代表真实实验、设备连机或现场方法学验证。
