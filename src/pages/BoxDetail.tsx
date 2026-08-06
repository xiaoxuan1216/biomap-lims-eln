import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useParams, useNavigate, Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronRight, PackageOpen, AlertTriangle } from "lucide-react";
import { SAMPLE_TYPES, ALERT_LABELS, fmtDate, rowLabel, colLabel, sampleAlert } from "@/lib/labels";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

const TYPE_CELL: Record<string, string> = {
  cell_line: "bg-pink-100 border-pink-300 text-pink-700 hover:bg-pink-200",
  plasmid: "bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200",
  primer: "bg-cyan-100 border-cyan-300 text-cyan-700 hover:bg-cyan-200",
  antibody: "bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200",
  reagent: "bg-teal-100 border-teal-300 text-teal-700 hover:bg-teal-200",
  chemical: "bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200",
  protein: "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200",
  virus: "bg-rose-100 border-rose-300 text-rose-700 hover:bg-rose-200",
  tissue: "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200",
  buffer: "bg-sky-100 border-sky-300 text-sky-700 hover:bg-sky-200",
  enzyme: "bg-lime-100 border-lime-300 text-lime-700 hover:bg-lime-200",
  competent_cell: "bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-200",
  other: "bg-slate-200 border-slate-300 text-slate-600 hover:bg-slate-300",
};

export default function BoxDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const boxId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: box, isLoading } = trpc.storage.boxDetail.useQuery({ id: boxId });
  const { data: allSamples } = trpc.sample.options.useQuery();

  const [placeCell, setPlaceCell] = useState<{ row: number; col: number } | null>(null);
  const [placeSampleId, setPlaceSampleId] = useState("");

  const placeMut = trpc.storage.placeSample.useMutation({
    onSuccess: () => {
      toast.success(t("样本已放入指定格子"));
      setPlaceCell(null);
      setPlaceSampleId("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.storage.removePlacement.useMutation({
    onSuccess: () => {
      toast.success(t("样本已移出冻存盒"));
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const refresh = () => {
    utils.storage.boxDetail.invalidate({ id: boxId });
    utils.storage.tree.invalidate();
    utils.sample.list.invalidate();
  };

  const grid = useMemo(() => {
    const map = new Map<string, NonNullable<typeof box>["placements"][number]>();
    box?.placements.forEach((s) => {
      if (s.boxRow && s.boxCol) map.set(`${s.boxRow}-${s.boxCol}`, s);
    });
    return map;
  }, [box]);

  if (isLoading || !box) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  const rows = box.rows ?? 9;
  const cols = box.cols ?? 9;
  const occupied = box.placements.filter((s) => s.boxRow && s.boxCol).length;
  // 可放入的样本：不在本盒中的
  const candidates = allSamples?.filter((s) => !box.placements.some((p) => p.id === s.id));

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/storage")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回存储管理")}
        </button>
        {/* 面包屑 */}
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground mb-2">
          {box.path.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              {p.name} <ChevronRight className="h-3 w-3" />
            </span>
          ))}
          <span className="text-foreground font-medium">{box.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{box.name}</h1>
          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
            {t("{used} / {total} 格已用", { used: occupied, total: rows * cols })}
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 盒子网格 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("盒内布局（点击空格放入样本，点击占用格查看详情）")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="inline-block">
              {/* 列号 */}
              <div className="flex">
                <div className="w-8 shrink-0" />
                {Array.from({ length: cols }, (_, c) => (
                  <div key={c} className="w-12 h-7 flex items-center justify-center text-xs font-semibold text-slate-400 shrink-0">
                    {colLabel(c)}
                  </div>
                ))}
              </div>
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex">
                  <div className="w-8 h-12 flex items-center justify-center text-xs font-semibold text-slate-400 shrink-0">
                    {rowLabel(r)}
                  </div>
                  {Array.from({ length: cols }, (_, c) => {
                    const sample = grid.get(`${r + 1}-${c + 1}`);
                    if (!sample) {
                      return (
                        <button
                          key={c}
                          className="w-12 h-12 border border-dashed border-slate-200 rounded-md m-px hover:border-teal-400 hover:bg-teal-50 transition-colors shrink-0"
                          onClick={() => setPlaceCell({ row: r + 1, col: c + 1 })}
                        />
                      );
                    }
                    const alert = sampleAlert(sample);
                    return (
                      <Popover key={c}>
                        <PopoverTrigger asChild>
                          <button
                            className={`w-12 h-12 border rounded-md m-px flex flex-col items-center justify-center transition-colors shrink-0 relative ${TYPE_CELL[sample.type]}`}
                          >
                            <span className="text-[10px] font-bold leading-none">
                              {sample.name.slice(0, 2)}
                            </span>
                            <span className="text-[8px] opacity-70 mt-0.5 font-mono">{sample.sku.replace("SMP-", "")}</span>
                            {alert && (
                              <span className="absolute -top-1 -right-1">
                                <AlertTriangle className="h-3 w-3 text-red-500 fill-red-100" />
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-sm">{sample.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{sample.sku}</div>
                              </div>
                              <Badge variant="outline" className={SAMPLE_TYPES[sample.type]?.cls}>
                                {t(SAMPLE_TYPES[sample.type]?.label ?? sample.type)}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <div>{t("位置")}：{rowLabel(r)}{colLabel(c)} · {t("余量")} {sample.quantity} {sample.unit}</div>
                              {sample.expiryDate && <div>{t("效期")}：{fmtDate(sample.expiryDate)}</div>}
                            </div>
                            {alert && (
                              <Badge variant="outline" className={ALERT_LABELS[alert].cls}>
                                {t(ALERT_LABELS[alert].label)}
                              </Badge>
                            )}
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" className="h-7 bg-teal-600 hover:bg-teal-500" asChild>
                                <Link to={`/samples/${sample.id}`}>{t("查看样本")}</Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                disabled={removeMut.isPending}
                                onClick={() => removeMut.mutate({ sampleId: sample.id })}
                              >
                                <PackageOpen className="h-3.5 w-3.5 mr-1" /> {t("移出")}
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 右：盒内样本清单 + 图例 */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("盒内样本")}（{box.placements.length}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {box.placements.length ? (
                box.placements.map((s) => (
                  <Link
                    key={s.id}
                    to={`/samples/${s.id}`}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                  >
                    <span className="font-mono text-xs text-slate-400 w-8 shrink-0">
                      {s.boxRow && s.boxCol ? `${rowLabel(s.boxRow - 1)}${colLabel(s.boxCol - 1)}` : "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.sku}</div>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">{t("空盒子")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("类型图例")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SAMPLE_TYPES).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded border ${TYPE_CELL[k].split(" ").slice(0, 2).join(" ")}`} />
                    {t(v.label)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 放入样本 */}
      <Dialog open={placeCell !== null} onOpenChange={() => setPlaceCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("放入样本到 {cell} 格", { cell: placeCell ? `${rowLabel(placeCell.row - 1)}${colLabel(placeCell.col - 1)}` : "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Select value={placeSampleId} onValueChange={setPlaceSampleId}>
              <SelectTrigger>
                <SelectValue placeholder={t("选择样本")} />
              </SelectTrigger>
              <SelectContent>
                {candidates?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.sku} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaceCell(null)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={placeMut.isPending || !placeSampleId || !placeCell}
              onClick={() =>
                placeCell &&
                placeMut.mutate({
                  sampleId: Number(placeSampleId),
                  boxId,
                  row: placeCell.row,
                  col: placeCell.col,
                })
              }
            >
              {t("确认放入")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
