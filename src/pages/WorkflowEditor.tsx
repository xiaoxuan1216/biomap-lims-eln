import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
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
import FlowNode, { type RFNode, type FlowNodeData } from "@/components/flow/FlowNode";
import {
  NODE_PALETTE,
  FLOW_NODE_TYPES,
  FLOW_NODE_STATUS,
  WORKFLOW_STATUS,
  type NodeTemplate,
  type FlowNodeStatus,
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
  Save,
  Trash2,
  Hand,
  Cog,
  GitBranch,
  Database,
  ChevronDown,
  ChevronRight,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { setCopilotContext } from "@/lib/copilotContext";

const nodeTypes = { flowNode: FlowNode };
const GROUP_ICONS = { manual: Hand, equipment: Cog, decision: GitBranch, data: Database } as const;
const TEAM_SUGGESTIONS = ["演示用户", "张工", "王工", "陈研究员", "赵工"];

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

const uid = () => Math.random().toString(36).slice(2, 10);

function EditorInner({ id }: { id: number }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const rf = useReactFlow();
  const { data: wf } = trpc.workflow.byId.useQuery({ id });
  const { data: equipList } = trpc.equipment.list.useQuery();

  const [nodes, setNodesRaw, onNodesChangeRaw] = useNodesState<RFNode>([]);
  const [edges, setEdgesRaw, onEdgesChangeRaw] = useEdgesState<Edge>([]);
  const [dirty, setDirty] = useState(false);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [wfName, setWfName] = useState("");
  const [wfDesc, setWfDesc] = useState("");
  const [wfStatus, setWfStatus] = useState("draft");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const loadedFor = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const equipName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of equipList ?? []) m.set(e.id, e.name + (e.model ? ` · ${e.model}` : ""));
    return m;
  }, [equipList]);

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

  // 初次加载：DB → 画布
  useEffect(() => {
    if (!wf || loadedFor.current === wf.id) return;
    loadedFor.current = wf.id;
    setWfName(wf.name);
    setWfDesc(wf.description ?? "");
    setWfStatus(wf.status);
    setNodesRaw(
      wf.nodes.map((n) => ({
        id: n.nodeKey,
        type: "flowNode" as const,
        position: { x: n.posX, y: n.posY },
        data: {
          label: n.label,
          nodeType: n.type,
          templateKey: n.templateKey,
          owner: n.owner,
          equipmentId: n.equipmentId,
          config: n.config,
          status: n.status,
          dbId: n.id,
        },
      })),
    );
    setEdgesRaw(
      wf.edges.map((e) => ({
        id: e.edgeKey,
        source: e.sourceKey,
        target: e.targetKey,
        sourceHandle: e.sourceHandle ?? undefined,
        label: e.label ?? undefined,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    );
    setDirty(false);
    // 用已知节点坐标手动计算视口（不依赖节点测量时序）
    if (wf.nodes.length) {
      setTimeout(() => {
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
    }
  }, [wf, setNodesRaw, setEdgesRaw, rf]);

  // 设备名称映射进节点数据
  useEffect(() => {
    setNodesRaw((ns) =>
      ns.map((n) =>
        n.data.equipmentId && !n.data.equipmentName && equipName.has(n.data.equipmentId)
          ? { ...n, data: { ...n.data, equipmentName: equipName.get(n.data.equipmentId) } }
          : n,
      ),
    );
  }, [equipName, setNodesRaw]);

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
            config: tpl.description ?? null,
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
      const raw = e.dataTransfer.getData("application/labnova-node");
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
        toast.error("节点不能连接到自身");
        return;
      }
      if (wouldCycle(edges, conn.source, conn.target)) {
        toast.error("不允许形成循环依赖 —— 流程图必须是有向无环图（DAG）");
        return;
      }
      const src = nodes.find((n) => n.id === conn.source);
      const label =
        src?.data.nodeType === "decision" ? (conn.sourceHandle === "no" ? "否" : "是") : undefined;
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
    [edges, nodes, setEdges],
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

  const updateMut = trpc.workflow.update.useMutation();
  const saveMut = trpc.workflow.saveGraph.useMutation();
  const statusMut = trpc.workflow.updateNodeStatus.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    updateMut.mutate({ id, name: wfName.trim() || "未命名流程", description: wfDesc || null, status: wfStatus as "draft" | "active" | "completed" | "archived" });
    saveMut.mutate(
      {
        id,
        nodes: nodes.map((n) => ({
          nodeKey: n.id,
          type: n.data.nodeType,
          templateKey: n.data.templateKey,
          label: n.data.label,
          owner: n.data.owner,
          equipmentId: n.data.equipmentId,
          config: n.data.config,
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
          toast.success("流程图已保存");
          setDirty(false);
          utils.workflow.byId.invalidate({ id });
          utils.workflow.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;
  const stMeta = WORKFLOW_STATUS[wfStatus] ?? WORKFLOW_STATUS.draft;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {/* 顶栏 */}
      <div className="mb-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回
        </Button>
        <Input
          value={wfName}
          onChange={(e) => {
            setWfName(e.target.value);
            setDirty(true);
          }}
          className="w-72 font-semibold"
        />
        <Select
          value={wfStatus}
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
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge
          variant="outline"
          style={{ color: stMeta.color, borderColor: stMeta.color + "55", background: stMeta.color + "11" }}
        >
          {nodes.length} 节点 · {edges.length} 连线
        </Badge>
        {dirty && <Badge variant="secondary">未保存更改</Badge>}
        <div className="ml-auto">
          <Button className="bg-teal-600 hover:bg-teal-500" onClick={save} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1" /> {saveMut.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 左侧：节点调色板 */}
        <div className="w-60 shrink-0 overflow-y-auto rounded-xl border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">节点组（拖入画布或点击添加）</div>
          {NODE_PALETTE.map((g) => {
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
                  {g.label}
                  <span className="ml-auto text-[10px] font-normal text-slate-400">{g.items.length}</span>
                </button>
                {!isCollapsed &&
                  g.items.map((tpl) => (
                    <div
                      key={tpl.key}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/labnova-node", JSON.stringify(tpl))}
                      onClick={() => addNodeFromTemplate(tpl)}
                      className="ml-4 cursor-grab rounded-md border border-transparent px-2 py-1.5 text-xs text-slate-700 hover:border-slate-200 hover:bg-slate-50 active:cursor-grabbing"
                      title={tpl.description}
                    >
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: meta.color }} />
                      {tpl.label}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        {/* 中间：DAG 画布 */}
        <div ref={canvasRef} className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-slate-50">
          <ReactFlow
            nodes={nodes}
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

        {/* 右侧：属性面板 */}
        <div className="w-72 shrink-0 overflow-y-auto rounded-xl border bg-white p-4">
          {selNode ? (
            <NodeInspector
              node={selNode}
              equipList={equipList ?? []}
              onPatch={(p) => patchNode(selNode.id, p)}
              onDelete={() => deleteNode(selNode.id)}
              onStatus={(s) => {
                patchNode(selNode.id, { status: s });
                if (selNode.data.dbId) statusMut.mutate({ nodeId: selNode.data.dbId, status: s });
              }}
            />
          ) : selEdge ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold">连线属性</div>
              <div className="text-xs text-muted-foreground">
                {nodes.find((n) => n.id === selEdge.source)?.data.label} → {nodes.find((n) => n.id === selEdge.target)?.data.label}
              </div>
              <div className="space-y-1.5">
                <Label>分支 / 条件标签</Label>
                <Input
                  value={typeof selEdge.label === "string" ? selEdge.label : ""}
                  placeholder="例如：是 / 否 / 阳性 / 达标"
                  onChange={(e) =>
                    setEdges((es) => es.map((x) => (x.id === selEdge.id ? { ...x, label: e.target.value || undefined } : x)))
                  }
                />
              </div>
              <Button variant="destructive" size="sm" onClick={() => deleteEdge(selEdge.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> 删除连线
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-semibold">流程信息</div>
              <div className="space-y-1.5">
                <Label>描述</Label>
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
                <div className="text-xs text-muted-foreground">关联项目：{wf.projectName}</div>
              )}
              <div className="border-t pt-3">
                <div className="mb-2 text-xs font-semibold text-slate-500">节点类型图例</div>
                {Object.entries(FLOW_NODE_TYPES).map(([k, v]) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />
                    <span className="font-medium">{v.label}</span>
                    <span className="text-[10px] text-slate-400">{v.description}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 text-xs leading-5 text-slate-500">
                <div className="mb-1 flex items-center gap-1 font-semibold text-slate-600">
                  <Network className="h-3.5 w-3.5" /> 使用提示
                </div>
                · 从左侧拖入或点击节点组添加节点
                <br />· 拖动节点右侧圆点到下一节点连线
                <br />· 判断节点分「是 / 否」两路输出
                <br />· 连线自动校验，禁止形成环（DAG）
                <br />· 点击节点可分配负责人、绑定设备
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 节点属性面板 */
function NodeInspector({
  node,
  equipList,
  onPatch,
  onDelete,
  onStatus,
}: {
  node: RFNode;
  equipList: { id: number; name: string; model: string | null; status: string }[];
  onPatch: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onStatus: (s: FlowNodeStatus) => void;
}) {
  const meta = FLOW_NODE_TYPES[node.data.nodeType];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ background: meta.color }} />
        <span className="text-sm font-semibold">{meta.label}节点</span>
      </div>
      <div className="space-y-1.5">
        <Label>节点名称</Label>
        <Input value={node.data.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>实验负责人</Label>
        <Input
          value={node.data.owner ?? ""}
          placeholder="分配负责人"
          list="team-members"
          onChange={(e) => onPatch({ owner: e.target.value || null })}
        />
        <datalist id="team-members">
          {TEAM_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      {node.data.nodeType === "equipment" && (
        <div className="space-y-1.5">
          <Label>绑定设备</Label>
          <Select
            value={node.data.equipmentId ? String(node.data.equipmentId) : "none"}
            onValueChange={(v) =>
              onPatch(
                v === "none"
                  ? { equipmentId: null, equipmentName: null }
                  : {
                      equipmentId: Number(v),
                      equipmentName:
                        (equipList.find((x) => x.id === Number(v))?.name ?? "") +
                        (equipList.find((x) => x.id === Number(v))?.model
                          ? ` · ${equipList.find((x) => x.id === Number(v))!.model}`
                          : ""),
                    },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不绑定</SelectItem>
              {equipList.map((eq) => (
                <SelectItem key={eq.id} value={String(eq.id)}>
                  {eq.name}
                  {eq.status !== "available" ? "（不可用）" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">绑定后可在设备管理中预约该机时</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>参数 / 说明</Label>
        <Textarea
          value={node.data.config ?? ""}
          rows={3}
          placeholder="例如：50°C 60 min，插入片段:载体 = 3:1"
          onChange={(e) => onPatch({ config: e.target.value || null })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>执行状态</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(FLOW_NODE_STATUS) as FlowNodeStatus[]).map((s) => {
            const sm = FLOW_NODE_STATUS[s];
            const active = node.data.status === s;
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                  active ? "border-transparent text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
                style={active ? { background: sm.color } : { borderColor: "#e2e8f0" }}
              >
                {sm.label}
              </button>
            );
          })}
        </div>
      </div>
      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> 删除节点
      </Button>
    </div>
  );
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  return (
    <ReactFlowProvider>
      <EditorInner id={numId} />
    </ReactFlowProvider>
  );
}
