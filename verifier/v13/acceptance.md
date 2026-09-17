# v13 · BioMapOS Run Center

日期：2026-09-09。

## 交付范围

新增正式的实验执行入口，把可复用的 BioFlow 定义实例化为一次不可变 RunPlan：选择流程与项目、绑定本批样本/物料/对照、为设备节点选择设备并填写当次参数，最后在运行详情中查看完整步骤、资源、设备、参数、就绪项和审计证据。

当前开放的是受控模拟执行：可按 DAG 顺序启动和逐波推进节点，但不会创建生产样品请求、库存预占、领料任务或设备预约，也不发送真实设备指令。现场 Edge 通道在心跳、设备租约、命令账本和回执闭环完成前由服务端硬锁定。

## 验收重点

- Workflow Definition 与 Experiment Run 分离；源模板不再保存或展示单次执行进度。
- RunPlan 保存流程拓扑、样本/物料快照、设备与驱动版本、当次参数和非敏感配置校验值；主快照使用 SHA-256，关系投影读回后再次比对。
- Run 创建、模拟启动、推进与取消经过后端业务动作；状态推进使用版本号和幂等请求标识。
- 包含未展开子流程的模板被阻断，避免遗漏子流程内的设备节点。
- simulation 与生产资源隔离；历史演示 Run 的库存预占和设备预约已释放。
- Hamilton Vector、Cytomat CytoControl、Octet 演示驱动均只处于 simulation 通道。

## 自动检查

运行 `node --import tsx verifier/v13/api-check.mts`，结果写入 `verifier/v13/api-checks.json` 与 `verifier/runs/v13-lab-run-api.log`。脚本校验模拟 Run、资源隔离、快照/关系投影、拓扑引用、敏感配置排除、创建幂等冲突和活动哈希链。

本轮实测结果：Run ID 3、7 个流程节点、2 个资源对象，状态为 `running`、revision 2；全部检查通过。`npm run verify` 通过 18 个测试文件 / 191 项测试、TypeScript、lint、前端构建与后端打包。生产依赖 Hono 已升级至 4.13.7，`npm audit --omit=dev --audit-level=high` 返回 0 个漏洞。迁移 `0014`（状态转换账本）与 `0015`（Run 内资源唯一性）均已应用；服务重启后 `/runs` 返回 HTTP 200。

## 边界

本版本的“启动/推进”只代表软件内的受控模拟状态机，不代表 Hamilton、Cytomat、Octet 或其他真实仪器已经收到命令。现场执行仍需 Edge 运行时、租约/互斥、可重放命令账本、厂家回执、异常恢复和受控审批。
