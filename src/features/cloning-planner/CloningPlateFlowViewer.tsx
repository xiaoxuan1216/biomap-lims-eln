import { useMemo, useState } from "react";
import { Download, FlaskConical, Grid2X2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  cloningCSV,
  CLONING_STAGES,
  CLONING_WELLS,
  padTarget,
  type CloningEntity,
  type CloningPlan,
  type CloningPlate,
  type CloningStage,
  type CloningStageKey,
} from "@contracts/cloningLayout";
import "@/features/cloning-planner/planner.css";

const selectClass = "h-9 min-w-0 rounded-md border bg-background px-2 text-xs";

export const CLONING_PHASES: {
  title: string;
  subtitle: string;
  groups: CloningStageKey[][];
  handoff: string;
}[] = [
  {
    title: "扩增与纯化",
    subtitle: "A 模板 + B / C 引物 + D 试剂 → E PCR → F 纯化",
    groups: [["A", "B", "C"], ["E"], ["F"]],
    handoff: "PCR 与纯化质控后继续；不同步骤允许重新分配孔位。",
  },
  {
    title: "组装与转化",
    subtitle: "F 插入片段 + 载体 → G 组装 → H 转化 → I 独立平皿",
    groups: [["F"], ["G"], ["H"]],
    handoff: "每目标预留一个独立培养皿；形成菌落后挑取候选。",
  },
  {
    title: "候选克隆与筛选",
    subtitle: "I → J 母培养物 → K 筛选；依据 K 结果从 J 择一进入 L",
    groups: [["J"], ["K"], ["L"]],
    handoff: "K 提供筛选结果，J 提供培养来源；L 仅预留容量，克隆身份待确认。",
  },
  {
    title: "测序与交付",
    subtitle: "M → N 双向测序 / O 交付；L → P 菌种；N 结果用于放行",
    groups: [["M"], ["N"], ["O"], ["P"]],
    handoff: "交付质粒来自 M，菌种来自 L；不将测序反应产物作为交付来源。",
  },
];

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read-only, reusable rendering of a complete cloning plate plan.
 * It owns only transient presentation state (target, hover, paging and dialogs).
 */
export interface CloningPlateFlowViewerProps {
  plan: CloningPlan;
  exportBaseName?: string;
  showJsonExport?: boolean;
  jsonExportValue?: unknown;
  targetBindings?: Array<{
    target: number;
    sampleId: number;
    sku: string;
    name: string;
    type: string;
  }>;
}

