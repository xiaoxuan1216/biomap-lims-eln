/** BioView workflow authoring and frozen Run runtime. */
export const bioViewEn: Record<string, string> = {
  实验视图: "Experiment View",
  实验呈现: "Experiment Presentation",
  方法内嵌实验视图: "Method-embedded Experiment View",
  分子克隆孔板联动: "Molecular Cloning Plate Linkage",
  与本次运行联动: "Linked to This Run",
  "BioView 实验视图": "BioView Experiment Views",
  "查看 BioView": "View BioView",
  "BioView 自动生成预览": "BioView Auto-generated Preview",
  "BioView 清单不可解析": "BioView Manifest Cannot Be Parsed",
  "BioView Blueprint 已保存": "BioView Blueprint saved",
  实验呈现规则已保存: "Experiment presentation rules saved",
  "BioView 生成方式": "BioView Generation",
  "BioView 与布局": "BioView & Layout",
  "Run 冻结视图": "Frozen Run View",
  "历史 Run 兼容视图": "Legacy Run Compatibility View",
  模板实时预览: "Live Template Preview",
  本次实验计划预览: "This Run Plan Preview",
  预览本次实验视图: "Preview This Run's Experiment View",
  计划步骤: "Planned Step",
  模板视图: "Template View",
  "未命名 BioFlow": "Untitled BioFlow",
  可视化就绪度: "Visualization Readiness",
  自动降级: "Automatic Fallback",
  "Run 快照内未记录视图摘要": "No view digest recorded in the Run snapshot",
  "使用当前 BioFlow 数据生成预览":
    "Preview generated from the current BioFlow data",
  来源方法: "Source method",
  查看来源方法: "View Source Method",
  "{n} 个 LIMS 资源对象": "{n} LIMS resource objects",
  "{n} 个设备节点": "{n} equipment nodes",
  查看绑定设备: "View bound equipment",
  "BioView 实验视图变更": "BioView experiment view changed",
  配置实验视图: "Configure experiment views",
  当前修改属于方法工作副本: "Current changes belong to the method working copy",
  "保存 BioView 不会改变已发布方法或历史 Run。提交复核并发布新版本后，新实验才会使用这套视图。":
    "Saving BioView does not change published methods or historical Runs. New experiments use the view only after a new version is reviewed and published.",

  通用实验总览: "Generic Experiment Overview",
  分子克隆孔板流: "Molecular Cloning Plate Flow",
  通用孔板与样本布局: "Generic Plate and Sample Layout",
  "LIMS 数据与证据链": "LIMS Data and Evidence Chain",
  样本与流程谱系: "Sample and Workflow Lineage",
  节点时间线: "Node Timeline",
  样本与对照: "Samples and Controls",
  试剂与物料: "Reagents and Materials",
  运行参数摘要: "Run Parameter Summary",
  流程数据流: "Workflow Data Flow",
  通用节点: "Generic Node",
  已编译: "Compiled",
  实验总览: "Experiment Overview",
  执行时间线: "Execution Timeline",
  物料: "Materials",

  "已忽略损坏配置并切换到通用视图；流程、样本、物料和参数仍可查看。":
    "The damaged configuration was ignored and the generic view was activated; workflow, samples, materials, and parameters remain available.",
  实验视图配置不可解析: "Experiment View Configuration Cannot Be Parsed",
  "正在使用 BioFlow 实时预览": "Using the Live BioFlow Preview",
  "历史 Run 未冻结 BioView 清单":
    "Historical Run Has No Frozen BioView Manifest",
  "历史 Run 未冻结实验视图":
    "Historical Run Has No Frozen Experiment View",
  "当前仅将该 Run 的冻结流程、资源与权威 LIMS 证据投影为兼容视图；不会读取当前模板补写历史快照。":
    "Only this Run's frozen workflow, resources, and authoritative LIMS evidence are projected into a compatibility view; the current template is never used to backfill the historical snapshot.",
  "保存视图配置后，Run 实例化时会冻结同一套渲染规则与数据绑定。":
    "Once the view configuration is saved, Run instantiation freezes the same rendering rules and data bindings.",
  存在未注册的视图组件: "Unregistered View Components Detected",
  "以下引用不会执行，系统已使用受控组件继续渲染：{refs}":
    "The following references will not execute. Rendering continues with controlled components: {refs}",
  分子克隆视图已安全降级: "Molecular Cloning View Safely Degraded",
  视图组件渲染失败: "View Component Rendering Failed",
  "该组件收到无效数据，已停止渲染；其他 BioView 组件不受影响。":
    "This component received invalid data and stopped rendering; other BioView components are unaffected.",
  "该组件收到无效数据，已停止渲染；其他实验视图不受影响。":
    "This component received invalid data and stopped rendering; other experiment views are unaffected.",
  "当前快照缺少有效孔板规划；系统不会伪造孔位，已改用通用实验视图。":
    "The snapshot lacks a valid plate plan. No well positions were invented; the generic experiment view is shown instead.",

  "由 BioFlow 节点与连线生成；未知领域也保留完整流程骨架。":
    "Generated from BioFlow nodes and edges; the complete workflow skeleton remains available for unknown domains.",
  "已解析 {nodes} 个节点和 {edges} 条连接。":
    "Parsed {nodes} nodes and {edges} connections.",
  "暂无可展示的流程节点；保存 BioFlow 后会在这里生成流程视图。":
    "No workflow nodes to display. Save BioFlow to generate the workflow view here.",
  "类型 / 角色": "Type / Role",
  "节点 / 位置": "Node / Position",
  计划用量: "Planned Amount",
  "显示本次实例化绑定的样本、对照及其节点归属。":
    "Shows samples and controls bound to this instance and their assigned nodes.",
  "模板预览尚未绑定真实样本；Run 实例化后将在这里显示。":
    "The template preview has no real samples yet; they will appear after Run instantiation.",
  "展示运行快照中的物料角色、用量和节点绑定。":
    "Shows material roles, quantities, and node bindings from the Run snapshot.",
  "当前视图没有已绑定的试剂或物料。":
    "No reagents or materials are bound to this view.",
  "只读取模板或 Run 快照中的参数值，不执行参数中的任何代码。":
    "Reads parameter values from the template or Run snapshot only; no code in parameters is executed.",
  作用域: "Scope",
  冻结值: "Frozen Value",
  "暂无参数快照；设备与节点参数配置后会自动汇总。":
    "No parameter snapshot yet. Device and node parameters will be summarized automatically once configured.",
  "按照 BioFlow 依赖顺序生成；Run 状态作为只读叠加层。":
    "Generated in BioFlow dependency order, with Run status applied as a read-only overlay.",
  "暂无节点时间线。": "No node timeline available.",
  "使用稳定对象标识和节点关联展示数据流转，不推断未记录的实验结果。":
    "Shows data movement using stable object identifiers and node links without inferring unrecorded results.",
  流程级绑定: "Workflow-level Binding",
  "模板预览仅展示谱系结构；绑定样本后会显示稳定对象标识。":
    "The template preview shows lineage structure only; stable object identifiers appear after samples are bound.",
  流程节点: "Workflow Nodes",
  "样本 / 对照": "Samples / Controls",
  "试剂 / 物料": "Reagents / Materials",
  参数项: "Parameters",
  编码: "Code",

  "同一份视图配置将在 Run 实例化时绑定真实样本、物料和设备参数。":
    "The same view configuration binds real samples, materials, and device parameters when the Run is instantiated.",
  "已匹配 {n} 个受控组件": "Matched {n} controlled components",
  "已解析 {n} 个 BioFlow 节点": "Parsed {n} BioFlow nodes",
  "请先添加并保存 BioFlow 节点": "Add and save BioFlow nodes first",
  "视图引用均来自受控 Renderer Registry":
    "All view references come from the controlled Renderer Registry",
  "{n} 个视图引用未注册，将被安全忽略":
    "{n} view references are unregistered and will be safely ignored",
  "已绑定领域包：{pack}": "Domain pack bound: {pack}",
  "未绑定领域包，使用通用语义视图":
    "No domain pack bound; using generic semantic views",
  分子克隆孔板规划可用: "Molecular cloning plate plan available",
  "缺少孔板规划，运行时将降级而不伪造孔位":
    "Plate plan missing; runtime will fall back without inventing well positions",
  当前视图不要求专用孔板规划:
    "The current view does not require a dedicated plate plan",

  实验视图引擎: "Experiment View Engine",
  高级呈现规则: "Advanced Presentation Rules",
  收起高级呈现规则: "Hide Advanced Presentation Rules",
  保存呈现规则: "Save Presentation Rules",
  自动生成的视图: "Auto-generated Views",
  已启用视图: "Enabled Views",
  视图配置未保存: "Unsaved view configuration",
  "在 BioFlow 模板中定义领域包、语义绑定和受控视图。发起 Run 时，系统会把它与当次样本、物料和设备参数一起冻结。":
    "Define domain packs, semantic bindings, and controlled views in the BioFlow template. When a Run is launched, they are frozen with that Run's samples, materials, and device parameters.",
  "系统根据 BioFlow 步骤自动生成实验视图；发起 Run 时，再与本次样本、物料、孔板和设备参数绑定并冻结。":
    "The system generates experiment views from BioFlow steps, then binds and freezes them with this Run's samples, materials, plate layouts, and device parameters.",
  返回流程图: "Back to Workflow",
  恢复自动生成: "Restore Auto-generation",
  "保存 BioView": "Save BioView",
  "当前 BioFlow 尚未保存": "Current BioFlow Has Unsaved Changes",
  "预览会跟随当前画布，但只有先保存流程图，才能将这些节点的 BioView 语义绑定持久化。":
    "The preview follows the current canvas, but BioView semantic bindings can only be persisted after the workflow is saved.",
  "预览会跟随当前画布，但只有先保存流程图，才能将节点的实验语义与呈现规则持久化。":
    "The preview follows the current canvas; save the workflow before persisting experiment semantics and presentation rules.",
  "保存呈现规则不会改变已发布方法或历史 Run。提交复核并发布新版本后，新实验才会使用这套视图。":
    "Saving presentation rules does not change published methods or historical Runs. New experiments use the view after a new version is reviewed and published.",
  领域与渲染配置: "Domain and Rendering Configuration",
  领域流程包: "Domain Workflow Pack",
  通用实验包: "Generic Lab Pack",
  分子克隆包: "Molecular Cloning Pack",
  "HPLC 分析包": "HPLC Analysis Pack",
  生化检测基础包: "Assay Primitives Pack",
  "领域包定义专业语义与规则；执行、权限、审计和 Run 快照仍复用 LIMS 内核。":
    "Domain packs define professional semantics and rules; execution, authorization, audit, and Run snapshots continue to use the shared LIMS core.",
  受控视图组件: "Controlled View Components",
  分子克隆流程与孔板: "Molecular Cloning Workflow and Plates",
  自动映射节点语义: "Auto-map Node Semantics",
  语义覆盖: "Semantic Coverage",
  "节点 / 连线": "Nodes / Edges",
  "已启用 Renderer": "Enabled Renderers",
  分子克隆布局: "Molecular Cloning Layout",
  已关联: "Linked",
  未关联: "Not linked",
  模板视图就绪: "Template View Ready",
  "运行实例化后将只绑定本次 Run 的真实对象，不改写该 Blueprint。":
    "Run instantiation binds only that Run's real objects and does not modify the Blueprint.",
  "运行实例化后只绑定本次 Run 的真实对象，不改写方法模板。":
    "Run instantiation binds only that Run's real objects and does not modify the method template.",
  仍有节点缺少语义: "Some Nodes Still Lack Semantics",
  "系统会继续生成通用视图，不会因领域信息不完整而显示空白页。":
    "The system will continue to generate generic views and will not show a blank page when domain information is incomplete.",
  "请先保存 BioFlow，再固化 BioView 语义绑定":
    "Save BioFlow before persisting BioView semantic bindings",
  "请先保存 BioFlow，再保存实验呈现规则":
    "Save BioFlow before saving experiment presentation rules",
  "请先保存 BioFlow，再恢复自动视图":
    "Save BioFlow before restoring automatic views",

  "3. 确认 BioView 与实验布局": "3. Confirm BioView and Experiment Layout",
  "3. 确认实验视图与布局": "3. Confirm Experiment View and Layout",
  "确认要随 Run 冻结的 BioView 与实验布局":
    "Confirm the BioView and experiment layout to freeze with the Run",
  确认本次运行的实验视图与布局:
    "Confirm This Run's Experiment View and Layout",
  "BioView 会使用当前 BioFlow 的可视化配置和本次样本、物料、设备参数生成。Run 创建后会冻结视图清单与布局绑定，不会自动跟随模板的后续修改。":
    "BioView is generated from the current BioFlow visualization configuration and this Run's samples, materials, and device parameters. Once created, the Run freezes its view manifest and layout bindings and does not follow later template changes.",
  "系统会根据已发布方法、本次样本与物料、孔板布局及设备参数自动生成实验视图。创建 Run 后将与运行计划一起冻结，不随方法模板后续修改。":
    "The system generates the experiment view from the published method, this Run's samples and materials, plate layout, and device parameters. It is frozen with the Run plan and does not follow later method-template changes.",
  "按 BioFlow 中已保存的 Blueprint 冻结":
    "Freeze from the Blueprint saved in BioFlow",
  按受控通用视图自动生成: "Auto-generate from controlled generic views",
  "不能读取冻结 BioView 快照": "Cannot Read Frozen BioView Snapshot",
  不能读取冻结实验视图: "Cannot Read Frozen Experiment View",
  进入执行详情: "Open Execution Details",
  查看审计摘要: "View Audit Summary",
  "Run 快照完整性校验未通过，系统不会改用当前流程模板重新生成历史视图。":
    "The Run snapshot failed integrity validation. The system will not regenerate a historical view from the current workflow template.",
};
