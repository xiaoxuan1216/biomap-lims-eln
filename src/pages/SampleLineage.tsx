import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowDown,
  Dna,
  TestTubes,
  FlaskConical,
  Boxes,
  GitBranch,
  FileSearch,
  ExternalLink,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { SAMPLE_TYPES, FEATURE_COLORS } from "@/lib/labels";
import { CircularMap, LinearMap } from "@/components/seqmap/PlasmidMap";
import { StructureView } from "@/components/seqmap/StructureView";

/* ── 类型 ── */
interface SeqFeature { name: string; type: string; start: number; end: number; strand: number; color: string; note: string | null }
interface EmbeddedSeq { id: number; name: string; type: string; len: number; pdbId: string | null; description: string | null; text?: string; features?: SeqFeature[] }
interface LineageNode {
  key: string; kind: "sample" | "sequence"; id: number; depth: number;
  name: string; sampleType?: string; sku?: string; quantity?: number; unit?: string;
  seqType?: string; len?: number; pdbId?: string | null; description?: string | null;
  text?: string; features?: SeqFeature[]; sequence?: EmbeddedSeq | null;
}
interface LineageEdge { childKey: string; parentKey: string; relation: string; note: string | null }

const FEATURE_HEX: Record<string, string> = FEATURE_COLORS;

const RELATIONS: Record<string, { zh: string; en: string }> = {
  expressed_from: { zh: "表达自", en: "Expressed from" },
  purified_from: { zh: "纯化自", en: "Purified from" },
  backbone_from: { zh: "载体骨架", en: "Vector backbone" },
  insert_from: { zh: "插入片段", en: "Insert" },
  defined_by: { zh: "分子定义", en: "Defined by" },
  aliquoted_from: { zh: "分装自", en: "Aliquoted from" },
};

/** 序列文本：10 个一组、60 个一行，带位置标尺 */
function SequenceText({ seq }: { seq: string }) {
  const lines: string[] = [];
  for (let i = 0; i < seq.length; i += 60) {
    const chunk = seq.slice(i, i + 60);
    const grouped = chunk.replace(/(.{10})/g, "$1 ").trim();
    lines.push(`${String(i + 1).padStart(6, " ")}  ${grouped}`);
  }
  return (
    <pre className="text-[11px] leading-5 font-mono overflow-x-auto bg-slate-50 rounded-lg p-3 max-h-72 overflow-y-auto whitespace-pre">
      {lines.join("\n")}
    </pre>
  );
}

