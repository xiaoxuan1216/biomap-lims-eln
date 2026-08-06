import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Dna, Wand2, Scissors, Blocks, Copy, Save } from "lucide-react";
import {
  codonOptimize, restrictionScan, gibsonDesign,
  CODON_AA, HOSTS,
} from "@/lib/seqtools";
import { useI18n } from "@/i18n";

/** 清理序列为纯大写字符 */
const cleanSeq = (s: string) => (s ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
/** 复制到剪贴板 */
const copyText = async (s: string) => { await navigator.clipboard.writeText(s); };
/** 蛋白 → 初始 DNA（每个氨基酸取表中第一个密码子，作为优化前基线） */
function naiveRevTranslate(protein: string): string {
  const first: Record<string, string> = {};
  for (const [codon, aa] of Object.entries(CODON_AA)) if (!first[aa]) first[aa] = codon;
  return protein.split("").map((aa) => first[aa] ?? "").join("");
}

/** 序列工具箱：密码子优化 / 酶切位点 / Gibson 组装 */
export default function SeqTools({ seq }: { seq: { id: number; name: string; type: string; text: string } }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"codon" | "restrict" | "gibson">("codon");
  const dna = useMemo(() => cleanSeq(seq.text), [seq.text]);
  const isProtein = seq.type === "protein";
  const TABS = [
    { k: "codon" as const, label: t("密码子优化"), icon: Wand2 },
    { k: "restrict" as const, label: t("酶切位点"), icon: Scissors },
    { k: "gibson" as const, label: t("Gibson 组装"), icon: Blocks },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {TABS.map((tb) => (
          <button key={tb.k} onClick={() => setTab(tb.k)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === tb.k ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            <tb.icon className="h-3.5 w-3.5" />{tb.label}
          </button>
        ))}
      </div>
      {tab === "codon" && <CodonPanel name={seq.name} dna={dna} isProtein={isProtein} />}
      {tab === "restrict" && (isProtein ? <NeedDna /> : <RestrictPanel dna={dna} />)}
      {tab === "gibson" && <GibsonPanel currentId={seq.id} currentName={seq.name} dna={isProtein ? "" : dna} />}
    </div>
  );
}

function NeedDna() {
  const { t } = useI18n();
  return <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">{t("该工具仅适用于 DNA 序列")}</p>;
}

function Metric({ label, before, after, pct, int }: { label: string; before: number; after?: number; pct?: boolean; int?: boolean }) {
  const fmt = (v: number) => (int ? String(Math.round(v)) : pct ? `${v.toFixed(1)}%` : v.toFixed(3));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="font-mono text-sm font-semibold text-slate-700">{fmt(before)}{int && after !== undefined ? ` / ${fmt(after)}` : ""}</p>
      {after !== undefined && !int && (
        <p className={`font-mono text-sm font-bold ${after >= before ? "text-emerald-600" : "text-amber-600"}`}>→ {fmt(after)}</p>
      )}
    </div>
  );
}

function CodonPanel({ name, dna, isProtein }: { name: string; dna: string; isProtein: boolean }) {
  const { t } = useI18n();
  const [host, setHost] = useState<string>("ecoli");
  const [frame, setFrame] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof codonOptimize> | null>(null);
  const utils = trpc.useUtils();
  const createSeq = trpc.sequence.create.useMutation({
    onSuccess: () => { toast.success(t("已保存为新序列")); utils.sequence.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const hostLabel = HOSTS[host]?.zh ?? host;
  const run = () => {
    if (isProtein) {
      if (!dna) { toast.error(t("蛋白序列为空")); return; }
      setResult(codonOptimize(naiveRevTranslate(dna), host));
    } else {
      if (dna.length < 9) { toast.error(t("DNA 序列太短")); return; }
      setResult(codonOptimize(dna, host, frame));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={host} onChange={(e) => setHost(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
          {Object.keys(HOSTS).map((h) => <option key={h} value={h}>{t(HOSTS[h].zh)}</option>)}
        </select>
        {!isProtein && (
          <select value={frame} onChange={(e) => setFrame(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
            {[0, 1, 2].map((f) => <option key={f} value={f}>{t("阅读框")} +{f + 1}</option>)}
          </select>
        )}
        <button onClick={run} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">
          <Wand2 className="h-3.5 w-3.5" />{t("开始优化")}
        </button>
        <span className="text-[10px] text-slate-400">{isProtein ? t("输入：蛋白 {n} aa（先反向翻译为 DNA 再优化）", { n: dna.length }) : t("输入：DNA {n} bp", { n: dna.length })} · {t("同义替换，蛋白序列不变")}</span>
      </div>
      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t("CAI（密码子适应指数）")} before={result.caiBefore} after={result.caiAfter} />
            <Metric label={t("GC 含量")} before={result.gcBefore} after={result.gcAfter} pct />
            <Metric label={t("替换密码子")} before={result.changedCodons} after={result.totalCodons} int />
            <div className={`rounded-lg border p-2.5 text-center ${result.identical ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className="text-[10px] text-slate-500">{t("翻译校验")}</p>
              <p className={`text-xs font-bold ${result.identical ? "text-emerald-600" : "text-red-600"}`}>{result.identical ? t("蛋白序列一致 ✓") : t("不一致 ✗")}</p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-600">{t("优化后序列（{n} bp）", { n: result.optimized.length })}</p>
              <div className="flex gap-1.5">
                <button onClick={async () => { await copyText(result.optimized); toast.success(t("已复制")); }}
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"><Copy className="h-3 w-3" />{t("复制")}</button>
                <button disabled={createSeq.isPending}
                  onClick={() => createSeq.mutate({ name: `${name}_opt_${host}`, type: "dna", sequence: result.optimized, description: `由「${name}」经 ${hostLabel} 密码子优化生成（CAI ${result.caiBefore.toFixed(2)}→${result.caiAfter.toFixed(2)}）` })}
                  className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] text-white hover:bg-slate-700 disabled:opacity-40"><Save className="h-3 w-3" />{t("保存为新序列")}</button>
              </div>
            </div>
            <pre className="max-h-36 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {result.optimized.replace(/(.{60})/g, "$1\n")}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function RestrictPanel({ dna }: { dna: string }) {
  const { t } = useI18n();
  const hits = useMemo(
    () => restrictionScan(dna).filter((h) => h.positions.length > 0).sort((a, b) => a.positions.length - b.positions.length || a.enzyme.name.localeCompare(b.enzyme.name)),
    [dna],
  );
  const singles = hits.filter((h) => h.positions.length === 1);
  if (!dna) return <NeedDna />;
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-400">{t("扫描 {n} bp · 23 种常用限制酶 · {m} 种有切点 · 单切酶 {k} 种（适合克隆，绿色高亮）", { n: dna.length, m: hits.length, k: singles.length })}</p>
      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase text-slate-500">
            <tr><th className="px-3 py-2">{t("酶")}</th><th className="px-3 py-2">{t("识别位点")}</th><th className="px-3 py-2">{t("切割次数")}</th><th className="px-3 py-2">{t("位置（1-based）")}</th><th className="px-3 py-2">{t("备注")}</th></tr>
          </thead>
          <tbody>
            {hits.map((h) => (
              <tr key={h.enzyme.name} className={`border-t border-slate-100 ${h.positions.length === 1 ? "bg-emerald-50/40" : ""}`}>
                <td className="px-3 py-1.5 font-semibold text-slate-700">{h.enzyme.name}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{h.enzyme.site}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${h.positions.length === 1 ? "bg-emerald-100 text-emerald-700" : h.positions.length <= 3 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>{h.positions.length}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{h.positions.slice(0, 12).join(", ")}{h.positions.length > 12 ? " …" : ""}</td>
                <td className="px-3 py-1.5 text-[10px] text-slate-400">{h.enzyme.note}</td>
              </tr>
            ))}
            {hits.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t("未发现常用酶切位点")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Frag { id: number; name: string; sequence: string }

function GibsonPanel({ currentId, currentName, dna }: { currentId: number; currentName: string; dna: string }) {
  const { t } = useI18n();
  const { data: allSeqs } = trpc.sequence.list.useQuery();
  const dnaSeqs = (allSeqs ?? []).filter((s) => s.type === "dna");
  const [frags, setFrags] = useState<Frag[]>(dna ? [{ id: currentId, name: currentName, sequence: dna }] : []);
  const [overlap, setOverlap] = useState(20);
  const [pick, setPick] = useState("");
  const plan = useMemo(() => (frags.length >= 2 ? gibsonDesign(frags, overlap) : null), [frags, overlap]);
  const add = () => {
    const s = dnaSeqs.find((x) => x.id === Number(pick));
    if (!s) return;
    if (frags.some((f) => f.id === s.id)) { toast.error(t("该片段已在列表中")); return; }
    setFrags([...frags, { id: s.id, name: s.name, sequence: s.sequence }]); setPick("");
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= frags.length) return;
    const next = [...frags]; [next[i], next[j]] = [next[j], next[i]]; setFrags(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="w-56 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
          <option value="">{t("从序列库添加 DNA 片段…")}</option>
          {dnaSeqs.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.sequence.length} bp）</option>)}
        </select>
        <button onClick={add} disabled={!pick} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">{t("添加")}</button>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">{t("重叠长度")}
          <input type="number" min={15} max={40} value={overlap} onChange={(e) => setOverlap(Number(e.target.value) || 20)} className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs" /> bp
        </label>
      </div>
      {frags.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">{t("按组装顺序添加至少 2 个片段（5'→3'）")}</p>}
      {frags.length > 0 && (
        <div className="space-y-1">
          {frags.map((f, i) => (
            <div key={`${f.id}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">{i + 1}</span>
              <span className="font-medium text-slate-700">{f.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{cleanSeq(f.sequence).length} bp</span>
              <span className="ml-auto flex gap-1">
                <button onClick={() => move(i, -1)} className="rounded border border-slate-200 px-1.5 text-slate-400 hover:bg-slate-50">↑</button>
                <button onClick={() => move(i, 1)} className="rounded border border-slate-200 px-1.5 text-slate-400 hover:bg-slate-50">↓</button>
                <button onClick={() => setFrags(frags.filter((_, j) => j !== i))} className="rounded border border-slate-200 px-1.5 text-red-400 hover:bg-red-50">✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {plan && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            <Dna className="h-4 w-4" /> {t("线性组装产物约")} <b>{plan.totalLength.toLocaleString()} bp</b> · {t("重叠")} {plan.overlapLen} bp · {t("引物退火区")} {plan.annealLen} bp{t("（引物 = 同源臂 + 退火区，点击可复制）")}
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase text-slate-500">
                <tr><th className="px-3 py-2">{t("片段")}</th><th className="px-3 py-2">{t("长度")}</th><th className="px-3 py-2">{t("正向引物（5'→3'）")}</th><th className="px-3 py-2">{t("反向引物（5'→3'）")}</th></tr>
              </thead>
              <tbody>
                {plan.fragments.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{f.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{f.length} bp</td>
                    <td className="px-3 py-1.5"><button onClick={async () => { await copyText(f.primerF); toast.success(t("已复制正向引物")); }} className="font-mono text-[10px] text-slate-600 hover:text-cyan-600" title="点击复制">{f.primerF}</button></td>
                    <td className="px-3 py-1.5"><button onClick={async () => { await copyText(f.primerR); toast.success(t("已复制反向引物")); }} className="font-mono text-[10px] text-slate-600 hover:text-cyan-600" title="点击复制">{f.primerR}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
