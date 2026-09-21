import { useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Info,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultBioViewVisualizationSpec,
  type BioViewRendererRef,
  type BioViewSemanticBinding,
  type BioViewView,
  type BioViewVisualizationSpec,
} from "@contracts/bioView";
import type { RFNode } from "@/components/flow/FlowNode";
import { BioViewRuntime } from "./index";
import { toast } from "sonner";

const DOMAIN_PACKS = [
  { value: "generic-lab@1.0.0", label: "通用实验包" },
  { value: "molecular-cloning@1.0.0", label: "分子克隆包" },
  { value: "hplc-analysis@1.0.0", label: "HPLC 分析包" },
  { value: "assay-primitives@1.0.0", label: "生化检测基础包" },
] as const;

const VIEW_CATALOG: Record<BioViewRendererRef, BioViewView> = {
  "generic-overview@1": {
    id: "overview",
    title: "实验总览",
    rendererRef: "generic-overview@1",
    scope: "run",
    binding: "workflow",
  },
  "cloning-plate-flow@1": {
    id: "cloning-layout",
    title: "分子克隆流程与孔板",
    rendererRef: "cloning-plate-flow@1",
    scope: "run",
    binding: "cloning-layout",
  },
  "sample-plate-layout@1": {
    id: "sample-plates",
    title: "通用孔板与样本布局",
    rendererRef: "sample-plate-layout@1",
    scope: "run",
    binding: "sample-plates",
  },
  "run-data-flow@1": {
    id: "run-data-flow",
    title: "LIMS 数据与证据链",
    rendererRef: "run-data-flow@1",
    scope: "run",
    binding: "data-flow",
  },
  "sample-lineage@1": {
    id: "lineage",
    title: "样本与流程谱系",
    rendererRef: "sample-lineage@1",
    scope: "run",
    binding: "resources",
  },
  "operation-timeline@1": {
    id: "timeline",
    title: "执行时间线",
    rendererRef: "operation-timeline@1",
    scope: "workflow",
    binding: "events",
  },
  "sample-table@1": {
    id: "samples",
    title: "样本",
    rendererRef: "sample-table@1",
    scope: "run",
    binding: "resources",
  },
  "material-table@1": {
    id: "materials",
    title: "物料",
    rendererRef: "material-table@1",
    scope: "run",
    binding: "resources",
  },
  "parameter-summary@1": {
    id: "parameters",
    title: "设备与参数",
    rendererRef: "parameter-summary@1",
    scope: "run",
    binding: "parameters",
  },
};

const OPTIONAL_RENDERERS: BioViewRendererRef[] = [
  "cloning-plate-flow@1",
  "sample-lineage@1",
  "operation-timeline@1",
];

type WorkflowLike = {
  id: number;
  name: string;
  visualizationSpec: BioViewVisualizationSpec | null;
};

type CloningLayoutSummary = { id: number } | null | undefined;

function semanticRole(
  node: RFNode,
  incoming: number,
  outgoing: number
): BioViewSemanticBinding["semanticRole"] {
  if (node.data.nodeType === "decision") return "decision";
  if (node.data.nodeType === "data") return "measurement";
  if (node.data.nodeType === "external") return "transport";
  if (incoming === 0) return "input";
  if (outgoing === 0) return "output";
  return "process";
}

function automaticBindings(
  nodes: readonly RFNode[],
  edges: readonly Edge[]
): BioViewSemanticBinding[] {
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    if (incoming.has(edge.target))
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    if (outgoing.has(edge.source))
      outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
  }
  return nodes.map(node => ({
    nodeKey: node.id,
    semanticRole: semanticRole(
      node,
      incoming.get(node.id) ?? 0,
      outgoing.get(node.id) ?? 0
    ),
    artifactType: node.data.templateKey
      ? `workflow.${node.data.templateKey}`
      : `workflow.${node.data.nodeType}`,
  }));
}

function initialSpec(
  saved: BioViewVisualizationSpec | null,
  nodes: readonly RFNode[],
  edges: readonly Edge[],
  hasCloningLayout: boolean
): BioViewVisualizationSpec {
  if (saved) return saved;
  const base = defaultBioViewVisualizationSpec();
  return {
    ...base,
    domainPack: hasCloningLayout ? "molecular-cloning@1.0.0" : base.domainPack,
    views: hasCloningLayout
      ? [VIEW_CATALOG["cloning-plate-flow@1"], ...base.views]
      : base.views,
    semanticBindings: automaticBindings(nodes, edges),
  };
}

