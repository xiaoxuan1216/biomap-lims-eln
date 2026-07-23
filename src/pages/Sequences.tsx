import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Dna, Trash2, Copy, Search } from "lucide-react";
import { SEQ_TYPES, baseCounts, fmtDate, gcContent, reverseComplement } from "@/lib/labels";
import { toast } from "sonner";

function ColoredSeq({ seq }: { seq: string }) {
  // 每 10 个字符一组，每行 6 组
  const groups: string[] = [];
  for (let i = 0; i < seq.length; i += 10) groups.push(seq.slice(i, i + 10));
  const lines: { start: number; groups: string[] }[] = [];
  for (let i = 0; i < groups.length; i += 6) {
    lines.push({ start: i * 10 + 1, groups: groups.slice(i, i + 6) });
  }
  return (
    <div className="sequence-view bg-slate-50 rounded-lg p-4 overflow-x-auto">
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
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const { data: sequences, isLoading } = trpc.sequence.list.useQuery({
    search: search || undefined,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: selected } = trpc.sequence.byId.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "dna", sequence: "", description: "" });

  const createMut = trpc.sequence.create.useMutation({
    onSuccess: (r) => {
      toast.success("序列已添加");
      setCreateOpen(false);
      setForm({ name: "", type: "dna", sequence: "", description: "" });
      setSelectedId(r.id);
      utils.sequence.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sequence.delete.useMutation({
    onSuccess: () => {
      toast.success("序列已删除");
      setDeleteOpen(false);
      setSelectedId(null);
      utils.sequence.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    if (!selected) return null;
    const seq = selected.sequence;
    const counts = baseCounts(seq);
    const isNucleic = selected.type !== "protein";
    return {
      length: seq.length,
      gc: isNucleic ? gcContent(seq) : null,
      counts,
      revComp: selected.type === "dna" ? reverseComplement(seq) : null,
    };
  }, [selected]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label}已复制到剪贴板`));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">序列库</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DNA / RNA / 蛋白质序列管理与分析
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 添加序列
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：列表 */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索序列…"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">加载中…</p>
            ) : sequences?.length ? (
              sequences.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === s.id
                      ? "border-teal-400 bg-teal-50/60"
                      : "hover:border-teal-200 hover:bg-slate-50"
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
                  <Badge variant="outline" className="bg-slate-50 shrink-0">{SEQ_TYPES[s.type]}</Badge>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无序列</p>
            )}
          </CardContent>
        </Card>

        {/* 右：查看器 */}
        <Card className="lg:col-span-2 min-h-96">
          {selected && stats ? (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-lg">{selected.name}</CardTitle>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                    {SEQ_TYPES[selected.type]}
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(selected.sequence, "序列")}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> 复制
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
              <CardContent className="space-y-4">
                {/* 统计 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="长度" value={`${stats.length} ${selected.type === "protein" ? "aa" : "bp"}`} />
                  {stats.gc !== null && <StatBox label="GC 含量" value={`${stats.gc}%`} />}
                  <StatBox label="添加人" value={selected.createdByName ?? "—"} />
                  <StatBox label="添加时间" value={fmtDate(selected.createdAt)} />
                </div>
                {/* 碱基/氨基酸组成 */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([base, count]) => (
                      <span key={base} className="text-xs font-mono bg-slate-100 rounded px-2 py-1">
                        <b className={`base-${base.toLowerCase()}`}>{base}</b> {count}（
                        {Math.round((count / stats.length) * 1000) / 10}%）
                      </span>
                    ))}
                </div>

                <Tabs defaultValue="forward">
                  <TabsList>
                    <TabsTrigger value="forward">序列（5'→3'）</TabsTrigger>
                    {stats.revComp && <TabsTrigger value="revcomp">反向互补</TabsTrigger>}
                  </TabsList>
                  <TabsContent value="forward" className="mt-3">
                    <ColoredSeq seq={selected.sequence} />
                  </TabsContent>
                  {stats.revComp && (
                    <TabsContent value="revcomp" className="mt-3 space-y-2">
                      <Button size="sm" variant="outline" onClick={() => copy(stats.revComp!, "反向互补序列")}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> 复制反向互补序列
                      </Button>
                      <ColoredSeq seq={stats.revComp} />
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground gap-3">
              <Dna className="h-10 w-10 opacity-30" />
              <p className="text-sm">从左侧选择一条序列查看详情与分析</p>
            </div>
          )}
        </Card>
      </div>

      {/* 添加序列 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加序列</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：CD19-scFv (FMC63)"
                />
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dna">DNA</SelectItem>
                    <SelectItem value="rna">RNA</SelectItem>
                    <SelectItem value="protein">蛋白质</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>序列 *（自动去除空格与数字并转为大写）</Label>
              <Textarea
                value={form.sequence}
                onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                placeholder="ATGGCGTACG…"
              />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="来源、用途等…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
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
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除序列「{selected?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>删除后不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => selected && deleteMut.mutate({ id: selected.id })}
            >
              确认删除
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
