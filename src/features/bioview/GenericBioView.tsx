import {
  ArrowRight,
  Boxes,
  Clock3,
  FlaskConical,
  GitBranch,
  PackageOpen,
  Settings2,
  TestTubes,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  orderedBioViewNodes,
  type NormalizedBioView,
  type NormalizedBioViewNode,
  type NormalizedBioViewResource,
} from "./model";

interface BioViewRendererProps {
  view: NormalizedBioView;
  title?: string | null;
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (["string", "number", "boolean"].includes(typeof value))
    return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 160
      ? `${serialized.slice(0, 157)}…`
      : serialized;
  } catch {
    return "—";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface ParameterRow {
  id: string;
  scope: string;
  key: string;
  value: unknown;
}

function parameterRows(view: NormalizedBioView): ParameterRow[] {
  const rows: ParameterRow[] = [];
  const add = (scope: string, raw: unknown) => {
    const record = asRecord(raw);
    if (!record) return;
    const effective = asRecord(record.effectiveValues) ?? record;
    for (const [key, value] of Object.entries(effective)) {
      if (
        ["effectiveValues", "units", "overrideReason", "methodRef"].includes(
          key
        )
      )
        continue;
      rows.push({ id: `${scope}:${key}:${rows.length}`, scope, key, value });
    }
    if (typeof record.methodRef === "string" && record.methodRef) {
      rows.push({
        id: `${scope}:methodRef:${rows.length}`,
        scope,
        key: "methodRef",
        value: record.methodRef,
      });
    }
    if (typeof record.overrideReason === "string" && record.overrideReason) {
      rows.push({
        id: `${scope}:overrideReason:${rows.length}`,
        scope,
        key: "overrideReason",
        value: record.overrideReason,
      });
    }
  };

  add("Run", view.parameters);
  for (const node of view.nodes) add(node.label, node.parameters);
  for (const execution of view.executionNodes) {
    const scope =
      typeof execution.nodeKey === "string" ? execution.nodeKey : "Run";
    add(scope, execution.parameters);
  }
  return rows;
}

function statusClass(status: string | null) {
  if (status === "completed" || status === "done")
    return "border-teal-200 bg-teal-50 text-teal-700";
  if (status === "running" || status === "in_progress")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function nodeStatusLabel(
  status: string | null,
  mode: NormalizedBioView["mode"]
) {
  if (mode === "design") return "方法步骤";
  if (mode === "draft") return "计划步骤";
  const labels: Record<string, string> = {
    pending: "待执行",
    in_progress: "进行中",
    running: "运行中",
    done: "已完成",
    completed: "已完成",
    failed: "异常",
    skipped: "已跳过",
  };
  return status
    ? (labels[status] ?? status)
    : mode === "run"
      ? "待执行"
      : "已编译";
}

function resourceRoleLabel(role: string) {
  const labels: Record<string, string> = {
    sample: "实验样本",
    material: "试剂与物料",
    control: "标准与对照",
  };
  return labels[role] ?? role;
}

function entityPath(kind: "samples" | "equipment", id: string | null) {
  return id && /^\d+$/.test(id) ? `/${kind}/${id}` : null;
}

function RendererCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof GitBranch;
  title: string;
  description: string;
  rendererRef: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0 shadow-none", className)}>
      <CardHeader className="border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-teal-600" />
              <span className="truncate">{title}</span>
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export function BioViewWorkflowMap({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  const nodes = orderedBioViewNodes(view.nodes, view.edges);
  return (
    <RendererCard
      icon={GitBranch}
      title={title ?? t("流程数据流")}
      description={t("由 BioFlow 节点与连线生成；未知领域也保留完整流程骨架。")}
      rendererRef="generic-overview@1"
    >
      {nodes.length > 0 ? (
        <div className="overflow-x-auto p-4">
          <div className="flex min-w-max items-stretch gap-2">
            {nodes.map((node, index) => (
              <div className="flex items-center gap-2" key={node.key}>
                {index > 0 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div className="w-52 rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {node.key}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", statusClass(view.mode === "run" ? node.status : null))}
                    >
                      {t(nodeStatusLabel(node.status, view.mode))}
                    </Badge>
                  </div>
                  <strong
                    className="mt-2 block truncate text-sm"
                    title={node.label}
                  >
                    {node.label}
                  </strong>
                  {entityPath("equipment", node.equipmentId) ? (
                    <Link
                      className="mt-1 block truncate text-[11px] font-medium text-teal-700 hover:underline"
                      to={entityPath("equipment", node.equipmentId)!}
                      title={node.equipmentName ?? undefined}
                    >
                      {node.equipmentName ?? t("查看绑定设备")}
                    </Link>
                  ) : (
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {node.operation ??
                        node.templateKey ??
                        t(node.type ?? "通用节点")}
                    </span>
                  )}
                  {(node.driverKey || node.driverVersion) && (
                    <span className="mt-1 block truncate font-mono text-[9px] text-slate-400">
                      {[node.driverKey, node.driverVersion]
                        .filter(Boolean)
                        .join("@")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("已解析 {nodes} 个节点和 {edges} 条连接。", {
              nodes: view.nodes.length,
              edges: view.edges.length,
            })}
          </p>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("暂无可展示的流程节点；保存 BioFlow 后会在这里生成流程视图。")}
        </div>
      )}
    </RendererCard>
  );
}

function ResourceTable({
  resources,
  emptyText,
}: {
  resources: readonly NormalizedBioViewResource[];
  emptyText: string;
}) {
  const { t } = useI18n();
  if (resources.length === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("编码")}</TableHead>
          <TableHead>{t("名称")}</TableHead>
          <TableHead>{t("类型 / 角色")}</TableHead>
          <TableHead>{t("节点 / 位置")}</TableHead>
          <TableHead className="text-right">{t("计划用量")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.slice(0, 100).map(resource => (
          <TableRow key={resource.id}>
            <TableCell className="font-mono text-xs">
              {entityPath("samples", resource.sampleId) ? (
                <Link
                  className="text-teal-700 hover:underline"
                  to={entityPath("samples", resource.sampleId)!}
                >
                  {resource.sku ?? resource.id}
                </Link>
              ) : (
                (resource.sku ?? resource.id)
              )}
            </TableCell>
            <TableCell
              className="max-w-52 truncate font-medium"
              title={resource.name}
            >
              {entityPath("samples", resource.sampleId) ? (
                <Link
                  className="hover:text-teal-700 hover:underline"
                  to={entityPath("samples", resource.sampleId)!}
                >
                  {resource.name}
                </Link>
              ) : (
                resource.name
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {[resource.type, resource.role]
                .filter(Boolean)
                .map(value =>
                  t(
                    value === resource.role ? resourceRoleLabel(value!) : value!
                  )
                )
                .join(" · ") || "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {[resource.nodeKey, resource.position]
                .filter(Boolean)
                .join(" · ") || "—"}
            </TableCell>
            <TableCell className="text-right text-xs">
              {resource.amount == null
                ? "—"
                : `${resource.amount}${resource.unit ? ` ${resource.unit}` : ""}`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function BioViewSampleTable({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  return (
    <RendererCard
      icon={TestTubes}
      title={title ?? t("样本与对照")}
      description={t("显示本次实例化绑定的样本、对照及其节点归属。")}
      rendererRef="sample-table@1"
    >
      <ResourceTable
        resources={view.samples}
        emptyText={t("模板预览尚未绑定真实样本；Run 实例化后将在这里显示。")}
      />
    </RendererCard>
  );
}

export function BioViewMaterialTable({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  return (
    <RendererCard
      icon={PackageOpen}
      title={title ?? t("试剂与物料")}
      description={t("展示运行快照中的物料角色、用量和节点绑定。")}
      rendererRef="material-table@1"
    >
      <ResourceTable
        resources={view.materials}
        emptyText={t("当前视图没有已绑定的试剂或物料。")}
      />
    </RendererCard>
  );
}

export function BioViewParameterSummary({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  const rows = parameterRows(view);
  return (
    <RendererCard
      icon={Settings2}
      title={title ?? t("运行参数摘要")}
      description={t(
        "只读取模板或 Run 快照中的参数值，不执行参数中的任何代码。"
      )}
      rendererRef="parameter-summary@1"
    >
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("作用域")}</TableHead>
              <TableHead>{t("参数")}</TableHead>
              <TableHead>{t("冻结值")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 120).map(row => (
              <TableRow key={row.id}>
                <TableCell
                  className="max-w-44 truncate text-xs"
                  title={row.scope}
                >
                  {row.scope}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.key}</TableCell>
                <TableCell className="max-w-xl whitespace-normal break-all text-xs text-muted-foreground">
                  {displayValue(row.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("暂无参数快照；设备与节点参数配置后会自动汇总。")}
        </div>
      )}
    </RendererCard>
  );
}

export function BioViewOperationTimeline({
  view,
  title,
}: BioViewRendererProps) {
  const { t } = useI18n();
  const nodes = orderedBioViewNodes(view.nodes, view.edges);
  return (
    <RendererCard
      icon={Clock3}
      title={title ?? t("节点时间线")}
      description={t("按照 BioFlow 依赖顺序生成；Run 状态作为只读叠加层。")}
      rendererRef="operation-timeline@1"
    >
      {nodes.length > 0 ? (
        <ol className="divide-y">
          {nodes.map((node, index) => (
            <li
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
              key={node.key}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{node.label}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {node.key}
                  {node.operation ? ` · ${node.operation}` : ""}
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusClass(view.mode === "run" ? node.status : null))}
              >
                {t(nodeStatusLabel(node.status, view.mode))}
              </Badge>
            </li>
          ))}
        </ol>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("暂无节点时间线。")}
        </div>
      )}
    </RendererCard>
  );
}

function nodeLabel(
  nodeKey: string | null,
  nodes: readonly NormalizedBioViewNode[]
) {
  if (!nodeKey) return null;
  return nodes.find(node => node.key === nodeKey)?.label ?? nodeKey;
}

export function BioViewSampleLineage({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  return (
    <RendererCard
      icon={Boxes}
      title={title ?? t("样本与流程谱系")}
      description={t(
        "使用稳定对象标识和节点关联展示数据流转，不推断未记录的实验结果。"
      )}
      rendererRef="sample-lineage@1"
    >
      {view.samples.length > 0 ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {view.samples.slice(0, 60).map(sample => (
            <div
              className="rounded-xl border bg-background p-3"
              key={sample.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {entityPath("samples", sample.sampleId) ? (
                    <Link
                      className="block hover:underline"
                      to={entityPath("samples", sample.sampleId)!}
                    >
                      <div className="truncate font-mono text-xs text-teal-700">
                        {sample.sku ?? sample.id}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium">
                        {sample.name}
                      </div>
                    </Link>
                  ) : (
                    <>
                      <div className="truncate font-mono text-xs text-teal-700">
                        {sample.sku ?? sample.id}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium">
                        {sample.name}
                      </div>
                    </>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {t(resourceRoleLabel(sample.role ?? "sample"))}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {nodeLabel(sample.nodeKey, view.nodes) ?? t("流程级绑定")}
                </span>
                {sample.position && (
                  <>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <code className="truncate">{sample.position}</code>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("模板预览仅展示谱系结构；绑定样本后会显示稳定对象标识。")}
        </div>
      )}
    </RendererCard>
  );
}

export function BioViewGenericOverview({ view, title }: BioViewRendererProps) {
  const { t } = useI18n();
  const rows = parameterRows(view);
  const metrics = [
    [t("流程节点"), view.nodes.length],
    [t("样本 / 对照"), view.samples.length],
    [t("试剂 / 物料"), view.materials.length],
    [t("参数项"), rows.length],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div className="rounded-xl border bg-card px-4 py-3" key={label}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <strong className="mt-1 block text-2xl">{value}</strong>
          </div>
        ))}
      </div>
      <BioViewWorkflowMap view={view} title={title} />
      <div className="grid gap-4 xl:grid-cols-2">
        <BioViewSampleTable view={view} />
        <BioViewMaterialTable view={view} />
      </div>
      <BioViewParameterSummary view={view} />
    </div>
  );
}
