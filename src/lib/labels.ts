// ─── 全局标签与样式映射 ─────────────────────────────────────────────────

export const PROJECT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "进行中", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_hold: { label: "已暂停", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "已完成", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const EXP_STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: "计划中", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { label: "进行中", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  signed: { label: "已签署", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

export const SAMPLE_TYPE_LIST = [
  "cell_line",
  "plasmid",
  "primer",
  "antibody",
  "reagent",
  "chemical",
  "protein",
  "virus",
  "tissue",
  "other",
] as const;
export type SampleType = (typeof SAMPLE_TYPE_LIST)[number];

export const SAMPLE_TYPES: Record<string, { label: string; cls: string }> = {
  cell_line: { label: "细胞株", cls: "bg-pink-50 text-pink-700 border-pink-200" },
  plasmid: { label: "质粒", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  primer: { label: "引物", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  antibody: { label: "抗体", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  reagent: { label: "试剂", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  chemical: { label: "化学品", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  protein: { label: "蛋白/因子", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  virus: { label: "病毒载体", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  tissue: { label: "组织", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  other: { label: "其他", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const LOCATION_TYPES: Record<string, string> = {
  lab: "实验区",
  freezer: "超低温冰箱",
  fridge: "冷藏柜",
  shelf: "层架",
  rack: "支架",
  box: "冻存盒",
};

export const TX_REASONS: Record<string, string> = {
  restock: "入库",
  consume: "领用",
  adjust: "调整",
  dispose: "废弃",
};

export const PROJECT_COLORS: Record<string, { dot: string; soft: string }> = {
  teal: { dot: "bg-teal-500", soft: "bg-teal-50 text-teal-700" },
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-50 text-indigo-700" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-50 text-amber-700" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-50 text-rose-700" },
  cyan: { dot: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-700" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-50 text-violet-700" },
};

export const SEQ_TYPES: Record<string, string> = {
  dna: "DNA",
  rna: "RNA",
  protein: "蛋白质",
};

// ─── 样本状态计算 ────────────────────────────────────────────────────────
export type SampleAlert = "expired" | "expiring" | "low" | "empty" | null;

export function sampleAlert(s: {
  quantity: number;
  alertThreshold: number | null;
  expiryDate: string | null;
}): SampleAlert {
  const today = new Date().toISOString().slice(0, 10);
  if (s.expiryDate && s.expiryDate <= today) return "expired";
  if (s.quantity <= 0) return "empty";
  if (s.expiryDate) {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    if (s.expiryDate <= soon.toISOString().slice(0, 10)) return "expiring";
  }
  if (s.alertThreshold != null && s.quantity <= s.alertThreshold) return "low";
  return null;
}

export const ALERT_LABELS: Record<string, { label: string; cls: string }> = {
  expired: { label: "已过期", cls: "bg-red-50 text-red-700 border-red-200" },
  empty: { label: "已用尽", cls: "bg-red-50 text-red-700 border-red-200" },
  expiring: { label: "临期", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "低库存", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

// ─── ELN 区块 ───────────────────────────────────────────────────────────
export type ElnBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "checklist"; items: { id: string; text: string; done: boolean }[] };

export function parseBlocks(content: string | null): ElnBlock[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── 格式化 ─────────────────────────────────────────────────────────────
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(date);
}

// ─── 序列分析 ───────────────────────────────────────────────────────────
export function gcContent(seq: string): number {
  const s = seq.toUpperCase();
  if (!s.length) return 0;
  const gc = (s.match(/[GC]/g) || []).length;
  return Math.round((gc / s.length) * 1000) / 10;
}

export function baseCounts(seq: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ch of seq.toUpperCase()) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

export function reverseComplement(seq: string): string {
  const map: Record<string, string> = { A: "T", T: "A", C: "G", G: "C", U: "A", N: "N" };
  return seq
    .toUpperCase()
    .split("")
    .reverse()
    .map((c) => map[c] ?? c)
    .join("");
}

export function colLabel(i: number): string {
  return String(i + 1);
}

export function rowLabel(i: number): string {
  return String.fromCharCode(65 + i);
}
