# BioMapOS 设备驱动框架 v1

## 当前交付范围

本版本先完成设备驱动的“控制面”：厂家协议被统一成 Manifest、版本、设备绑定和 BioFlow 节点。系统可以识别驱动、校验参数、发布不可变版本、绑定设备，并根据已发布动作动态生成可拖拽节点。

物理 I/O 不在 BioMapOS Web 服务进程中执行。真实设备控制必须由部署在设备侧的 Edge Agent 加载厂家 SDK/串口/TCP 适配器后完成。本版本中的三台演示设备均为 `simulation`，不会发送物理命令。

## 统一模型

```text
Driver Manifest（能力与参数）
        ↓ 发布不可变版本
Equipment Binding（设备实例、连接配置、Secret 引用）
        ↓ 通过连接测试
BioFlow Node（driver + version + action + params + equipmentId）
        ↓ 后续运行期
Edge Agent Adapter（厂家 SDK / COM / Serial / TCP）
        ↓
Physical Device + Raw Artifacts
```

驱动版本由 `driverKey@version` 唯一标识；BioFlow 模板键固定为：

```text
drv:<driverKey>:<version>:<actionKey>
```

已发布版本不可原地覆盖。新能力或协议变更必须发布新版本，旧流程仍能解析原来的节点。

## Manifest 最小结构

驱动作者从驱动中心下载或复制模板，填写连接字段和动作字段。Manifest 只描述能力，不包含密码，也不执行任意代码。

```json
{
  "apiVersion": "biomapos.driver/v1",
  "driverKey": "custom-reader",
  "version": "0.1.0",
  "name": "自定义读板机驱动",
  "vendor": "Vendor",
  "description": "由实验室 Edge Agent 执行的读板机驱动",
  "maturity": "bench-pending",
  "runtime": {
    "kind": "custom-edge",
    "platform": "cross-platform",
    "transports": ["tcp"],
    "singleton": true,
    "requires": ["厂家 Automation 接口已启用"]
  },
  "connectionFields": [
    { "key": "host", "label": "主机", "type": "text", "required": true },
    { "key": "port", "label": "端口", "type": "number", "required": true, "min": 1, "max": 65535 }
  ],
  "actions": [
    {
      "key": "status",
      "label": "读取状态",
      "description": "只读健康检查",
      "capability": "device.status.read",
      "kind": "query",
      "risk": "read",
      "exposeAsNode": false,
      "fields": [],
      "completion": "immediate",
      "retry": "safe",
      "constraints": []
    },
    {
      "key": "run",
      "label": "执行方法",
      "description": "运行一个受控方法文件",
      "capability": "reader.method.run",
      "kind": "run",
      "risk": "operate",
      "exposeAsNode": true,
      "fields": [
        { "key": "method-ref", "label": "方法制品引用", "type": "path", "required": true }
      ],
      "completion": "poll",
      "retry": "never-auto",
      "constraints": ["启动结果不确定时必须先对账"]
    }
  ],
  "healthProbeAction": "status",
  "reliability": {
    "acceptanceIsCompletion": false,
    "commandIdSupported": false,
    "uncertainStartPolicy": "reconcile",
    "serialization": "per-equipment"
  },
  "documentation": {
    "title": "Vendor Automation API",
    "pages": "1-20",
    "verified": false,
    "gaps": ["等待真机验收"]
  }
}
```

## Edge Adapter 生命周期

适配器实现 `BioMapDeviceDriver`，统一提供：

1. `probe` / `testConnection`：只读探测与连接验证。
2. `validateRun`：校验参数、方法制品、设备状态和安全前提。
3. `prepare`：规范化输入并生成可审计证据，不能启动设备。
4. `start`：只执行一次物理启动；超时不能盲目重发。
5. `getStatus`：把厂家状态映射为统一状态机。
6. `cancel`：执行厂家允许的受控停止。
7. `reconcile`：在断线或不确定启动后查询设备真实状态。
8. `collectArtifacts`：返回原始数据、日志、校验和与 URI。

统一执行状态定义在 `contracts/deviceDriver.ts`，包括 `queued`、`preparing`、`running`、`waiting`、`succeeded`、`failed` 和 `unknown`。`unknown` 必须经过对账或人工确认，不能直接重试有物理副作用的命令。

## 三个厂家适配边界

### Hamilton Vector

- 实际控制面是本机 Windows x86 COM/ActiveX，不是远程 HTTP API。
- Edge Agent 必须部署在安装 Vector 的 Windows 主机，优先包装 Executor 接口。
- 方法 `Run` 不可自动重试；需使用事件和运行日志完成状态对账。
- 文档里的 `SetInput` 参数数量与示例不一致，必须以现场 Type Library 为准。

### CytoControl V8

- 使用 9600/8N1、无流控、CR 结尾的区分大小写 RS-232 ASCII 协议。
- `ok xx` 只表示命令已接受；运动完成必须轮询 `ch:ds`。
- 不可用 `ch:bs` 做主轮询，因为它会清除 Ready 位。
- 搬运动作无命令 ID，超时或断连后先核对库位、TFS 和条码，禁止盲目重发。

### Octet Data Acquisition

- 支持 TCP socket 或 RS-232；报文为 ASCII 单行并以 CRLF 结束。
- `OK` 只表示当前状态，完成判定必须先观察 `Busy/Waiting`，再观察 `OK`。
- 运行结束后用 `GetRunInfo` 对账并采集结果文件。
- 当前资料缺少 `Run/GetMethodInfo/GetRunInfo` 的准确 switch 语法，因此真机 `Run` 必须保持禁用，直到厂家补齐协议头文件或完成台架抓包验证。

## 驱动接入与验收

1. 在“驱动中心”用模板创建 Manifest，校验并保存草稿。
2. 代码评审 Edge Adapter，确认无任意 URL、任意命令或明文 Secret。
3. 在厂家模拟器验证帧、状态映射、超时和错误处理。
4. 在隔离台架验证只读探测，再逐项开放有副作用动作。
5. 保存验收证据：设备型号/序列号、软件版本、连接参数、原始报文、结果文件哈希。
6. 将 Manifest 标记为硬件已验证并发布新版本。
7. 在设备详情绑定版本并通过连接测试；BioFlow 随后只展示兼容且已就绪的设备。

## 安全规则

- Web 服务不加载用户上传的可执行代码。
- 密码和令牌不进入 Manifest 或连接 JSON；数据库只保存 Secret 引用。
- 物理动作按设备串行执行，运行期必须使用命令账本和幂等键。
- 所有启动、停止、恢复、状态变化和制品采集必须写审计记录。
- 厂家“命令已接受”不等于“动作已完成”；完成条件必须在 Manifest 和 Adapter 中同时实现。
