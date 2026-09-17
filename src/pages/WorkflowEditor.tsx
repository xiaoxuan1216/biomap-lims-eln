import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { trpc } from "@/providers/trpc";
import WorkflowPlateWorkspace, { NodePlatePreview } from "@/features/cloning-planner/WorkflowPlateWorkspace";
import { nodePlateStage, workflowPlateUrl } from "@/features/cloning-planner/workflowPlateContext";
import { cn } from "@/lib/utils";
import FlowNode, { type RFNode, type FlowNodeData } from "@/components/flow/FlowNode";
import {
  NODE_PALETTE,
  FLOW_NODE_TYPES,
  WORKFLOW_STATUS,
  EQUIP_PARAM_SCHEMAS,
  INSTRUMENT_PROFILES,
  TIMER_UNITS,
  type InstrumentProfile,
  type NodeTemplate,
  type FlowNodeStatus,
  type NodeParams,
} from "@contracts/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Clock,
  Save,
  Trash2,
  Hand,
  Cog,
  GitBranch,
  Database,
  ChevronDown,
  ChevronRight,
  Network,
  Workflow,
  FileCode2,
  LayoutGrid,
  ListOrdered,
  Info,
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightOpen,
  PanelRightClose,
  NotebookPen,
  Handshake,
  Cable,
  ShieldCheck,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { setCopilotContext } from "@/lib/copilotContext";
import { useI18n } from "@/i18n";
import type { AppRouter } from "../../api/router";

const nodeTypes = { flowNode: FlowNode };
const GROUP_ICONS = { manual: Hand, equipment: Cog, decision: GitBranch, data: Database, timer: Clock, external: Handshake } as const;
const TEAM_SUGGESTIONS = ["演示用户", "张工", "王工", "陈研究员", "赵工"];
type WorkflowDetail = NonNullable<inferRouterOutputs<AppRouter>["workflow"]["byId"]>;
type DriverNodeEntry = inferRouterOutputs<AppRouter>["driver"]["nodeCatalog"][number];

/** 在既有边上新增 source→target 是否会成环（从 target 沿边 DFS 能否回到 source） */
function wouldCycle(edges: Edge[], source: string, target: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(adj.get(cur) ?? []));
  }
  return false;
}