export function CloningPlateFlowViewer({
  plan,
  exportBaseName = `cloning-${plan.config.samples}`,
  showJsonExport = true,
  jsonExportValue,
  targetBindings = [],
}: CloningPlateFlowViewerProps) {
  const { t } = useI18n();
  const [target, setTarget] = useState(1);
  const [targetDraft, setTargetDraft] = useState("1");
  const [hoverTarget, setHoverTarget] = useState<number | null>(null);
  const [modal, setModal] = useState<"atlas" | "mapping" | "materials" | "entity" | null>(null);
  const [detail, setDetail] = useState<CloningEntity | null>(null);
  const [atlasStage, setAtlasStage] = useState<"all" | CloningStageKey>("all");
  const [atlasPage, setAtlasPage] = useState(0);
  const [mappingStage, setMappingStage] = useState<CloningStageKey>("E");
  const [search, setSearch] = useState("");

  const allPlates = useMemo(() => plan.stages.flatMap(stage => stage.plates), [plan]);
  const entities = useMemo(() => allPlates.flatMap(plate => [...plate.samples, ...plate.controls]), [allPlates]);
  const targetEntities = entities.filter(entity => entity.target === target);
  const atlas = atlasStage === "all" ? allPlates : allPlates.filter(plate => plate.stage === atlasStage);
  const mappingRows = entities.filter(entity => entity.stage === mappingStage && (!search || `${entity.id} ${entity.container} ${entity.well} TGT-${entity.target ? padTarget(entity.target) : ""}`.toLowerCase().includes(search.toLowerCase())));
  const bindingByTarget = useMemo(() => new Map(targetBindings.map(binding => [binding.target, binding])), [targetBindings]);
  const targetBinding = bindingByTarget.get(target);
  const fingerprint = `${plan.engineVersion}:${plan.mode}:${JSON.stringify(plan.config)}`;
  const percentage = (value: number) => `${Math.round(value * 100)}%`;

  function choose(nextTarget: number) {
    if (!Number.isInteger(nextTarget) || nextTarget < 1 || nextTarget > plan.config.samples) return;
    setTarget(nextTarget);
    setTargetDraft(String(nextTarget));
  }

  function openEntity(entity: CloningEntity) {
    setDetail(entity);
    setModal("entity");
  }

  function pick(entity: CloningEntity) {
    if (entity.target) choose(entity.target);
    else openEntity(entity);
  }

  return <div className="cloning-flow-viewer cloning-planner space-y-4">
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 md:grid-cols-5">
      {[
        [t("独立目标"), plan.config.samples],
        [t("候选克隆"), plan.config.samples * plan.config.clones],
        [t("全部孔板"), plan.summary.plates],
        [t("对照 / 避让孔"), `${plan.summary.controlWells} / ${plan.summary.blockedWells}`],
        [t("计划孔位占用率"), percentage(plan.summary.occupancy)],
      ].map(([label, value]) => <div key={label}><small className="text-xs text-muted-foreground">{label}</small><strong className="mt-1 block text-xl">{value}</strong></div>)}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><Grid2X2 className="h-4 w-4 text-teal-600" />{t("全流程孔板与样本流向")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { setAtlasStage("all"); setAtlasPage(0); setModal("atlas"); }}>{t("全部孔板")}</Button>
        <Button variant="outline" size="sm" onClick={() => setModal("mapping")}>{t("映射详情")}</Button>
        <Button variant="outline" size="sm" onClick={() => downloadFile(`${exportBaseName}.csv`, cloningCSV(plan), "text/csv;charset=utf-8")}>{t("导出孔位 CSV")}</Button>
        {showJsonExport && <Button variant="outline" size="sm" onClick={() => downloadFile(`${exportBaseName}.json`, JSON.stringify(jsonExportValue === undefined ? plan : jsonExportValue, null, 2), "application/json")}><Download className="mr-1 h-4 w-4" />JSON</Button>}
      </div>
    </div>

    <div className="cloning-flow-viewer__target-bar flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <label className="text-xs" htmlFor="cloning-flow-target">{t("追踪目标")}</label>
      <span className="font-mono text-xs">TGT-</span>
      <Input id="cloning-flow-target" className="h-8 w-20 text-xs" aria-label={t("追踪目标")} type="number" min={1} max={plan.config.samples} value={targetDraft} onChange={event => setTargetDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") choose(Number(targetDraft)); }} />
      <Button size="sm" variant="outline" onClick={() => choose(Number(targetDraft))}>{t("定位")}</Button>
      <span className="text-xs text-muted-foreground">{hoverTarget ? `TGT-${padTarget(hoverTarget)}` : t("悬停查看样本，点击锁定跨板追踪")}</span>
      {targetBinding && <Badge variant="secondary" className="max-w-full truncate font-normal"><span className="font-mono">{targetBinding.sku}</span><span className="mx-1">·</span>{targetBinding.name}</Badge>}
      <span className="ml-auto text-[10px] text-muted-foreground">{t("N / P 为对照；× 为避让；· 为空孔")}</span>
    </div>

    {CLONING_PHASES.map((phase, index) => <section key={phase.title} className="cloning-flow-viewer__phase rounded-xl border bg-card" data-phase={index + 1}>
      <div className="flex items-center justify-between gap-3 border-b p-4"><div><h3 className="font-semibold"><span className="mr-2 text-teal-700">0{index + 1}</span>{t(phase.title)}</h3><p className="mt-1 text-[11px] text-muted-foreground">{t(phase.subtitle)}</p></div><Badge variant="outline">{t("{n} 块板", { n: plan.stages.filter(stage => stage.phase === index + 1).reduce((total, stage) => total + stage.plates.length, 0) })}</Badge></div>
      {index === 0 && <div className="flex flex-wrap gap-3 bg-muted/30 px-4 py-2 text-xs"><b>{t("D · 共用试剂架")}</b><code>RACK-PLAN-001</code><button className="text-teal-700" onClick={() => setModal("materials")}>{t("试剂编码与物料详情")} ↗</button></div>}
      {index === 1 && <div className="bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{t("复用 F 纯化板；另有 {n} 个 I 独立培养皿，不计入孔板数量。", { n: plan.dishes.length })}</div>}
      <div className={cn("grid gap-4 p-4", index === 3 ? "lg:grid-cols-2 2xl:grid-cols-4" : "xl:grid-cols-3")}>
        {phase.groups.map(keys => <PlateGroup key={`${keys[0]}:${target}:${fingerprint}`} keys={keys} plan={plan} target={target} hovered={hoverTarget} onHover={setHoverTarget} onPick={pick} onDetail={openEntity} onAtlas={stage => { setAtlasStage(stage); setAtlasPage(0); setModal("atlas"); }} />)}
      </div>
      <div className="border-t bg-teal-50/40 px-4 py-3"><div className="mb-2 text-xs font-medium text-teal-800">TGT-{padTarget(target)} · {t("孔位追溯")}</div><div className="flex flex-wrap items-center gap-1.5">{targetEntities.filter(entity => phase.groups.flat().includes(entity.stage as CloningStageKey)).map(entity => <button key={entity.id} onClick={() => openEntity(entity)} className="rounded border bg-background px-2 py-1 font-mono text-[10px] hover:border-teal-500">{entity.stage} · {entity.container}:{entity.well}{entity.cloneId ? ` / C${entity.branch}` : entity.stage === "N" ? entity.branch === 1 ? " / F" : " / R" : ""}</button>)}</div><p className="mt-2 text-[11px] text-muted-foreground">{t(phase.handoff)}</p></div>
    </section>)}

    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[1200px]"><DialogHeader><DialogTitle>{t(modal === "atlas" ? "全部孔板" : modal === "mapping" ? "映射详情" : modal === "materials" ? "D · 共用试剂架" : "样本与孔位详情")}</DialogTitle><DialogDescription>{t("计划样本与容器分别编码；物料流、待选来源和结果依据分别记录。")}</DialogDescription></DialogHeader>
        {modal === "entity" && detail && <div className="max-w-2xl"><EntityDetails entity={detail} /></div>}
        {modal === "materials" && <div className="grid gap-3 md:grid-cols-3">{plan.materials.map(material => <div key={material.id} className="rounded-lg border p-3"><h3 className="text-sm font-medium">{t(material.name)}</h3><p className="mt-2 font-mono text-xs">{material.id}<br />{material.container}<br />RACK-PLAN-001 : {material.slot}<br />{material.lot}</p><p className="mt-2 text-xs text-muted-foreground">{t("示例物料；配方与用量待配置")}</p></div>)}</div>}
        {modal === "atlas" && <><div className="flex items-center gap-3"><select aria-label={t("查看步骤")} className={selectClass} value={atlasStage} onChange={event => { setAtlasStage(event.target.value as "all" | CloningStageKey); setAtlasPage(0); }}><option value="all">{t("全部流程")}</option>{plan.stages.map(stage => <option value={stage.key} key={stage.key}>{stage.key} · {t(stage.name)} ({stage.plates.length})</option>)}</select><span className="text-xs text-muted-foreground">{t("{n} 块板", { n: atlas.length })}</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{atlas.slice(atlasPage * 18, atlasPage * 18 + 18).map(plate => <div key={plate.id} className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold">{plate.stage} · {t(plan.stages.find(stage => stage.key === plate.stage)!.name)}</p><code className="mb-2 block text-xs">{plate.id}</code><PlateGrid plate={plate} target={target} hovered={hoverTarget} onHover={setHoverTarget} onPick={entity => { if (entity.target) { choose(entity.target); setModal(null); } else openEntity(entity); }} /></div>)}</div><div className="flex items-center justify-center gap-4"><Button variant="outline" size="sm" disabled={atlasPage === 0} onClick={() => setAtlasPage(atlasPage - 1)}>{t("上一页")}</Button><span className="text-xs">{atlasPage + 1} / {Math.ceil(atlas.length / 18)}</span><Button variant="outline" size="sm" disabled={(atlasPage + 1) * 18 >= atlas.length} onClick={() => setAtlasPage(atlasPage + 1)}>{t("下一页")}</Button></div></>}
        {modal === "mapping" && <><div className="flex flex-wrap gap-2"><select aria-label={t("查看步骤")} className={selectClass} value={mappingStage} onChange={event => setMappingStage(event.target.value as CloningStageKey)}>{plan.stages.map(stage => <option key={stage.key} value={stage.key}>{stage.key} · {t(stage.name)}</option>)}</select><Input className="w-64" aria-label={t("检索样本或容器")} placeholder={t("检索样本或容器")} value={search} onChange={event => setSearch(event.target.value)} /><span className="text-xs">{t("匹配 {n} 条，最多展示 300 条；导出包含全部孔位。", { n: mappingRows.length })}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["目标", "Run 样本", "规划实体", "容器 / 孔位", "计划来源"].map(heading => <th className="border-b p-2" key={heading}>{t(heading)}</th>)}</tr></thead><tbody>{mappingRows.slice(0, 300).map(entity => { const binding = entity.target ? bindingByTarget.get(entity.target) : undefined; return <tr key={entity.id}><td className="border-b p-2">{entity.target ? `TGT-${padTarget(entity.target)}` : entity.control}</td><td className="border-b p-2">{binding ? <><span className="font-mono text-teal-700">{binding.sku}</span><small className="block text-muted-foreground">{binding.name}</small></> : "—"}</td><td className="border-b p-2"><button className="text-teal-700" onClick={() => openEntity(entity)}>{entity.id}</button></td><td className="border-b p-2 font-mono">{entity.container}:{entity.well}</td><td className="border-b p-2">{entity.parents.map(parent => `${parent.id} (${t(parent.kind === "material" ? "计划物料流" : parent.kind === "conditional" ? "待选来源" : "结果依据")})`).join("; ") || t("虚拟输入 / 对照预留")}</td></tr>; })}</tbody></table></div></>}
      </DialogContent>
    </Dialog>
  </div>;
}

export function PlateGroup({ keys, plan, target, hovered, onHover, onPick, onDetail, onAtlas }: { keys: CloningStageKey[]; plan: CloningPlan; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void; onDetail: (e: CloningEntity) => void; onAtlas: (k: CloningStageKey) => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState(keys[0]);
  const stage = plan.stages.find(item => item.key === key)!;
  return <div className="min-w-0 rounded-lg border p-3"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex flex-wrap gap-1">{keys.map(item => <button key={item} className={cn("rounded px-2 py-1 text-xs", key === item ? "bg-teal-50 font-medium text-teal-800" : "text-muted-foreground")} onClick={() => setKey(item)}>{item} · {t(plan.stages.find(candidate => candidate.key === item)!.name)}</button>)}</div><button className="shrink-0 text-[10px] text-teal-700" onClick={() => onAtlas(key)}>{t("{n} 块板", { n: stage.plates.length })} ↗</button></div><StagePlate key={key} stage={stage} target={target} hovered={hovered} onHover={onHover} onPick={onPick} onDetail={onDetail} /></div>;
}

export function StagePlate({ stage, target, hovered, onHover, onPick, onDetail }: { stage: CloningStage; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void; onDetail: (e: CloningEntity) => void }) {
  const { t } = useI18n();
  const initial = Math.max(0, stage.plates.findIndex(plate => plate.samples.some(entity => entity.target === target)));
  const [index, setIndex] = useState(initial);
  const plate = stage.plates[index];
  const selected = plate.samples.filter(entity => entity.target === target);
  return <><div className="flex justify-between gap-2 text-[10px] text-muted-foreground"><code>{plate.id}</code><span>{t("{n} 样本 + {q} 对照", { n: plate.samples.length, q: plate.controls.length })}</span></div><select className={cn(selectClass, "my-2 w-full")} aria-label={t("{stage} 孔板切换", { stage: stage.key })} value={index} onChange={event => setIndex(Number(event.target.value))}>{stage.plates.map((item, itemIndex) => <option key={item.id} value={itemIndex}>{itemIndex + 1} / {stage.plates.length} · {item.id}</option>)}</select><PlateGrid plate={plate} target={target} hovered={hovered} onHover={onHover} onPick={onPick} /><div className="mt-3 flex items-start justify-between gap-2 border-t pt-2"><div className="text-xs">{selected.length ? <><b>TGT-{padTarget(target)} · {selected.map(entity => entity.well).join(" / ")}</b><small className="mt-1 block text-[10px] text-muted-foreground">{selected.map(entity => entity.id).join(" / ")}</small></> : <span className="text-muted-foreground">{t("本板没有当前目标")}</span>}</div>{selected[0] && <button className="shrink-0 text-[10px] text-teal-700" onClick={() => onDetail(selected[0])}>{t("孔详情")} ↗</button>}</div><p className="mt-2 text-[10px] text-muted-foreground">{t("空闲 {n} 孔 · 避让 {b} 孔", { n: plate.free, b: plate.blocked.length })}</p></>;
}

export function PlateGrid({ plate, target, hovered, onHover, onPick }: { plate: CloningPlate; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void }) {
  const { t } = useI18n();
  const entries = new Map([...plate.samples, ...plate.controls].map(entity => [entity.well, entity]));
  return <div className="cp-plate" role="group" aria-label={`${plate.id} 96`}><span />{Array.from({ length: 12 }, (_, index) => <span className="cp-axis" key={index}>{index + 1}</span>)}{Array.from({ length: 8 }, (_, row) => <div className="contents" key={row}><span className="cp-axis">{"ABCDEFGH"[row]}</span>{CLONING_WELLS.slice(row * 12, row * 12 + 12).map(well => { const entity = entries.get(well), blocked = plate.blocked.includes(well); return <Tooltip key={well}><TooltipTrigger asChild><button data-plate={plate.id} data-well={well} data-target={entity?.target ?? ""} data-entity={entity?.id ?? ""} aria-pressed={entity?.target === target} aria-label={`${plate.id} ${well} ${entity?.id ?? t(blocked ? "避让孔" : "可用空孔")}`} className={cn("cp-well", !entity && "cp-empty", blocked && "cp-blocked", entity?.kind === "control" && "cp-control", entity?.target === target && "cp-selected", entity?.target && entity.target === hovered && "cp-hovered", entity?.target && entity.target >= 1000 && "cp-long")} onMouseEnter={() => onHover(entity?.target ?? null)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(entity?.target ?? null)} onBlur={() => onHover(null)} onClick={() => { if (entity) onPick(entity); }}>{entity?.target ?? (entity?.control ? entity.control === "NTC" ? "N" : "P" : blocked ? "×" : "·")}</button></TooltipTrigger><TooltipContent side="right" sideOffset={8} className="z-[100] max-h-[75vh] w-[360px] max-w-[calc(100vw-24px)] overflow-auto border bg-background p-4 text-foreground shadow-xl">{entity ? <EntityDetails entity={entity} /> : <p className="text-xs">{plate.id}:{well}<br />{t(blocked ? "避让孔，不分配样本" : "可用空孔")}</p>}</TooltipContent></Tooltip>; })}</div>)}</div>;
}

export function EntityDetails({ entity: e }: { entity: CloningEntity }) {
  const { t } = useI18n();
  const fields: [string, string | undefined][] = [["目标", e.target ? `TGT-${padTarget(e.target)}` : e.control], ["规划实体编码", e.id], ["计划容器编号", e.container], ["计划孔位", e.well], ["状态", t(e.kind === "control" ? "对照预留 · 待执行" : "计划孔位 · 待执行")], ["计划浓度", e.concentration], ["规划批次", e.lot], ["长度", e.length], ["序列引用", e.sequenceRef], ["引物配对", e.pairId], ["克隆身份", e.cloneId ?? (["L", "M", "N", "O", "P"].includes(e.stage) ? t("待筛选确认，预留一个入选克隆") : undefined)], ["方向", e.stage === "B" || (e.stage === "N" && e.branch === 1) ? t("正向 F") : e.stage === "C" || e.stage === "N" ? t("反向 R") : undefined], ["共用物料", e.materials.join(" / ") || undefined]];
  return <div className="text-left"><div className="mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-teal-600" /><strong className="text-sm">{e.stage} · {t(CLONING_STAGES.find(stage => stage.key === e.stage)?.name ?? "独立培养皿")}</strong><Badge variant="outline" className="ml-auto font-mono">{e.well}</Badge></div><dl className="grid grid-cols-[75px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">{fields.filter(([, value]) => value).map(([label, value]) => <div className="contents" key={label}><dt className="text-muted-foreground">{t(label)}</dt><dd className="break-words">{value}</dd></div>)}{e.parents.map(parent => <div className="contents" key={`${parent.id}-${parent.kind}`}><dt className="text-muted-foreground">{t(parent.kind === "material" ? "计划来源" : parent.kind === "conditional" ? "待选来源" : "结果依据")}</dt><dd className="break-words"><code>{parent.id}</code><br /><code className="text-[10px]">{parent.container}:{parent.well}</code></dd></div>)}</dl><p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">{t("虚拟规划数据；尚未执行或放行。")}</p></div>;
}

export default CloningPlateFlowViewer;
