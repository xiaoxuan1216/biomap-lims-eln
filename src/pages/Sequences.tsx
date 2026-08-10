import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Dna,
  Trash2,
  Copy,
  Search,
  Wand2,
  CircleDot,
  Minus as MinusIcon,
  Scissors,
  Sparkles,
  ArrowRight,
  Wrench,
} from "lucide-react";
import {
  SEQ_TYPES,
  FEATURE_TYPES,
  FEATURE_COLORS,
  fmtDate,
  reverseComplement,
} from "@/lib/labels";
import { CircularMap, LinearMap } from "@/components/seqmap/PlasmidMap";
import SeqTools from "@/components/seqmap/SeqTools";
import { setCopilotContext } from "@/lib/copilotContext";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

function ColoredSeq({ seq }: { seq: string }) {
  const groups: string[] = [];
  for (let i = 0; i < seq.length; i += 10) groups.push(seq.slice(i, i + 10));
  const lines: { start: number; groups: string[] }[] = [];
  for (let i = 0; i < groups.length; i += 6) {
    lines.push({ start: i * 10 + 1, groups: groups.slice(i, i + 6) });
  }
  return (
    <div className="sequence-view bg-slate-50 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
      {lines.map((line, li) => (
        <div key={li} className="flex gap-3">
          <span className="text-slate-400 select-none w-12 text-right shrink-0">{line.start}</span>
          <div className="flex gap-2">
            {line.groups.map((g, gi) => (
              <span key={gi} className="tracking-wider">
                {g.split("").map((ch, ci) => (
                  <span key={ci} className={`base-${ch.toLowerCase()}`}>{ch}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Sequences() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const { data: sequences, isLoading } = trpc.sequence.list.useQuery({
    search: search || undefined,
  });
  const [selectedId, setSelectedId] = useState<number | null>(
    params.get("focus") ? Number(params.get("focus")) : null,
  );
  const { data: selected } = trpc.sequence.byId.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null },
  );
  const { data: analysis } = trpc.sequence.analyze.useQuery(
    { sequenceId: selectedId! },
    { enabled: selectedId !== null },
  );

  // Copilot 上下文
  useEffect(() => {
    if (selected) {
      setCopilotContext({
        entityType: "sequence",
        entityId: selected.id,
        entityName: selected.name,
      });
    } else {
      setCopilotContext({});
    }
    return () => setCopilotContext({});
  }, [selected]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [featOpen, setFeatOpen] = useState(false);
  const [gibsonOpen, setGibsonOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "dna", sequence: "", description: "" });
  const [featForm, setFeatForm] = useState({
    name: "", type: "cds", start: "1", end: "100", strand: "1", color: "teal", note: "",
  });
  const [gibsonForm, setGibsonForm] = useState({ leftArm: "", rightArm: "" });

  const refreshDetail = () => {
    if (selectedId) {
      utils.sequence.byId.invalidate({ id: selectedId });
      utils.sequence.analyze.invalidate({ sequenceId: selectedId });
    }
  };

  const createMut = trpc.sequence.create.useMutation({
    onSuccess: (r) => {
      toast.success(t("序列已添加"));
      setCreateOpen(false);
      setForm({ name: "", type: "dna", sequence: "", description: "" });
      setSelectedId(r.id);
      utils.sequence.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sequence.delete.useMutation({
    onSuccess: () => {
      toast.success(t("序列已删除"));
      setDeleteOpen(false);
      setSelectedId(null);
      utils.sequence.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const annotateMut = trpc.sequence.autoAnnotate.useMutation({
    onSuccess: (r) => {
      toast.success(t("自动注释完成：新增 {added} 个特性（共 {total} 个）", { added: r.added, total: r.total }));
      refreshDetail();
    },
    onError: (e) => toast.error(e.message),
  });
  const addFeatMut = trpc.sequence.addFeature.useMutation({
    onSuccess: () => {
      toast.success(t("特性已添加"));
      setFeatOpen(false);
      refreshDetail();
    },
    onError: (e) => toast.error(e.message),
  });
  const delFeatMut = trpc.sequence.deleteFeature.useMutation({
    onSuccess: () => refreshDetail(),
    onError: (e) => toast.error(e.message),
  });
  const gibsonMut = trpc.ai.designGibson.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const revComp = useMemo(
    () => (selected && selected.type === "dna" ? reverseComplement(selected.sequence) : null),
    [selected],
  );

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(t("{label}已复制", { label })));
  };

  const siteCounts = useMemo(() => {
    if (!analysis) return [];
    const m = new Map<string, number>();
    analysis.restrictionSites.forEach((h) => m.set(h.enzyme, (m.get(h.enzyme) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[1] - b[1]);
  }, [analysis]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("序列库")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("SnapGene 风格图谱 · 自动注释 · ORF 与酶切分析")}
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("添加序列")}
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：列表 */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("搜索序列…")} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("加载中…")}</p>
            ) : sequences?.length ? (
              sequences.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === s.id ? "border-teal-400 bg-teal-50/60" : "hover:border-teal-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                    <Dna className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.sequence.length} {s.type === "protein" ? "aa" : "bp"} · {fmtDate(s.createdAt)}
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-slate-50 shrink-0">{t(SEQ_TYPES[s.type] ?? s.type)}</Badge>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("暂无序列")}</p>
            )}
          </CardContent>
        </Card>

        {/* 右：详情 */}
        <Card className="lg:col-span-2 min-h-96">
          {selected ? (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-lg">{selected.name}</CardTitle>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                    {t(SEQ_TYPES[selected.type] ?? selected.type)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selected.sequence.length} {selected.type === "protein" ? "aa" : "bp"}
                  </span>
                  <div className="ml-auto flex gap-2 flex-wrap">
                    {selected.type !== "protein" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-violet-600 border-violet-200 hover:bg-violet-50"
                          disabled={annotateMut.isPending}
                          onClick={() => annotateMut.mutate({ sequenceId: selected.id })}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1" />
                          {annotateMut.isPending ? t("注释中…") : t("自动注释")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-teal-600 border-teal-200 hover:bg-teal-50"
                          onClick={() => setGibsonOpen(true)}
                        >
                          <Scissors className="h-3.5 w-3.5 mr-1" /> {t("Gibson 引物")}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => copy(selected.sequence, t("序列"))}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> {t("复制")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {selected.description && (
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="map">
                  <TabsList>
                    <TabsTrigger value="map">{t("图谱")}</TabsTrigger>
                    <TabsTrigger value="features">{t("特性")}（{selected.features.length}）</TabsTrigger>
                    <TabsTrigger value="seq">{t("序列")}</TabsTrigger>
                    <TabsTrigger value="analysis" className="gap-1">
                      <Sparkles className="h-3 w-3" /> {t("分析")}
                    </TabsTrigger>
                    <TabsTrigger value="tools" className="gap-1">
                      <Wrench className="h-3 w-3" /> {t("工具")}
                    </TabsTrigger>
                  </TabsList>

                  {/* 图谱 */}
                  <TabsContent value="map" className="mt-4 space-y-4">
                    {selected.features.length === 0 && (
                      <div className="rounded-lg border border-dashed border-teal-300 bg-teal-50/50 px-4 py-3 text-sm text-teal-800 flex items-center gap-2">
                        <Wand2 className="h-4 w-4 shrink-0" />
                        {t("还没有特性注释。点击「自动注释」扫描启动子、标签、酶切位点等常见元件，或手动添加。")}
                      </div>
                    )}
                    <Tabs defaultValue="circular">
                      <TabsList className="h-8">
                        <TabsTrigger value="circular" className="text-xs gap-1">
                          <CircleDot className="h-3 w-3" /> {t("环形")}
                        </TabsTrigger>
                        <TabsTrigger value="linear" className="text-xs gap-1">
                          <MinusIcon className="h-3 w-3" /> {t("线性")}
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="circular">
                        <CircularMap
                          name={selected.name}
                          length={selected.sequence.length}
                          gc={analysis?.gc}
                          features={selected.features}
                        />
                      </TabsContent>
                      <TabsContent value="linear">
                        <LinearMap
                          name={selected.name}
                          length={selected.sequence.length}
                          features={selected.features}
                        />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* 特性表 */}
                  <TabsContent value="features" className="mt-4">
                    <div className="flex justify-end mb-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFeatForm({
                            name: "", type: "cds", start: "1",
                            end: String(Math.min(100, selected.sequence.length)),
                            strand: "1", color: "teal", note: "",
                          });
                          setFeatOpen(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> {t("添加特性")}
                      </Button>
                    </div>
                    {selected.features.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("名称")}</TableHead>
                            <TableHead className="w-28">{t("类型")}</TableHead>
                            <TableHead className="w-32">{t("位置")}</TableHead>
                            <TableHead className="w-16">{t("链")}</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.features.map((f) => (
                            <TableRow key={f.id}>
                              <TableCell>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-3 w-3 rounded-sm shrink-0"
                                    style={{ background: FEATURE_COLORS[f.color] ?? "#14b8a6" }}
                                  />
                                  <span className="font-medium text-sm">{f.name}</span>
                                  {f.note && (
                                    <span className="text-xs text-muted-foreground hidden md:inline">
                                      {f.note}
                                    </span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-slate-50">
                                  {t(FEATURE_TYPES[f.type] ?? f.type)}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {f.start}..{f.end}（{f.end - f.start + 1} bp）
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {f.strand === -1 ? "−" : "+"}
                              </TableCell>
                              <TableCell>
                                <button
                                  className="text-slate-300 hover:text-red-500"
                                  onClick={() => delFeatMut.mutate({ id: f.id })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-10">
                        {t("暂无特性，试试「自动注释」")}
                      </p>
                    )}
                  </TabsContent>

                  {/* 序列 */}
                  <TabsContent value="seq" className="mt-4 space-y-3">
                    <ColoredSeq seq={selected.sequence} />
                    {revComp && (
                      <details className="group">
                        <summary className="text-sm text-teal-600 cursor-pointer hover:underline">
                          {t("查看反向互补序列")}
                        </summary>
                        <div className="mt-2">
                          <Button size="sm" variant="outline" className="mb-2" onClick={() => copy(revComp, t("反向互补序列"))}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> {t("复制")}
                          </Button>
                          <ColoredSeq seq={revComp} />
                        </div>
                      </details>
                    )}
                  </TabsContent>

                  {/* 分析 */}
                  <TabsContent value="analysis" className="mt-4 space-y-5">
                    {analysis ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <StatBox label={t("长度")} value={`${analysis.length} ${selected.type === "protein" ? "aa" : "bp"}`} />
                          {analysis.gc !== null && <StatBox label={t("GC 含量")} value={`${analysis.gc}%`} />}
                          <StatBox label={t("主要 ORF")} value={t("{n} 个", { n: analysis.orfs.length })} />
                          <StatBox
                            label={t("唯一切点酶")}
                            value={analysis.uniqueCutters.length ? t("{n} 种", { n: analysis.uniqueCutters.length }) : t("无")}
                          />
                        </div>

                        {/* 组成 */}
                        <div>
                          <h4 className="text-sm font-semibold mb-2">{t("碱基/氨基酸组成")}</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(analysis.composition)
                              .sort((a, b) => b[1] - a[1])
                              .map(([base, count]) => (
                                <span key={base} className="text-xs font-mono bg-slate-100 rounded px-2 py-1">
                                  <b className={`base-${base.toLowerCase()}`}>{base}</b> {count}（
                                  {Math.round((count / analysis.length) * 1000) / 10}%）
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* ORF */}
                        {analysis.orfs.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">{t("开放阅读框（六读框扫描，≥30 aa）")}</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-20">{t("读框")}</TableHead>
                                  <TableHead className="w-36">{t("位置")}</TableHead>
                                  <TableHead className="w-24">{t("长度")}</TableHead>
                                  <TableHead>{t("蛋白预览")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {analysis.orfs.map((o, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono text-xs">
                                      {o.frame > 0 ? `+${o.frame}` : o.frame}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{o.start}..{o.end}</TableCell>
                                    <TableCell className="text-sm">{o.lengthAa} aa</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                      {o.proteinPreview}…
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {/* 酶切 */}
                        {analysis.restrictionSites.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">
                              {t("限制性酶切位点")}（{analysis.restrictionSites.length}）
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {siteCounts.map(([enzyme, n]) => (
                                <Badge
                                  key={enzyme}
                                  variant="outline"
                                  className={
                                    n === 1
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-slate-50 text-slate-600 border-slate-200"
                                  }
                                >
                                  {enzyme} ×{n}
                                </Badge>
                              ))}
                            </div>
                            {analysis.uniqueCutters.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                <Sparkles className="h-3 w-3 inline mr-1 text-teal-500" />
                                {t("唯一切点（克隆可用）")}：{analysis.uniqueCutters.join("、")}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t("分析中…")}</p>
                    )}
                  </TabsContent>

                  {/* 工具：密码子优化 / 酶切位点 / Gibson 组装 */}
                  <TabsContent value="tools" className="mt-4">
                    <SeqTools
                      key={selected.id}
                      seq={{ id: selected.id, name: selected.name, type: selected.type, text: selected.sequence }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground gap-3">
              <Dna className="h-10 w-10 opacity-30" />
              <p className="text-sm">{t("从左侧选择一条序列查看图谱与分析")}</p>
            </div>
          )}
        </Card>
      </div>

      {/* 添加序列 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("添加序列")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("名称")} *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("例如：CD19-scFv (FMC63)")} />
              </div>
              <div className="space-y-2">
                <Label>{t("类型")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dna">DNA</SelectItem>
                    <SelectItem value="rna">RNA</SelectItem>
                    <SelectItem value="protein">{t("蛋白质")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("序列")} *（{t("自动去除非字母并转为大写")}）</Label>
              <Textarea
                value={form.sequence}
                onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                placeholder="ATGGCGTACG…"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("描述")}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("来源、用途等…")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.name.trim() || !form.sequence.trim()}
              onClick={() =>
                createMut.mutate({
                  name: form.name.trim(),
                  type: form.type as "dna" | "rna" | "protein",
                  sequence: form.sequence,
                  description: form.description || undefined,
                })
              }
            >
              {t("添加")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加特性 */}
      <Dialog open={featOpen} onOpenChange={setFeatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("添加特性注释")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("特性名称")} *</Label>
              <Input value={featForm.name} onChange={(e) => setFeatForm({ ...featForm, name: e.target.value })} placeholder={t("例如：T7 启动子")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("类型")}</Label>
                <Select value={featForm.type} onValueChange={(v) => setFeatForm({ ...featForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FEATURE_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("链方向")}</Label>
                <Select value={featForm.strand} onValueChange={(v) => setFeatForm({ ...featForm, strand: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("正向（+）")}</SelectItem>
                    <SelectItem value="-1">{t("反向（−）")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("起始位置")}</Label>
                <Input type="number" min="1" value={featForm.start} onChange={(e) => setFeatForm({ ...featForm, start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("结束位置（序列长 {n}）", { n: selected?.sequence.length ?? 0 })}</Label>
                <Input type="number" min="1" value={featForm.end} onChange={(e) => setFeatForm({ ...featForm, end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("颜色")}</Label>
              <div className="flex gap-2 pt-1">
                {Object.entries(FEATURE_COLORS).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setFeatForm({ ...featForm, color: k })}
                    className={`h-6 w-6 rounded-full ${featForm.color === k ? "ring-2 ring-offset-2 ring-slate-400" : ""}`}
                    style={{ background: v }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("备注")}</Label>
              <Input value={featForm.note} onChange={(e) => setFeatForm({ ...featForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={addFeatMut.isPending || !featForm.name.trim() || !selectedId}
              onClick={() =>
                selectedId &&
                addFeatMut.mutate({
                  sequenceId: selectedId,
                  name: featForm.name.trim(),
                  type: featForm.type as "cds",
                  start: Number(featForm.start),
                  end: Number(featForm.end),
                  strand: featForm.strand === "1" ? 1 : -1,
                  color: featForm.color,
                  note: featForm.note || undefined,
                })
              }
            >
              {t("添加")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gibson 引物设计 */}
      <Dialog open={gibsonOpen} onOpenChange={setGibsonOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Gibson 引物设计")} · {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("输入载体线性化末端序列（各 ≥10 bp），自动计算带同源臂的扩增引物（同源臂 25 bp + 退火区 20 bp）。")}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("载体左臂（插入位点上游末端 25 bp）")}</Label>
                <Textarea
                  value={gibsonForm.leftArm}
                  onChange={(e) => setGibsonForm({ ...gibsonForm, leftArm: e.target.value })}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder="…GCGGCCGCTCTAGAACTAGT"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("载体右臂（插入位点下游起始 25 bp）")}</Label>
                <Textarea
                  value={gibsonForm.rightArm}
                  onChange={(e) => setGibsonForm({ ...gibsonForm, rightArm: e.target.value })}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder="GGATCCCCGGGTACCGAGCT…"
                />
              </div>
            </div>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={gibsonMut.isPending || gibsonForm.leftArm.replace(/[^A-Za-z]/g, "").length < 10 || gibsonForm.rightArm.replace(/[^A-Za-z]/g, "").length < 10 || !selectedId}
              onClick={() =>
                selectedId &&
                gibsonMut.mutate({
                  insertSequenceId: selectedId,
                  vectorLeftArm: gibsonForm.leftArm.replace(/[^A-Za-z]/g, ""),
                  vectorRightArm: gibsonForm.rightArm.replace(/[^A-Za-z]/g, ""),
                })
              }
            >
              {gibsonMut.isPending ? t("计算中…") : t("设计引物")}
            </Button>

            {gibsonMut.data && "forward" in gibsonMut.data && (
              <div className="space-y-3 pt-2 border-t">
                {[
                  { label: t("上游引物"), p: gibsonMut.data.forward },
                  { label: t("下游引物"), p: gibsonMut.data.reverse },
                ].map(({ label, p }) => (
                  <div key={label} className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{label}（{p.name}）</span>
                      <span className="text-xs text-muted-foreground">
                        {t("退火区 Tm {tm}°C · 全长 {len} nt", { tm: p.tm, len: p.sequence.length })}
                      </span>
                    </div>
                    <div className="font-mono text-xs bg-slate-50 rounded p-2 break-all">
                      <span className="text-violet-600 font-semibold">{p.homologyArm}</span>
                      <span className="text-teal-700 font-semibold">{p.annealRegion}</span>
                    </div>
                    <div className="flex gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-violet-500" /> {t("同源臂（25 bp）")}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-teal-600" /> {t("模板退火区（20 bp）")}
                      </span>
                      <button className="ml-auto text-teal-600 hover:underline" onClick={() => copy(p.sequence, t("引物序列"))}>
                        {t("复制引物")} <ArrowRight className="h-3 w-3 inline" />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{gibsonMut.data.note}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除序列「{name}」？", { name: selected?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("序列及其特性注释将被删除，不可恢复。")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => selected && deleteMut.mutate({ id: selected.id })}
            >
              {t("确认删除")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-slate-50/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5 truncate">{value}</div>
    </div>
  );
}