export default function WorkflowBioViewWorkspace({
  workflow,
  nodes,
  edges,
  cloningLayoutPlan,
  graphDirty,
  expectedGraphHash,
  onGraphHashChange,
  onShowGraph,
}: {
  workflow: WorkflowLike;
  nodes: readonly RFNode[];
  edges: readonly Edge[];
  cloningLayoutPlan?: CloningLayoutSummary;
  graphDirty: boolean;
  expectedGraphHash: string;
  onGraphHashChange: (graphHash: string) => void;
  onShowGraph: () => void;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const fullLayout = trpc.cloningLayout.byId.useQuery(
    { id: cloningLayoutPlan?.id ?? 0 },
    { enabled: !!cloningLayoutPlan?.id }
  );
  const [spec, setSpec] = useState<BioViewVisualizationSpec>(() =>
    initialSpec(workflow.visualizationSpec, nodes, edges, !!cloningLayoutPlan)
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const savedSerialized = JSON.stringify(
    initialSpec(workflow.visualizationSpec, nodes, edges, !!cloningLayoutPlan)
  );
  const currentSerialized = JSON.stringify(spec);
  const configDirty = currentSerialized !== savedSerialized;
  const saveMutation = trpc.workflow.saveVisualizationSpec.useMutation({
    onSuccess: async result => {
      onGraphHashChange(result.graphHash);
      toast.success(t("实验呈现规则已保存"));
      await Promise.all([
        utils.workflow.byId.invalidate({ id: workflow.id }),
        utils.workflow.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const previewNodes = useMemo(
    () =>
      nodes.map(node => ({
        id: node.id,
        nodeKey: node.id,
        label: node.data.label,
        type: node.data.nodeType,
        status: node.data.status,
        templateKey: node.data.templateKey,
        equipmentId: node.data.equipmentId,
        equipmentName: node.data.equipmentName,
        params: node.data.params,
        config: node.data.config,
      })),
    [nodes]
  );
  const selected = new Set(spec.views.map(view => view.rendererRef));
  const semanticCoverage = nodes.length
    ? Math.round(
        (spec.semanticBindings.filter(binding =>
          nodes.some(node => node.id === binding.nodeKey)
        ).length /
          nodes.length) *
          100
      )
    : 0;

  const toggleRenderer = (
    rendererRef: BioViewRendererRef,
    enabled: boolean
  ) => {
    setSpec(current => ({
      ...current,
      views: enabled
        ? [
            ...current.views.filter(view => view.rendererRef !== rendererRef),
            VIEW_CATALOG[rendererRef],
          ]
        : current.views.filter(view => view.rendererRef !== rendererRef),
    }));
  };

  const save = () => {
    if (graphDirty) {
      toast.error(t("请先保存 BioFlow，再保存实验呈现规则"));
      return;
    }
    saveMutation.mutate({
      id: workflow.id,
      expectedGraphHash,
      visualizationSpec: spec,
    });
  };

  const restoreAutomatic = () => {
    if (graphDirty) {
      toast.error(t("请先保存 BioFlow，再恢复自动视图"));
      return;
    }
    saveMutation.mutate(
      { id: workflow.id, expectedGraphHash, visualizationSpec: null },
      {
        onSuccess: () =>
          setSpec(initialSpec(null, nodes, edges, !!cloningLayoutPlan)),
      }
    );
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-teal-200 bg-teal-50 text-teal-700"
            >
              {t("方法内嵌实验视图")}
            </Badge>
            {configDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700"
              >
                {t("视图配置未保存")}
              </Badge>
            )}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{t("实验呈现")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t(
              "系统根据 BioFlow 步骤自动生成实验视图；发起 Run 时，再与本次样本、物料、孔板和设备参数绑定并冻结。"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={showAdvanced ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowAdvanced(current => !current)}
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" />
            {t(showAdvanced ? "收起高级呈现规则" : "高级呈现规则")}
          </Button>
          <Button variant="outline" size="sm" onClick={onShowGraph}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("返回流程图")}
          </Button>
          {showAdvanced && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={restoreAutomatic}
                disabled={saveMutation.isPending || graphDirty}
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                {t("恢复自动生成")}
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-500"
                onClick={save}
                disabled={!configDirty || saveMutation.isPending || graphDirty}
              >
                <Save className="mr-1 h-4 w-4" />
                {saveMutation.isPending ? t("保存中…") : t("保存呈现规则")}
              </Button>
            </>
          )}
        </div>
      </div>

      {graphDirty && (
        <Alert className="border-amber-200 bg-amber-50">
          <CircleAlert className="h-4 w-4 text-amber-700" />
          <AlertTitle>{t("当前 BioFlow 尚未保存")}</AlertTitle>
          <AlertDescription>
            {t(
              "预览会跟随当前画布，但只有先保存流程图，才能将节点的实验语义与呈现规则持久化。"
            )}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-sky-200 bg-sky-50">
        <Info className="h-4 w-4 text-sky-700" />
        <AlertTitle>{t("当前修改属于方法工作副本")}</AlertTitle>
        <AlertDescription>
          {t(
            "保存呈现规则不会改变已发布方法或历史 Run。提交复核并发布新版本后，新实验才会使用这套视图。"
          )}
        </AlertDescription>
      </Alert>

      <div className={showAdvanced ? "grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]" : "grid gap-4"}>
        {showAdvanced && <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("领域与渲染配置")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("领域流程包")}</Label>
                <Select
                  value={spec.domainPack}
                  onValueChange={domainPack =>
                    setSpec(current => ({ ...current, domainPack }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOMAIN_PACKS.map(pack => (
                      <SelectItem key={pack.value} value={pack.value}>
                        {t(pack.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  {t(
                    "领域包定义专业语义与规则；执行、权限、审计和 Run 快照仍复用 LIMS 内核。"
                  )}
                </p>
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label>{t("自动生成的视图")}</Label>
                <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-2.5">
                  <Checkbox checked disabled />
                  <span className="text-xs font-medium">
                    {t("通用实验总览")}
                  </span>
                  <code className="ml-auto text-[9px] text-muted-foreground">
                    generic-overview@1
                  </code>
                </div>
                {OPTIONAL_RENDERERS.map(rendererRef => (
                  <label
                    key={rendererRef}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selected.has(rendererRef)}
                      onCheckedChange={value =>
                        toggleRenderer(rendererRef, value === true)
                      }
                    />
                    <span className="min-w-0 flex-1 text-xs font-medium">
                      {t(VIEW_CATALOG[rendererRef].title)}
                    </span>
                    <code className="max-w-32 truncate text-[9px] text-muted-foreground">
                      {rendererRef}
                    </code>
                  </label>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  setSpec(current => ({
                    ...current,
                    semanticBindings: automaticBindings(nodes, edges),
                  }))
                }
              >
                <Sparkles className="mr-1 h-4 w-4" />
                {t("自动映射节点语义")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("语义覆盖")}</span>
                <strong>{semanticCoverage}%</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("节点 / 连线")}
                </span>
                <strong>
                  {nodes.length} / {edges.length}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("已启用视图")}
                </span>
                <strong>{spec.views.length}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("分子克隆布局")}
                </span>
                <strong>{cloningLayoutPlan ? t("已关联") : t("未关联")}</strong>
              </div>
            </CardContent>
          </Card>

          {semanticCoverage === 100 ? (
            <Alert className="border-teal-200 bg-teal-50">
              <CheckCircle2 className="h-4 w-4 text-teal-700" />
              <AlertTitle>{t("模板视图就绪")}</AlertTitle>
              <AlertDescription>
                {t(
                  "运行实例化后只绑定本次 Run 的真实对象，不改写方法模板。"
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-amber-200 bg-amber-50">
              <CircleAlert className="h-4 w-4 text-amber-700" />
              <AlertTitle>{t("仍有节点缺少语义")}</AlertTitle>
              <AlertDescription>
                {t(
                  "系统会继续生成通用视图，不会因领域信息不完整而显示空白页。"
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>}

        <BioViewRuntime
          manifest={{
            bioView: spec,
            workflow: { id: workflow.id, name: workflow.name },
          }}
          nodes={previewNodes}
          edges={edges}
          cloningPlan={fullLayout.data ?? null}
          mode="design"
          showTechnicalDetails={showAdvanced}
        />
      </div>
    </div>
  );
}