function FeatureLegend({ features }: { features: SeqFeature[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      {features.map((f, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border"
          style={{ borderColor: FEATURE_HEX[f.color] ?? "#14b8a6", color: FEATURE_HEX[f.color] ?? "#14b8a6" }}
          title={`${f.start}–${f.end}${f.note ? ` · ${f.note}` : ""}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: FEATURE_HEX[f.color] ?? "#14b8a6" }} />
          {t(f.name)}
        </span>
      ))}
    </div>
  );
}

function nodeIcon(n: LineageNode) {
  if (n.kind === "sample") {
    if (n.sampleType === "protein" || n.sampleType === "antibody") return <Boxes className="h-4 w-4" />;
    if (n.sampleType === "cell_line") return <FlaskConical className="h-4 w-4" />;
    return <TestTubes className="h-4 w-4" />;
  }
  if (n.seqType === "protein") return <Boxes className="h-4 w-4" />;
  return <Dna className="h-4 w-4" />;
}

export default function SampleLineage() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sampleId = Number(id);
  const { data, isLoading } = trpc.sample.lineage.useQuery({ id: sampleId, kind: "sample" });
  const [seqDialog, setSeqDialog] = useState<LineageNode | null>(null);

  const nodes = (data?.nodes ?? []) as LineageNode[];
  const edges = (data?.edges ?? []) as LineageEdge[];
  const root = nodes.find((n) => n.key === data?.root);

  /* 分层：depth 越大越上游，展示时最上游在顶部 */
  const rows = useMemo(() => {
    /* 仅当分子定义为蛋白时才进 hero 区；DNA（如质粒样本）保留在谱系链中 */
    const heroSeqKey = root?.sequence?.type === "protein" ? `sequence:${root.sequence.id}` : null;
    const byDepth = new Map<number, LineageNode[]>();
    for (const n of nodes) {
      if (n.key === heroSeqKey) continue; /* 蛋白序列在 hero 区展示 */
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(n);
      byDepth.set(n.depth, arr);
    }
    return [...byDepth.entries()].sort((a, b) => b[0] - a[0]);
  }, [nodes, root]);

  const relLabel = (r: string) => (lang === "en" ? RELATIONS[r]?.en : RELATIONS[r]?.zh) ?? r;
  const stageOf = (n: LineageNode): string => {
    if (n.kind === "sample") {
      if (n.sampleType === "protein" || n.sampleType === "antibody") return t("纯化蛋白产物");
      if (n.sampleType === "cell_line") return t("表达体系");
      if (n.sampleType === "plasmid") return t("质粒样本");
      return t("样本");
    }
    if (n.seqType === "protein") return t("蛋白序列");
    const asParent = edges.filter((e) => e.parentKey === n.key);
    if (asParent.some((e) => e.relation === "backbone_from")) return t("载体骨架");
    if (asParent.some((e) => e.relation === "insert_from")) return t("基因片段");
    return t("重组表达质粒");
  };
  const gcOf = (text?: string) => {
    if (!text) return null;
    const gc = (text.match(/[GC]/gi) ?? []).length;
    return Math.round((gc / text.length) * 1000) / 10;
  };
  /* 层间关系标签 */
  const crossing = (upperDepth: number, lowerDepth: number) =>
    edges.filter((e) => {
      const c = nodes.find((n) => n.key === e.childKey);
      const p = nodes.find((n) => n.key === e.parentKey);
      return c?.depth === lowerDepth && p?.depth === upperDepth && e.relation !== "defined_by";
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-[380px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!root) {
    return <div className="text-center py-20 text-muted-foreground">{t("样本不存在")}</div>;
  }

  const protSeq = root.sequence ?? null;

  return (
    <div className="space-y-6">
      {/* ── 头部 ── */}
      <div>
        <button
          onClick={() => navigate(`/samples/${sampleId}`)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回样本详情")}
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <GitBranch className="h-6 w-6 text-teal-600" />
          <h1 className="text-2xl font-bold tracking-tight">{t("{name} · 全生命周期追溯", { name: root.name })}</h1>
          <Badge variant="outline" className={SAMPLE_TYPES[root.sampleType ?? "other"]?.cls}>
            {t(SAMPLE_TYPES[root.sampleType ?? "other"]?.label ?? root.sampleType ?? "")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {t("自纯化产物向上追溯：表达体系 → 转染 / 转化所用质粒 → 载体骨架 → 基因片段")}
        </p>
      </div>

      {/* ── 蛋白 Hero：结构 + 序列 ── */}
      {protSeq && protSeq.type === "protein" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{t("蛋白三级结构")}</span>
                {protSeq.pdbId && <Badge variant="outline" className="font-mono">PDB: {protSeq.pdbId}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {protSeq.pdbId ? (
                <StructureView pdbId={protSeq.pdbId} />
              ) : (
                <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground border rounded-lg">
                  {t("暂无结构数据")}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{t("氨基酸序列")} · {protSeq.len} aa</span>
                <Badge variant="outline" className="font-mono text-xs">{protSeq.name}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {protSeq.description && <p className="text-xs text-muted-foreground">{protSeq.description}</p>}
              {protSeq.features && protSeq.features.length > 0 && <FeatureLegend features={protSeq.features} />}
              {protSeq.text && <SequenceText seq={protSeq.text} />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 谱系链（上游 → 下游） ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("生命周期谱系链")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {rows.map(([depth, rowNodes], ri) => {
            const nextRow = rows[ri + 1];
            const links = nextRow ? crossing(depth, nextRow[0]) : [];
            return (
              <div key={depth}>
                <div className="flex flex-wrap justify-center gap-4">
                  {rowNodes.map((n) => {
                    const isRoot = n.key === data?.root;
                    return (
                      <div
                        key={n.key}
                        className={`w-72 rounded-xl border p-3.5 space-y-2 bg-white transition-shadow hover:shadow-md ${isRoot ? "border-teal-400 ring-1 ring-teal-200" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px] font-normal">{stageOf(n)}</Badge>
                          <span className="text-teal-600">{nodeIcon(n)}</span>
                        </div>
                        <div className="font-medium text-sm leading-snug">{n.name}</div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {n.kind === "sample" && (
                            <div className="flex justify-between">
                              <span className="font-mono">{n.sku}</span>
                              <span>{n.quantity} {n.unit}</span>
                            </div>
                          )}
                          {n.kind === "sequence" && (
                            <div>
                              {n.len} {n.seqType === "protein" ? "aa" : "bp"}
                              {n.seqType === "dna" && gcOf(n.text) != null && ` · GC ${gcOf(n.text)}%`}
                            </div>
                          )}
                        </div>
                        {/* 入边关系 */}
                        {edges.filter((e) => e.childKey === n.key && e.relation !== "defined_by").length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-dashed">
                            {edges
                              .filter((e) => e.childKey === n.key && e.relation !== "defined_by")
                              .map((e, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700" title={e.note ?? ""}>
                                  ← {relLabel(e.relation)}
                                </span>
                              ))}
                          </div>
                        )}
                        <div className="flex gap-1.5 pt-1">
                          {n.kind === "sequence" && (
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setSeqDialog(n)}>
                              <FileSearch className="h-3 w-3 mr-1" /> {t("查看序列")}
                            </Button>
                          )}
                          {n.kind === "sample" && (
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => navigate(`/samples/${n.id}`)}>
                              <ExternalLink className="h-3 w-3 mr-1" /> {t("样本详情")}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 层间连接器 */}
                {nextRow && (
                  <div className="flex flex-col items-center py-2">
                    {links.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1.5 mb-1">
                        {[...new Set(links.map((l) => l.relation))].map((r) => (
                          <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {relLabel(r)}
                          </span>
                        ))}
                      </div>
                    )}
                    <ArrowDown className="h-4 w-4 text-teal-500" />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── 序列查看弹窗 ── */}
      <Dialog open={!!seqDialog} onOpenChange={(o) => !o && setSeqDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dna className="h-4 w-4 text-teal-600" /> {seqDialog?.name}
            </DialogTitle>
          </DialogHeader>
          {seqDialog && (
            <div className="space-y-3">
              {seqDialog.description && <p className="text-xs text-muted-foreground">{seqDialog.description}</p>}
              {seqDialog.seqType === "dna" ? (
                <Tabs defaultValue="circular">
                  <TabsList className="h-8">
                    <TabsTrigger value="circular" className="text-xs">{t("环形图谱")}</TabsTrigger>
                    <TabsTrigger value="linear" className="text-xs">{t("线性图谱")}</TabsTrigger>
                    <TabsTrigger value="text" className="text-xs">{t("序列文本")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="circular" className="flex justify-center pt-2">
                    <CircularMap
                      name={seqDialog.name}
                      length={seqDialog.len ?? 0}
                      gc={gcOf(seqDialog.text)}
                      features={(seqDialog.features ?? []).map((f, i) => ({ ...f, id: i }))}
                    />
                  </TabsContent>
                  <TabsContent value="linear" className="pt-2">
                    <LinearMap
                      name={seqDialog.name}
                      length={seqDialog.len ?? 0}
                      features={(seqDialog.features ?? []).map((f, i) => ({ ...f, id: i }))}
                    />
                  </TabsContent>
                  <TabsContent value="text" className="pt-2">
                    {seqDialog.text && <SequenceText seq={seqDialog.text} />}
                  </TabsContent>
                </Tabs>
              ) : (
                <>
                  {seqDialog.features && <FeatureLegend features={seqDialog.features} />}
                  {seqDialog.text && <SequenceText seq={seqDialog.text} />}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