function parseParams(raw: string | null): NodeParams | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NodeParams;
  } catch {
    return null;
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

function EditorInner({ id, wf }: { id: number; wf: WorkflowDetail }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const rf = useReactFlow();
  const [viewParams, setViewParams] = useSearchParams();
  const [entryNodeKey] = useState(viewParams.get("nodeKey"));
  const plateView = viewParams.get("view") === "plates";
  const [platesVisited, setPlatesVisited] = useState(plateView);
  const platePlans = trpc.cloningLayout.list.useQuery({ workflowId: id });
  const latestPlatePlan = platePlans.data?.[0];
  const viewedPlateId = Number(viewParams.get("planId")) || 0;
  const viewedPlate = trpc.cloningLayout.byId.useQuery({ id: viewedPlateId }, { enabled: viewedPlateId > 0 });
  const activePlatePlan = viewedPlateId
    ? (viewedPlate.data?.workflowId === id ? viewedPlate.data : undefined)
    : latestPlatePlan;
  const hasPlatePlanning = !!latestPlatePlan || wf.nodes.some(n => !!nodePlateStage(n.templateKey));
  const { data: equipList } = trpc.equipment.list.useQuery();
  const { data: driverNodes } = trpc.driver.nodeCatalog.useQuery();
  const { data: externalItems } = trpc.externalOrder.itemOptions.useQuery({
    projectId: wf.projectId ?? undefined,
  });

  const initialNodes = useMemo<RFNode[]>(
    () =>
      wf.nodes.map((n) => ({
        id: n.nodeKey,
        type: "flowNode" as const,
        selected: n.nodeKey === entryNodeKey,
        position: { x: n.posX, y: n.posY },
        data: {
          label: n.label,
          nodeType: n.type,
          templateKey: n.templateKey,
          owner: n.owner,
          equipmentId: n.equipmentId,
          externalOrderItemId: n.externalOrderItemId,
          externalOrder: n.externalOrder,
          config: n.config,
          params: parseParams(n.params),
          status: n.status,
          dbId: n.id,
          childWorkflowId: n.childWorkflowId,
          subflowName: n.childWorkflowId ? (wf.subflows?.[n.childWorkflowId]?.name ?? null) : null,
          subflowProgress: n.childWorkflowId
            ? (() => {
                const subflow = wf.subflows?.[n.childWorkflowId];
                return subflow
                  ? t("{done}/{total}", { done: subflow.doneCount, total: subflow.nodeCount })
                  : null;
              })()
            : null,
        },
      })),
    [t, wf, entryNodeKey],
  );
  const initialEdges = useMemo<Edge[]>(
    () =>
      wf.edges.map((e) => ({
        id: e.edgeKey,
        source: e.sourceKey,
        target: e.targetKey,
        sourceHandle: e.sourceHandle ?? undefined,
        label: e.label ?? undefined,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [wf],
  );

  const [nodes, setNodesRaw, onNodesChangeRaw] = useNodesState<RFNode>(initialNodes);
  const [edges, setEdgesRaw, onEdgesChangeRaw] = useEdgesState<Edge>(initialEdges);
  const [dirty, setDirty] = useState(false);
  const [selNodeId, setSelNodeId] = useState<string | null>(entryNodeKey);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [wfName, setWfName] = useState(wf.name);
  const [wfDesc, setWfDesc] = useState(wf.description ?? "");
  const [wfStatus, setWfStatus] = useState<string>(wf.status);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /* 左右工具栏唤出/隐藏（持久化），让 DAG 画布占满空间 */
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("biomap-flow-left") !== "0");
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem("biomap-flow-right") !== "0");
  const toggleLeft = () =>
    setLeftOpen((v) => {
      localStorage.setItem("biomap-flow-left", v ? "0" : "1");
      return !v;
    });
  const toggleRight = () =>
    setRightOpen((v) => {
      localStorage.setItem("biomap-flow-right", v ? "0" : "1");
      return !v;
    });
  const canvasRef = useRef<HTMLDivElement>(null);

  const equipName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of equipList ?? []) m.set(e.id, e.name + (e.model ? ` · ${e.model}` : ""));
    return m;
  }, [equipList]);

  const paletteGroups = useMemo(() => {
    const published = (driverNodes ?? []).filter((entry) => entry.releaseStatus === "published");
    if (!published.length) return NODE_PALETTE;
    return [
      ...NODE_PALETTE,
      {
        key: "published-drivers",
        label: "已发布设备驱动",
        type: "equipment" as const,
        items: published.map((entry): NodeTemplate => ({
          key: entry.templateKey,
          type: "equipment",
          label: lang === "en" ? (entry.action.labelEn ?? entry.action.label) : entry.action.label,
          description:
            lang === "en"
              ? (entry.action.descriptionEn ?? entry.action.description)
              : entry.action.description,
          driver: {
            driverKey: entry.driverKey,
            driverVersion: entry.driverVersion,
            actionKey: entry.action.key,
            driverName:
              lang === "en" ? (entry.driverNameEn ?? entry.driverName) : entry.driverName,
            vendor: entry.vendor,
            maturity: entry.maturity,
            retry: entry.action.retry,
            fields: entry.action.fields,
            compatibleEquipmentIds: entry.compatibleEquipmentIds,
          },
        })),
      },
    ];
  }, [driverNodes, lang]);

  const setNodes: typeof setNodesRaw = useCallback(
    (v) => {
      setDirty(true);
      setNodesRaw(v);
    },
    [setNodesRaw],
  );
  const setEdges: typeof setEdgesRaw = useCallback(
    (v) => {
      setDirty(true);
      setEdgesRaw(v);
    },
    [setEdgesRaw],
  );

  const openPlates = useCallback((nodeKey?: string) => {
    if (dirty) { toast.error(t("请先保存流程图")); return; }
    setPlatesVisited(true);
    // Query-only navigation keeps the editor and its graph/draft state mounted.
    setViewParams(new URLSearchParams(workflowPlateUrl(id, {
      nodeKey: nodeKey ?? viewParams.get("nodeKey"),
      planId: Number(viewParams.get("planId")) || latestPlatePlan?.id,
    }).split("?")[1]));
  }, [dirty, t, id, latestPlatePlan?.id, setViewParams, viewParams]);

  const showGraph = () => setViewParams(p => { const next = new URLSearchParams(p); next.delete("view"); return next; });
  const displayNodes = useMemo(
    () => nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        equipmentName: node.data.equipmentId ? equipName.get(node.data.equipmentId) : undefined,
        platePlan: activePlatePlan && (nodePlateStage(node.data.templateKey) || activePlatePlan.nodeKey === node.id)
          ? { version: activePlatePlan.version, sampleCount: activePlatePlan.sampleCount } : undefined,
      },
    })),
    [equipName, nodes, activePlatePlan],
  );

  // 用已知节点坐标设置初始视口（不依赖节点测量时序）
  useEffect(() => {
    if (!wf.nodes.length || plateView) return;
    const timer = window.setTimeout(() => {
      const el = canvasRef.current;
      if (!el) return;
      const NODE_W = 230;
      const NODE_H = 130;
      const xs = wf.nodes.map((n) => n.posX);
      const ys = wf.nodes.map((n) => n.posY);
      const minX = Math.min(...xs) - 60;
      const maxX = Math.max(...xs) + NODE_W + 90; // 判断节点右侧有「是/否」标签
      const minY = Math.min(...ys) - 50;
      const maxY = Math.max(...ys) + NODE_H + 50;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const zoom = Math.min(w / (maxX - minX), h / (maxY - minY), 0.9);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      rf.setViewport({ x: w / 2 - cx * zoom, y: h / 2 - cy * zoom, zoom });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [rf, wf, plateView]);

  // Copilot 上下文
  useEffect(() => {
    if (wf) {
      setCopilotContext({ entityType: "workflow", entityId: wf.id, entityName: wf.name });
      return () => setCopilotContext({});
    }
  }, [wf?.id, wf?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<FlowNodeData>) => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );

  const addNodeFromTemplate = useCallback(
    (tpl: NodeTemplate, position?: { x: number; y: number }) => {
      const pos = position ?? { x: 120 + (nodes.length % 6) * 60, y: 120 + (nodes.length % 6) * 50 };
      const nodeId = `n-${uid()}`;
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        {
          id: nodeId,
          type: "flowNode" as const,
          position: pos,
          selected: true,
          data: {
            label: tpl.label,
            nodeType: tpl.type,
            templateKey: tpl.key,
            owner: tpl.defaultOwner ?? null,
            equipmentId: null,
            equipmentName: null,
            externalOrderItemId: null,
            externalOrder: null,
            config: tpl.description ?? null,
            params:
              tpl.driver
                ? Object.fromEntries(
                    tpl.driver.fields
                      .filter((field) => field.default !== undefined)
                      .map((field) => [field.key, field.default!]),
                  )
                : tpl.type === "equipment" && EQUIP_PARAM_SCHEMAS[tpl.key]
                ? Object.fromEntries(
                    EQUIP_PARAM_SCHEMAS[tpl.key].filter((f) => f.default != null).map((f) => [f.key, f.default!]),
                  )
                : tpl.type === "timer"
                  ? tpl.key === "t_scheduled"
                    ? { mode: "scheduled", datetime: "" }
                    : { mode: "delay", value: 16, unit: "h" }
                  : null,
            status: "pending" as FlowNodeStatus,
          },
        },
      ]);
      setSelNodeId(nodeId);
      setSelEdgeId(null);
    },
    [nodes.length, setNodes],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/biomap-node");
      if (!raw) return;
      try {
        const tpl = JSON.parse(raw) as NodeTemplate;
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNodeFromTemplate(tpl, { x: pos.x - 115, y: pos.y - 40 });
      } catch {
        /* ignore */
      }
    },
    [rf, addNodeFromTemplate],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.source === conn.target) {
        toast.error(t("节点不能连接到自身"));
        return;
      }
      if (wouldCycle(edges, conn.source, conn.target)) {
        toast.error(t("不允许形成循环依赖 —— 流程图必须是有向无环图（DAG）"));
        return;
      }
      const src = nodes.find((n) => n.id === conn.source);
      const label =
        src?.data.nodeType === "decision" ? (conn.sourceHandle === "no" ? t("否") : t("是")) : undefined;
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${uid()}`,
            label,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      );
    },
    [edges, nodes, setEdges, t],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelNodeId(null);
    },
    [setNodes, setEdges],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((es) => es.filter((e) => e.id !== edgeId));
      setSelEdgeId(null);
    },
    [setEdges],
  );

  const saveMut = trpc.workflow.saveGraph.useMutation();
  const createSubMut = trpc.workflow.createSubflow.useMutation({
    onError: (e) => toast.error(e.message),
  });

  /** 创建子流程并穿透进入编辑 */
  const createSubflow = (node: RFNode) => {
    if (!node.data.dbId) {
      toast.error(t("请先保存流程，再为节点创建子流程"));
      return;
    }
    createSubMut.mutate(
      { nodeId: node.data.dbId, lang },
      {
        onSuccess: (r) => {
          toast.success(t("子流程已创建"));
          utils.workflow.byId.invalidate({ id });
          utils.workflow.list.invalidate();
          navigate(`/workflows/${r.id}`);
        },
      },
    );
  };

  const save = () => {
    saveMut.mutate(
      {
        id,
        name: wfName.trim() || t("未命名流程"),
        description: wfDesc || null,
        status: wfStatus as "draft" | "active" | "completed" | "archived",
        nodes: nodes.map((n) => ({
          nodeKey: n.id,
          type: n.data.nodeType,
          templateKey: n.data.templateKey,
          label: n.data.label,
          owner: n.data.owner,
          equipmentId: n.data.equipmentId,
          externalOrderItemId: n.data.externalOrderItemId,
          config: n.data.config,
          params:
            n.data.params && Object.keys(n.data.params).length
              ? JSON.stringify(n.data.params)
              : null,
          posX: n.position.x,
          posY: n.position.y,
        })),
        edges: edges.map((e) => ({
          edgeKey: e.id,
          sourceKey: e.source,
          targetKey: e.target,
          sourceHandle: e.sourceHandle,
          label: typeof e.label === "string" ? e.label : null,
        })),
      },
      {
        onSuccess: () => {
          toast.success(t("流程图已保存"));
          setDirty(false);
          utils.workflow.byId.invalidate({ id });
          utils.workflow.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const selNode = displayNodes.find((n) => n.id === selNodeId) ?? null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;
  const stMeta = WORKFLOW_STATUS[wfStatus] ?? WORKFLOW_STATUS.draft;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {/* 顶栏 */}
      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(wf?.parent ? `/workflows/${wf.parent.workflowId}` : "/workflows")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("返回")}
        </Button>
        {wf?.parent && (
          <button
            className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
            onClick={() => navigate(`/workflows/${wf.parent!.workflowId}`)}
            title={t("返回父流程")}
          >
            <Workflow className="h-3 w-3" />
            {t("父流程")}{lang === "en" ? ": " : "："}{wf.parent.workflowName}
            {wf.parent.nodeLabel
              ? lang === "en"
                ? ` / ${t("节点")} "${wf.parent.nodeLabel}"`
                : ` / ${t("节点")}「${wf.parent.nodeLabel}」`
              : ""}
          </button>
        )}
        <Input
          value={wfName}
          disabled={plateView}
          onChange={(e) => {
            setWfName(e.target.value);
            setDirty(true);
          }}
          className="w-72 font-semibold"
        />
        <Select
          value={wfStatus}
          disabled={plateView}
          onValueChange={(v) => {
            setWfStatus(v);
            setDirty(true);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(WORKFLOW_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {t(v.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge
          variant="outline"
          style={{ color: stMeta.color, borderColor: stMeta.color + "55", background: stMeta.color + "11" }}
        >
          {t("{n} 节点 · {m} 连线", { n: nodes.length, m: edges.length })}
        </Badge>
        {dirty && <Badge variant="secondary">{t("未保存更改")}</Badge>}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="border-teal-200 text-teal-700 hover:bg-teal-50"
            disabled={dirty || wfStatus !== "active" || plateView}
            title={dirty ? t("请先保存流程图") : wfStatus !== "active" ? t("请先将流程状态设为进行中") : undefined}
            onClick={() => navigate(`/runs/new?workflowId=${id}`)}
          >
            <PlayCircle className="mr-1 h-4 w-4" /> {t("发起实验")}
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-500" onClick={save} disabled={saveMut.isPending || plateView}>
            <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? t("保存中…") : t("保存")}
          </Button>
        </div>
      </div>

      {(hasPlatePlanning || plateView) && <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-2" role="group" aria-label={t("流程视图")}>
        <Button size="sm" variant={plateView ? "ghost" : "secondary"} aria-pressed={!plateView} onClick={showGraph}><Network className="mr-1 h-4 w-4" />{t("流程图")}</Button>
        <Button size="sm" variant={plateView ? "secondary" : "ghost"} aria-pressed={plateView} onClick={() => openPlates()} disabled={dirty} title={dirty ? t("请先保存流程图") : undefined}><LayoutGrid className="mr-1 h-4 w-4" />{t("孔板与样本")}</Button>
        {activePlatePlan && <span className="ml-auto text-xs text-muted-foreground">{t("已保存排板：{n} 样本 / {p} 板", { n: activePlatePlan.sampleCount, p: activePlatePlan.plateCount })} · V{activePlatePlan.version}</span>}
        {dirty && <span className="text-xs text-amber-700">{t("请先保存流程图")}</span>}
      </div>}
      <div className={cn("min-h-0 flex-1 gap-3", plateView ? "hidden" : "flex")} inert={plateView}>

        {/* 左侧：节点调色板（可隐藏） */}
        {!leftOpen && (
          <button
            onClick={toggleLeft}
            title={t("唤出节点库")}
            className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-xl border bg-white pt-3 text-slate-400 hover:text-teal-600"
          >
            <PanelLeftOpen className="h-4 w-4" />
            <span className="text-[10px] [writing-mode:vertical-rl]">{t("节点库")}</span>
          </button>
        )}
        {leftOpen && (
        <div className="w-60 shrink-0 overflow-y-auto rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{t("节点组（拖入画布或点击添加）")}</span>
            <button onClick={toggleLeft} title={t("隐藏节点库")} className="text-slate-400 hover:text-teal-600">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          {paletteGroups.map((g) => {
            const GIcon = GROUP_ICONS[g.type];
            const meta = FLOW_NODE_TYPES[g.type];
            const isCollapsed = collapsed[g.key];
            return (
              <div key={g.key} className="mb-2">
                <button
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold hover:bg-slate-50"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <GIcon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                  {t(g.label)}
                  <span className="ml-auto text-[10px] font-normal text-slate-400">{g.items.length}</span>
                </button>
                {!isCollapsed &&
                  g.items.map((tpl) => (
                    <div
                      key={tpl.key}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/biomap-node", JSON.stringify(tpl))}
                      onClick={() => addNodeFromTemplate(tpl)}
                      className="ml-4 cursor-grab rounded-md border border-transparent px-2 py-1.5 text-xs text-slate-700 hover:border-slate-200 hover:bg-slate-50 active:cursor-grabbing"
                      title={t(tpl.description ?? "")}
                    >
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: meta.color }} />
                      {t(tpl.label)}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        )}

        {/* 中间：DAG 画布 */}
        <div ref={canvasRef} className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-slate-50">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(cs) => {
              onNodesChangeRaw(cs);
              if (cs.some((c) => c.type === "position" || c.type === "add" || c.type === "remove")) setDirty(true);
            }}
            onEdgesChange={(cs) => {
              onEdgesChangeRaw(cs);
              if (cs.some((c) => c.type === "add" || c.type === "remove")) setDirty(true);
            }}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onSelectionChange={({ nodes: sn, edges: se }) => {
              setSelNodeId(sn[0]?.id ?? null);
              setSelEdgeId(sn.length ? null : (se[0]?.id ?? null));
              if (sn[0] || (!sn.length && se[0])) {
                /* 选中节点/连线时自动唤出右侧属性面板 */
                localStorage.setItem("biomap-flow-right", "1");
                setRightOpen(true);
              }
            }}
            onPaneClick={() => {
              setSelNodeId(null);
              setSelEdgeId(null);
            }}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!h-24 !w-36" nodeColor={(n) => FLOW_NODE_TYPES[(n as RFNode).data?.nodeType ?? "manual"].color} />
          </ReactFlow>
        </div>

        {/* 右侧：属性面板（可隐藏） */}
        {!rightOpen && (
          <button
            onClick={toggleRight}
            title={t("唤出属性面板")}
            className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-xl border bg-white pt-3 text-slate-400 hover:text-teal-600"
          >
            <PanelRightOpen className="h-4 w-4" />
            <span className="text-[10px] [writing-mode:vertical-rl]">{t("属性面板")}</span>
          </button>
        )}
        {rightOpen && (
        <div className="w-72 shrink-0 overflow-y-auto rounded-xl border bg-white p-4">
          <div className="mb-3 flex justify-end">
            <button onClick={toggleRight} title={t("隐藏属性面板")} className="text-slate-400 hover:text-teal-600">
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
          {selNode ? (
            <NodeInspector
              node={selNode}
              equipList={equipList ?? []}
              driverNodes={driverNodes ?? []}
              externalItems={externalItems ?? []}
              workflowId={id}
              platePlanId={activePlatePlan?.id}
              onOpenPlatePlan={() => openPlates(selNode.id)}
              dirty={dirty}
              onPatch={(p) => patchNode(selNode.id, p)}
              onDelete={() => deleteNode(selNode.id)}
              onOpenSubflow={() => navigate(`/workflows/${selNode.data.childWorkflowId}`)}
              onCreateSubflow={() => createSubflow(selNode)}
              creatingSubflow={createSubMut.isPending}
            />
          ) : selEdge ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold">{t("连线属性")}</div>
              <div className="text-xs text-muted-foreground">
                {displayNodes.find((n) => n.id === selEdge.source)?.data.label} → {displayNodes.find((n) => n.id === selEdge.target)?.data.label}
              </div>
              <div className="space-y-1.5">
                <Label>{t("分支 / 条件标签")}</Label>
                <Input
                  value={typeof selEdge.label === "string" ? selEdge.label : ""}
                  placeholder={t("例如：是 / 否 / 阳性 / 达标")}
                  onChange={(e) =>
                    setEdges((es) => es.map((x) => (x.id === selEdge.id ? { ...x, label: e.target.value || undefined } : x)))
                  }
                />
              </div>
              <Button variant="destructive" size="sm" onClick={() => deleteEdge(selEdge.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("删除连线")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-semibold">{t("流程信息")}</div>
              <div className="space-y-1.5">
                <Label>{t("描述")}</Label>
                <Textarea
                  value={wfDesc}
                  rows={3}
                  onChange={(e) => {
                    setWfDesc(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              {wf?.projectName && (
                <div className="text-xs text-muted-foreground">{t("关联项目")}：{wf.projectName}</div>
              )}
              <div className="border-t pt-3">
                <div className="mb-2 text-xs font-semibold text-slate-500">{t("节点类型图例")}</div>
                {Object.entries(FLOW_NODE_TYPES).map(([k, v]) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />
                    <span className="font-medium">{t(v.label)}</span>
                    <span className="text-[10px] text-slate-400">{t(v.description)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 text-xs leading-5 text-slate-500">
                <div className="mb-1 flex items-center gap-1 font-semibold text-slate-600">
                  <Network className="h-3.5 w-3.5" /> {t("使用提示")}
                </div>
                {t("· 从左侧拖入或点击节点组添加节点")}
                <br />{t("· 拖动节点右侧圆点到下一节点连线")}
                <br />{t("· 判断节点分「是 / 否」两路输出")}
                <br />{t("· 连线自动校验，禁止形成环（DAG）")}
                <br />{t("· 点击节点可分配负责人、绑定设备")}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
      {(platesVisited || plateView) && <div className={cn("min-h-0 flex-1 overflow-y-auto", !plateView && "hidden")} inert={!plateView}>
        <WorkflowPlateWorkspace workflow={wf} nodeKey={viewParams.get("nodeKey") ?? undefined} planId={Number(viewParams.get("planId")) || undefined} onShowGraph={showGraph} onVersionSelect={planId => {
          setPlatesVisited(true);
          setViewParams(p => { const next = new URLSearchParams(p); next.set("view", "plates"); next.set("planId", String(planId)); return next; });
        }} />
      </div>}
    </div>
  );
}

/** 时间控制节点参数表单 */
function TimerParams({ node, onPatch }: { node: RFNode; onPatch: (p: Partial<FlowNodeData>) => void }) {
  const { t } = useI18n();
  const params = node.data.params ?? {};
  const mode = (params.mode as string) ?? "delay";
  return (
    <div className="space-y-2">
      <Label>{t("时间模式")}</Label>
      <Select value={mode} onValueChange={(v) => onPatch({ params: { ...params, mode: v } })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="delay">{t("前置完成后延时")}</SelectItem>
          <SelectItem value="scheduled">{t("定点开始")}</SelectItem>
        </SelectContent>
      </Select>
      {mode === "delay" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[11px] text-slate-500">{t("等待时长")}</div>
            <Input
              className="h-8 text-xs"
              type="number"
              value={String(params.value ?? "")}
              onChange={(e) => onPatch({ params: { ...params, value: Number(e.target.value) } })}
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500">{t("单位")}</div>
            <Select
              value={(params.unit as string) ?? "h"}
              onValueChange={(v) => onPatch({ params: { ...params, unit: v } })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIMER_UNITS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {t(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-1 text-[11px] text-slate-500">{t("开始时间")}</div>
          <Input
            className="h-8 text-xs"
            type="datetime-local"
            value={(params.datetime as string) ?? ""}
            onChange={(e) => onPatch({ params: { ...params, datetime: e.target.value } })}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t("前置节点完成后，按此时间设置推进到下一节点（延时 / 定点）")}
      </p>
    </div>
  );
}

/** 节点 ↔ ELN 关联区（手工 / 设备节点）：业务流 → 节点 → ELN 条目 */
function NodeElnSection({ workflowId, nodeKey, dirty }: { workflowId: number; nodeKey: string; dirty: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: elns } = trpc.experiment.forNode.useQuery({ workflowId, nodeKey });
  const createMut = trpc.experiment.createForNode.useMutation({
    onSuccess: (r) => {
      utils.experiment.forNode.invalidate({ workflowId, nodeKey });
      toast.success(t("已创建关联 ELN：{code}", { code: r.code }));
      navigate(`/experiments/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const STATUS_CLS: Record<string, string> = {
    planning: "bg-slate-100 text-slate-600",
    in_progress: "bg-sky-100 text-sky-700",
    completed: "bg-emerald-100 text-emerald-700",
    signed: "bg-violet-100 text-violet-700",
  };
  const STATUS_LABEL: Record<string, string> = {
    planning: "计划中", in_progress: "进行中", completed: "已完成", signed: "已签署",
  };
  return (
    <div className="space-y-1.5 border-t pt-3">
      <Label className="flex items-center gap-1">
        <NotebookPen className="h-3.5 w-3.5 text-teal-600" /> {t("关联 ELN 记录")}
      </Label>
      {elns && elns.length > 0 && (
        <div className="space-y-1">
          {elns.map((e) => (
            <button
              key={e.id}
              onClick={() => navigate(`/experiments/${e.id}`)}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs hover:border-teal-300 hover:bg-teal-50"
            >
              <span className="font-mono text-[10px] text-slate-500">{e.code}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_CLS[e.status] ?? ""}`}>
                {t(STATUS_LABEL[e.status] ?? e.status)}
              </span>
            </button>
          ))}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-full border-teal-200 text-teal-700 hover:bg-teal-50"
        disabled={createMut.isPending}
        onClick={() => {
          if (dirty) {
            toast.warning(t("流程图有未保存更改，请先保存再创建 ELN"));
            return;
          }
          createMut.mutate({ workflowId, nodeKey });
        }}
      >
        <NotebookPen className="h-3.5 w-3.5 mr-1" />
        {createMut.isPending ? t("创建中…") : elns && elns.length > 0 ? t("再建一条 ELN") : t("为本节点创建 ELN")}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        {t("节点的执行过程与原始数据记入 ELN；ELN 详情可回链到本节点")}
      </p>
    </div>
  );
}

/** 节点属性面板 */
function NodeInspector({
  node,
  equipList,
  driverNodes,
  externalItems,
  workflowId,
  dirty,
  onPatch,
  onDelete,
  onOpenSubflow,
  onCreateSubflow,
  creatingSubflow,
  platePlanId,
  onOpenPlatePlan,
}: {
  node: RFNode;
  equipList: { id: number; name: string; model: string | null; status: string }[];
  driverNodes: DriverNodeEntry[];
  externalItems: {
    id: number;
    name: string;
    status: string;
    orderId: number;
    orderNo: string;
    orderTitle: string;
    projectId: number;
    projectName: string | null;
    providerName: string | null;
  }[];
  workflowId: number;
  dirty: boolean;
  onPatch: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onOpenSubflow: () => void;
  onCreateSubflow: () => void;
  creatingSubflow: boolean;
  platePlanId?: number;
  onOpenPlatePlan: () => void;
}) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const meta = FLOW_NODE_TYPES[node.data.nodeType];
  const driverNode = driverNodes.find((entry) => entry.templateKey === node.data.templateKey);
  const compatibleEquipList = driverNode
    ? equipList.filter(
        (item) =>
          driverNode.compatibleEquipmentIds.includes(item.id) || item.id === node.data.equipmentId,
      )
    : equipList;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ background: meta.color }} />
        <span className="text-sm font-semibold">{t("{label}节点", { label: t(meta.label) })}</span>
      </div>
      <div className="space-y-1.5">
        <Label>{t("节点名称")}</Label>
        <Input value={node.data.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </div>
      {(nodePlateStage(node.data.templateKey) || node.data.platePlan) && <NodePlatePreview key={node.id} planId={platePlanId} stageKey={nodePlateStage(node.data.templateKey)} onExpand={onOpenPlatePlan} disabled={dirty} />}
      <div className="space-y-1.5">
        <Label>{t("实验负责人")}</Label>
        <Input
          value={node.data.owner ?? ""}
          placeholder={t("分配负责人")}
          list="team-members"
          onChange={(e) => onPatch({ owner: e.target.value || null })}
        />
        <datalist id="team-members">
          {TEAM_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      {node.data.nodeType === "equipment" && (
        <div className="space-y-1.5">
          <Label>{t("绑定设备")}</Label>
          <Select
            value={node.data.equipmentId ? String(node.data.equipmentId) : "none"}
            onValueChange={(v) =>
              onPatch(
                v === "none"
                  ? { equipmentId: null, equipmentName: null }
                  : {
                      equipmentId: Number(v),
                      equipmentName:
                        (compatibleEquipList.find((x) => x.id === Number(v))?.name ?? "") +
                        (compatibleEquipList.find((x) => x.id === Number(v))?.model
                          ? ` · ${compatibleEquipList.find((x) => x.id === Number(v))!.model}`
                          : ""),
                    },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("不绑定")}</SelectItem>
              {compatibleEquipList.map((eq) => (
                <SelectItem key={eq.id} value={String(eq.id)}>
                  {eq.name}
                  {eq.status !== "available" ? t("（不可用）") : ""}
                  {driverNode?.simulationEquipmentIds.includes(eq.id) ? t("（模拟）") : ""}
                </SelectItem>
              ))}
              {driverNode && compatibleEquipList.length === 0 && (
                <SelectItem value="no-compatible-equipment" disabled>
                  {t("暂无已就绪的兼容设备")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {driverNode
              ? t("这里只显示已绑定该驱动并通过测试的设备")
              : t("绑定后可在设备管理中预约该机时")}
          </p>
        </div>
      )}
      {node.data.nodeType === "external" && (
        <div className="space-y-1.5">
          <Label>{t("关联外部委托明细")}</Label>
          <Select
            value={node.data.externalOrderItemId ? String(node.data.externalOrderItemId) : "none"}
            onValueChange={(value) => {
              if (value === "none") {
                onPatch({ externalOrderItemId: null, externalOrder: null });
                return;
              }
              const item = externalItems.find((option) => option.id === Number(value));
              onPatch({
                externalOrderItemId: Number(value),
                externalOrder: item
                  ? {
                      itemId: item.id,
                      itemName: item.name,
                      itemStatus: item.status,
                      orderId: item.orderId,
                      orderNo: item.orderNo,
                      orderTitle: item.orderTitle,
                      providerName: item.providerName,
                    }
                  : null,
              });
            }}
          >
            <SelectTrigger><SelectValue placeholder={t("选择委托明细")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("暂不关联")}</SelectItem>
              {externalItems.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.orderNo} · {item.providerName ?? "—"} · {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {node.data.externalOrder ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-pink-200 text-pink-700 hover:bg-pink-50"
              onClick={() => navigate(`/external-orders/${node.data.externalOrder!.orderId}`)}
            >
              <Handshake className="mr-1 h-3.5 w-3.5" />
              {t("打开委托单")} · {node.data.externalOrder.orderNo}
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t("先在“外部委托”页面建立委托，再将具体服务项关联到本节点")}
            </p>
          )}
        </div>
      )}
      {node.data.nodeType === "equipment" && driverNode && (
        <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <div className="flex items-start gap-2">
            <Cable className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-indigo-900">
                {lang === "en" ? (driverNode.driverNameEn ?? driverNode.driverName) : driverNode.driverName}
              </div>
              <div className="mt-0.5 text-[10px] text-indigo-600">
                {driverNode.vendor} · v{driverNode.driverVersion} · {driverNode.action.capability}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 border-indigo-200 bg-white text-[9px] text-indigo-700">
              {driverNode.maturity === "verified"
                ? t("已验证")
                : driverNode.maturity === "bench-pending"
                  ? t("待台架验证")
                  : t("模拟器")}
            </Badge>
          </div>
          {driverNode.releaseStatus === "retired" && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              {t("该驱动版本已停用；已有节点可查看，但不能绑定到新设备。")}
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-indigo-700">
            <ShieldCheck className="h-3 w-3" />
            {t("启动重试策略：")}
            {driverNode.action.retry === "safe"
              ? t("可安全重试")
              : driverNode.action.retry === "reconcile-first"
                ? t("先对账再决定")
                : t("禁止自动重试")}
          </div>
          {driverNode.action.executionMode === "simulation-only" && (
            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] text-sky-700">
              {t("厂家协议参数尚未补齐；该动作当前仅允许模拟执行。")}
            </div>
          )}
          {driverNode.action.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-2 border-t border-indigo-100 pt-2">
              {driverNode.action.fields.map((field) => {
                const value = node.data.params?.[field.key] ?? field.default ?? "";
                return (
                  <div key={field.key} className={field.type === "path" || field.type === "text" ? "col-span-2" : ""}>
                    <div className="mb-1 text-[11px] text-slate-600">
                      {lang === "en" ? (field.labelEn ?? field.label) : field.label}
                      {field.required ? " *" : ""}
                      {field.unit ? ` (${field.unit})` : ""}
                    </div>
                    {field.type === "select" || field.type === "boolean" ? (
                      <Select
                        value={String(value)}
                        onValueChange={(next) =>
                          onPatch({
                            params: {
                              ...(node.data.params ?? {}),
                              [field.key]: field.type === "boolean" ? next === "true" : next,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 bg-white text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(field.type === "boolean" ? ["true", "false"] : (field.options ?? [])).map((option) => (
                            <SelectItem key={option} value={option}>
                              {field.type === "boolean" ? (option === "true" ? t("是") : t("否")) : option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 bg-white text-xs"
                        type={field.type === "number" ? "number" : "text"}
                        min={field.min}
                        max={field.max}
                        value={String(value)}
                        onChange={(event) =>
                          onPatch({
                            params: {
                              ...(node.data.params ?? {}),
                              [field.key]:
                                field.type === "number" && event.target.value !== ""
                                  ? Number(event.target.value)
                                  : event.target.value,
                            },
                          })
                        }
                      />
                    )}
                    {(lang === "en" ? field.helpEn : field.help) && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {lang === "en" ? field.helpEn : field.help}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {node.data.nodeType === "equipment" &&
        node.data.templateKey &&
        !driverNode &&
        INSTRUMENT_PROFILES[node.data.templateKey] && (
          <InstrumentCard profile={INSTRUMENT_PROFILES[node.data.templateKey]} />
        )}
      {node.data.nodeType === "equipment" &&
        node.data.templateKey &&
        !driverNode &&
        !INSTRUMENT_PROFILES[node.data.templateKey] &&
        EQUIP_PARAM_SCHEMAS[node.data.templateKey] && (
          <div className="space-y-2">
            <Label>{t("方法 / 参数")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {EQUIP_PARAM_SCHEMAS[node.data.templateKey].map((f) => (
                <div key={f.key} className={f.type === "text" ? "col-span-2" : ""}>
                  <div className="mb-1 text-[11px] text-slate-500">
                    {t(f.label)}
                    {f.unit ? `（${f.unit}）` : ""}
                  </div>
                  {f.type === "select" ? (
                    <Select
                      value={String(node.data.params?.[f.key] ?? f.default ?? "")}
                      onValueChange={(v) => onPatch({ params: { ...(node.data.params ?? {}), [f.key]: v } })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map((o) => (
                          <SelectItem key={o} value={o}>
                            {t(o)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8 text-xs"
                      type={f.type === "number" ? "number" : "text"}
                      value={String(node.data.params?.[f.key] ?? f.default ?? "")}
                      onChange={(e) =>
                        onPatch({
                          params: {
                            ...(node.data.params ?? {}),
                            [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      {node.data.nodeType === "timer" && <TimerParams node={node} onPatch={onPatch} />}
      <div className="space-y-1.5">
        <Label>{t("参数 / 说明")}</Label>
        <Textarea
          value={node.data.config ?? ""}
          rows={3}
          placeholder={t("例如：50°C 60 min，插入片段:载体 = 3:1")}
          onChange={(e) => onPatch({ config: e.target.value || null })}
        />
      </div>
      <div className="rounded-lg border border-dashed bg-slate-50 p-3 text-xs text-muted-foreground">
        {t("这里定义节点配置；执行状态由每一次实验运行独立记录。")}
      </div>
      {/* 关联 ELN：手工 / 设备节点挂接执行记录 */}
      {(node.data.nodeType === "manual" || node.data.nodeType === "equipment") && (
        <NodeElnSection workflowId={workflowId} nodeKey={node.id} dirty={dirty} />
      )}
      {/* 子流程：穿透到物理执行层子 DAG */}
      <div className="space-y-1.5 border-t pt-3">
        <Label className="flex items-center gap-1">
          <Workflow className="h-3.5 w-3.5 text-teal-600" /> {t("子流程（物理执行层）")}
        </Label>
        {node.data.childWorkflowId ? (
          <>
            <Button
              size="sm"
              className="w-full bg-teal-600 hover:bg-teal-500"
              onClick={onOpenSubflow}
            >
              <Workflow className="h-3.5 w-3.5 mr-1" /> {t("打开子流程")}
              {node.data.subflowProgress ? `（${node.data.subflowProgress}）` : ""}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {t("该节点已挂接子流程，可穿透查看实验操作级细节")}
            </p>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={onCreateSubflow}
              disabled={creatingSubflow}
            >
              <Workflow className="h-3.5 w-3.5 mr-1" />
              {creatingSubflow ? t("创建中…") : t("创建子流程")}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {t("为大节点挂接一张物理执行层子 DAG（如分子克隆的 PCR→连接→转化→挑菌→测序→质粒抽提），主流程保持简洁")}
            </p>
          </>
        )}
      </div>
      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("删除节点")}
      </Button>
    </div>
  );
}

/** 具体仪器指令卡：厂商型号 / 方法脚本 / 台面板位 / 运行参数 / 自动步骤 */
function InstrumentCard({ profile }: { profile: InstrumentProfile }) {
  const { t, lang } = useI18n();
  const bi = (b: { zh: string; en: string }) => (lang === "en" ? b.en : b.zh);
  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-[10px] font-bold text-white">
          {profile.vendor.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-sky-900">
            {profile.vendor} {profile.model}
          </div>
          <div className="text-[10px] text-sky-600">{profile.software}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded-md bg-white/80 border border-sky-100 px-2 py-1.5">
        <FileCode2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500">{t("方法脚本文件")}</div>
          <div className="text-[11px] font-mono text-slate-800 truncate">{profile.methodFile}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <LayoutGrid className="h-3 w-3 text-sky-600" /> {t("台面板位 / 上机配置")}
        </div>
        <div className="overflow-hidden rounded-md border border-sky-100 bg-white/80">
          {profile.deckLayout.map((d) => (
            <div key={d.pos} className="grid grid-cols-[44px_1fr] gap-x-2 border-b border-sky-50 px-2 py-1 last:border-0">
              <span className="font-mono text-[10px] font-semibold text-sky-700 pt-px">{d.pos}</span>
              <span className="text-[10px] text-slate-700 leading-snug">
                <b className="font-medium">{bi(d.labware)}</b>
                <span className="text-slate-400"> · </span>
                {bi(d.content)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <Cog className="h-3 w-3 text-sky-600" /> {t("关键运行参数")}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {profile.params.map((p) => (
            <div key={p.label.zh} className="rounded-md border border-sky-100 bg-white/80 px-2 py-1">
              <div className="text-[9px] text-slate-500">{bi(p.label)}</div>
              <div className="text-[10px] font-medium text-slate-800">{p.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <ListOrdered className="h-3 w-3 text-sky-600" /> {t("自动运行步骤")}
        </div>
        <ol className="space-y-1">
          {profile.steps.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-[10px] text-slate-700 leading-snug">
              <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">
                {i + 1}
              </span>
              {bi(s)}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
        <Info className="h-3 w-3 text-amber-600 shrink-0 mt-px" />
        <span className="text-[10px] text-amber-800 leading-snug">{bi(profile.tips)}</span>
      </div>
    </div>
  );
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  return (
    <ReactFlowProvider>
      <WorkflowEditorLoader id={numId} />
    </ReactFlowProvider>
  );
}

function WorkflowEditorLoader({ id }: { id: number }) {
  const { t } = useI18n();
  const { data: wf, error } = trpc.workflow.byId.useQuery({ id });

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {t("流程加载失败")}：{error.message}
      </div>
    );
  }
  if (!wf) {
    return <div className="p-6 text-sm text-muted-foreground">{t("正在加载流程…")}</div>;
  }

  return <EditorInner key={wf.id} id={id} wf={wf} />;
}
