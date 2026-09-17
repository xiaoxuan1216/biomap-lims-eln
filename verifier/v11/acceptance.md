# v11 验收记录（设备驱动平台）

## 目标与结论

本次升级把厂家差异收敛为 BioMapOS Driver Manifest v1，并完成版本目录、设备绑定、连接参数、模拟/真机边界和 BioFlow 动态节点。Hamilton、CytoControl V8、Octet Data Acquisition 三份真实厂家资料已落实为内置驱动契约与纯协议测试。

当前交付定位是“可配置、可编排、可模拟的驱动控制面”，不是三台物理设备已联通。Web 服务不加载用户可执行代码，也没有物理 `start` 端点；真实执行必须在设备侧 Edge Agent、持久化命令账本和台架验收完成后开放。

| # | 验收项 | 结果 |
| --- | --- | --- |
| 1 | 统一 Manifest | `biomapos.driver/v1` 校验 driver/version/runtime/connection/action/reliability/documentation |
| 2 | 不可变版本 | 自定义版本支持校验、保存草稿、发布和停用；同 key/version 不可覆盖 |
| 3 | 设备绑定 | 设备详情可选驱动版本、模式和动态连接字段；凭据仅允许受限 `secret://` 引用 |
| 4 | Secret 安全 | 拒绝未知连接字段和 password/token/secret 等键；普通用户 DTO 与审计 before/after 均脱敏 |
| 5 | 状态边界 | `simulation_ready` 与真实 `ready` 分离；Edge 未收到心跳时保持 `offline` |
| 6 | BioFlow 集成 | 已发布动作动态进入节点库；节点保存时校验版本、动作、参数、绑定版本与就绪模式 |
| 7 | 旧节点稳定性 | 沿用 `(workflowId,nodeKey)` 原位更新；停用版本仍可解析旧节点，但不能新增或重新绑定 |
| 8 | Hamilton | Windows x86 COM/ActiveX 边界、Executor/Run Control 状态、GUID 和禁止自动重试策略已编码 |
| 9 | CytoControl | RS-232 CR 帧、电报 XOR、状态位、`ch:ds` 轮询和运动对账策略已编码；温控需回读完成 |
| 10 | Octet | TCP/Serial CRLF、参数引用、状态解析已编码；缺失 Run switch 使实机 Run 机器级锁为 simulation-only |
| 11 | 型号 Profile | Cyto TFS2/培养箱和 Octet 384/HTX 的动作约束在服务端保存时再次校验 |
| 12 | 演示数据 | 三台设备均绑定 simulation 驱动；建立“多厂商设备驱动联调演示”7 节点、6 连线流程 |
| 13 | 双语 | 驱动中心、绑定卡片、动态节点和安全提示均接入中英文词典 |

## 自动化与实库验证

- `npm run verify`：ESLint 通过；16 个测试文件、174 项测试全部通过；TypeScript、Vite 与 esbuild 构建成功。
- 驱动专项：4 个测试文件、121 项测试通过，其中厂家协议纯函数 111 项，Manifest/安全边界 10 项。
- `npm audit --omit=dev --audit-level=high`：0 个已知漏洞。
- Drizzle：新增 `0008_curly_shocker.sql` 与 `0009_true_grey_gargoyle.sql`，本地 MySQL 迁移成功，共 37 张表。
- 幂等 Seed：复用 Hamilton 设备，新增 Cytomat 与 Octet 演示设备；三个绑定均为 `simulation_ready` 且不含 Secret。
- 浏览器：`/drivers` 显示 3 个内置驱动、8 个 BioFlow 动作和 3 个绑定；自定义 Manifest 模板校验成功。
- 设备页：`/equipment/37` 显示 CytoControl V8 `模拟就绪`，模拟连接测试返回 6 个动作。
- BioFlow：`/workflows/21` 成功加载并保存 7 节点/6 连线；Octet Run 显示“仅允许模拟执行”和“禁止自动重试”，设备下拉明确标识“模拟”。
- 中英文切换：驱动节点目录、参数、重试和仅模拟提示均正常显示。

## 已知边界与下一阶段

- Hamilton 必须在安装 Vector 的 Windows x86 主机部署 Edge Agent，并按实际 Type Library 确认 `SetInput` 签名。
- CytoControl 需要现场确认具体型号、库位、选件、第二传递站和串口链路。
- Octet 厂家资料尚缺 `Run/GetMethodInfo/GetRunInfo` 准确 switch、RS-232 参数和结果格式，因此真实 Run 保持禁用。
- 生产执行层仍需实现持久化 command/run ledger、每设备租约锁、Edge 心跳、事务 outbox、制品哈希和人工恢复入口。
