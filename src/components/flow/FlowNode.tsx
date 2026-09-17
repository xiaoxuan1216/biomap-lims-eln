import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useNavigate } from "react-router";
import { Hand, Cog, GitBranch, Database, User, MonitorCog, Clock, Workflow, Handshake } from "lucide-react";
import {
  FLOW_NODE_TYPES,
  FLOW_NODE_STATUS,
  nodeParamSummary,
  type FlowNodeType,
  type FlowNodeStatus,
  type NodeParams,
} from "@contracts/workflow";
import { useI18n } from "@/i18n";

export type FlowNodeData = {
  label: string;
  nodeType: FlowNodeType;
  templateKey?: string | null;
  owner?: string | null;
  equipmentId?: number | null;
  equipmentName?: string | null;
  externalOrderItemId?: number | null;
  externalOrder?: {
    itemId: number;
    itemName: string;
    itemStatus?: string | null;
    orderId: number;
    orderNo: string;
    orderTitle?: string | null;
    expectedDeliveryDate?: string | null;
    providerName?: string | null;
  } | null;
  config?: string | null;
  params?: NodeParams | null;
  status: FlowNodeStatus;
  dbId?: number;
  /** 子流程挂接：存在时节点可下钻到物理执行层子 DAG */
  childWorkflowId?: number | null;
  subflowName?: string | null;
  subflowProgress?: string | null;
  /** Display-only workflow planning summary; excluded from saveGraph payloads. */
  platePlan?: { version: number; sampleCount: number };
};

export type RFNode = Node<FlowNodeData, "flowNode">;

const TYPE_ICONS = {
  manual: Hand,
  equipment: Cog,
  decision: GitBranch,
  data: Database,
  timer: Clock,
  external: Handshake,
} as const;

export default function FlowNode({ data, selected }: NodeProps<RFNode>) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const meta = FLOW_NODE_TYPES[data.nodeType];
  const st = FLOW_NODE_STATUS[data.status] ?? FLOW_NODE_STATUS.pending;
  const Icon = TYPE_ICONS[data.nodeType];
  const isDecision = data.nodeType === "decision";

  return (
    <div
      className={`relative w-[230px] rounded-xl border-2 bg-white shadow-sm transition-shadow ${
        selected ? "shadow-md" : ""
      }`}
      style={{ borderColor: selected ? meta.color : "#e2e8f0" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white"
        style={{ background: meta.color }}
      />
      {/* 头部：类型图标 + 类型名 + 状态点 */}
      <div className="flex items-center gap-2 rounded-t-[10px] px-3 py-2" style={{ background: meta.bg }}>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md text-white"
          style={{ background: meta.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
          {t(meta.label)}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${data.status === "in_progress" ? "animate-pulse" : ""}`}
            style={{ background: st.color }}
          />
          {t(st.label)}
        </span>
      </div>
      {/* 主体 */}
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-semibold leading-snug text-slate-800">{data.label}</div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
          <User className="h-3 w-3 shrink-0" />
          {data.owner ? (
            <span className="font-medium text-slate-600">{data.owner}</span>
          ) : (
            <span className="italic text-slate-400">{t("未分配负责人")}</span>
          )}
        </div>
        {data.equipmentName && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-indigo-600">
            <MonitorCog className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.equipmentName}</span>
          </div>
        )}
        {data.platePlan && <div className="mt-1.5 rounded border border-teal-100 bg-teal-50 px-2 py-1 text-[10px] text-teal-700">{t("孔板与样本")} · {t("{n} 样本", { n: data.platePlan.sampleCount })} · V{data.platePlan.version}</div>}
        {data.externalOrder && (
          <button
            className="nodrag mt-1.5 flex w-full items-start gap-1 rounded-md bg-pink-50 px-2 py-1.5 text-left text-[10px] text-pink-700 hover:bg-pink-100"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/external-orders/${data.externalOrder!.orderId}`);
            }}
          >
            <Handshake className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{data.externalOrder.orderNo} · {data.externalOrder.providerName}</span>
              <span className="block truncate text-pink-600/80">{data.externalOrder.itemName}</span>
            </span>
          </button>
        )}
        {(() => {
          const summary = nodeParamSummary(data.nodeType, data.templateKey, data.params, t);
          return summary ? (
            <div
              className="mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: meta.bg, color: meta.color }}
            >
              {summary}
            </div>
          ) : null;
        })()}
      </div>
      {/* 子流程入口：点击穿透到物理执行层子 DAG */}
      {data.childWorkflowId && (
        <button
          className="nodrag flex w-full items-center gap-1.5 rounded-b-[10px] border-t border-teal-100 bg-teal-50/80 px-3 py-1.5 text-left text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/workflows/${data.childWorkflowId}`);
          }}
          title={t("穿透到物理执行层子流程")}
        >
          <Workflow className="h-3 w-3 shrink-0" />
          <span className="truncate">{t("子流程")}{data.subflowName ? ` · ${data.subflowName}` : ""}</span>
          <span className="ml-auto shrink-0 font-normal text-teal-500">{data.subflowProgress ?? ""} ▸</span>
        </button>
      )}
      {/* 输出手柄：判断节点分「是 / 否」两路 */}
      {isDecision ? (
        <>
          <Handle
            type="source"
            id="yes"
            position={Position.Right}
            style={{ top: "46%", background: "#10b981" }}
            className="!h-2.5 !w-2.5 !border-2 !border-white"
          />
          <span className="absolute -right-1 top-[46%] -translate-y-1/2 translate-x-full rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">
            {t("是")}
          </span>
          <Handle
            type="source"
            id="no"
            position={Position.Right}
            style={{ top: "78%", background: "#f43f5e" }}
            className="!h-2.5 !w-2.5 !border-2 !border-white"
          />
          <span className="absolute -right-1 top-[78%] -translate-y-1/2 translate-x-full rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700">
            {t("否")}
          </span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-white"
          style={{ background: meta.color }}
        />
      )}
    </div>
  );
}
