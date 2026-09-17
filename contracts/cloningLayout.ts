import { z } from "zod";

export const cloningConfigSchema = z.object({
  samples: z.number().int().min(1).max(1536),
  clones: z.number().int().min(1).max(4),
  controls: z.union([z.literal(0), z.literal(2), z.literal(4)]),
  edge: z.boolean(), group: z.boolean(), column: z.boolean(), balance: z.boolean(),
});
export const cloningModeSchema = z.enum(["compact", "recommended"]);
export type CloningConfig = z.infer<typeof cloningConfigSchema>;
export type CloningMode = z.infer<typeof cloningModeSchema>;
export const DEFAULT_CLONING_CONFIG: CloningConfig = { samples: 96, clones: 2, controls: 2, edge: false, group: true, column: false, balance: true };
export const CLONING_ENGINE_VERSION = "1.0.0";
export const CLONING_STAGES = [
  { key: "A", name: "模板", prefix: "TPL", phase: 1 },
  { key: "B", name: "正向引物", prefix: "PRF", phase: 1 },
  { key: "C", name: "反向引物", prefix: "PRR", phase: 1 },
  { key: "E", name: "PCR 产物", prefix: "PCR", phase: 1 },
  { key: "F", name: "纯化片段", prefix: "PUR", phase: 1 },
  { key: "G", name: "组装反应", prefix: "ASM", phase: 2 },
  { key: "H", name: "转化 / 复苏", prefix: "TRF", phase: 2 },
  { key: "J", name: "候选克隆母培养物", prefix: "COL", phase: 3 },
  { key: "K", name: "菌落 PCR", prefix: "CPCR", phase: 3 },
  { key: "L", name: "选中克隆扩培", prefix: "CUL", phase: 3 },
  { key: "M", name: "质粒母样", prefix: "PLS", phase: 4 },
  { key: "N", name: "双向测序等份", prefix: "SEQ", phase: 4 },
  { key: "O", name: "交付质粒", prefix: "FIN", phase: 4 },
  { key: "P", name: "菌种冻存", prefix: "STK", phase: 4 },
] as const;
export type CloningStageKey = typeof CLONING_STAGES[number]["key"];
export interface CloningParent { id: string; container: string; well: string; kind: "material" | "conditional" | "result" }
export interface CloningEntity {
  id: string; stage: CloningStageKey | "I"; target: number | null; branch: number;
  container: string; well: string; kind: "sample" | "control" | "dish"; control?: "NTC" | "POS";
  parents: CloningParent[]; materials: string[]; concentration?: string; lot?: string;
  sequenceRef?: string; length?: string; pairId?: string; cloneId?: string;
}
export interface CloningPlate { id: string; stage: CloningStageKey; samples: CloningEntity[]; controls: CloningEntity[]; blocked: string[]; free: number; capacity: number }
export interface CloningStage { key: CloningStageKey; name: string; phase: number; plates: CloningPlate[]; capacity: number; sampleCount: number; splits: number; balanced: boolean }
export interface CloningMaterial { id: string; name: string; container: string; slot: string; lot: string }
export interface CloningPlan {
  engineVersion: string; planningOnly: true; sourceMode: "fictional"; config: CloningConfig; mode: CloningMode;
  stages: CloningStage[]; dishes: CloningEntity[]; materials: CloningMaterial[];
  summary: { plates: number; sampleWells: number; controlWells: number; blockedWells: number; freeWells: number; dishes: number; splits: number; occupancy: number; minReactionTail: number | null };
}
export const padTarget = (n: number) => String(n).padStart(3, "0");
export const CLONING_WELLS = Array.from({ length: 96 }, (_, i) => "ABCDEFGH"[Math.floor(i / 12)] + String(i % 12 + 1).padStart(2, "0"));
export const isCloningEdge = (well: string) => well[0] === "A" || well[0] === "H" || well.endsWith("01") || well.endsWith("12");
const materialRows = [
  ["MAT-MM", "PCR Mix", "TUBE-MM-01"], ["MAT-WATER", "无核酸酶水", "TUBE-WATER-01"],
  ["VEC-001", "共享线性载体", "TUBE-VEC-01"], ["MAT-ASM", "组装液", "TUBE-ASM-01"],
  ["MAT-CELLS", "感受态细胞", "TUBE-CELLS-01"], ["MAT-MEDIA", "培养基", "BOTTLE-MEDIA-01"],
  ["MAT-PUR", "纯化试剂", "KIT-PUR-01"], ["MAT-SCREEN", "菌落 PCR 试剂及通用引物", "KIT-SCREEN-01"],
  ["MAT-MINI", "质粒提取试剂", "KIT-MINI-01"], ["MAT-SEQ", "测序反应物料", "KIT-SEQ-01"],
  ["MAT-GLY", "冻存物料", "TUBE-GLY-01"], ["MAT-POS", "阳性对照材料", "TUBE-POS-01"],
];
const materialKeys: Partial<Record<CloningStageKey, string[]>> = { E: ["MAT-MM", "MAT-WATER"], F: ["MAT-PUR"], G: ["VEC-001", "MAT-ASM"], H: ["MAT-CELLS", "MAT-MEDIA"], J: ["MAT-MEDIA"], K: ["MAT-SCREEN"], L: ["MAT-MEDIA"], M: ["MAT-MINI"], N: ["MAT-SEQ"], P: ["MAT-GLY"] };

/** Deterministic planning only; no inventory mutations, selection results or execution claims. */
export function buildCloningPlan(input: CloningConfig, mode: CloningMode): CloningPlan {
  const config = cloningConfigSchema.parse(input); cloningModeSchema.parse(mode);
  const smart = mode === "recommended", stages: CloningStage[] = [], dishes: CloningEntity[] = [];
  const refs = new Map<string, CloningEntity>();
  const refKey = (s: string, t: number, b = 1) => `${s}:${t}:${b}`;
  for (const def of CLONING_STAGES) {
    const edge = config.edge && ["E", "G", "K"].includes(def.key);
    const controlCount = ["E", "K"].includes(def.key) ? config.controls : 0;
    const usable = CLONING_WELLS.filter(w => !edge || !isCloningEdge(w));
    const controlPositions = controlCount ? usable.slice(-controlCount) : [];
    const positions = usable.filter(w => !controlPositions.includes(w));
    if (smart && config.column) positions.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b));
    const multiplier = ["J", "K"].includes(def.key) ? config.clones : def.key === "N" ? 2 : 1;
    const groupSize = smart && config.group && ["J", "K"].includes(def.key) ? multiplier : 1;
    const capacityUnits = Math.floor(positions.length / groupSize), flat: CloningEntity[] = [];
    for (let target = 1; target <= config.samples; target++) for (let branch = 1; branch <= multiplier; branch++) {
      const n = padTarget(target), suffix = ["J", "K"].includes(def.key) ? `-C${branch}` : def.key === "N" ? branch === 1 ? "-F" : "-R" : "";
      const prefix = ({ A: "TPL", B: "OLI-F", C: "OLI-R", J: "CLN" } as Partial<Record<CloningStageKey, string>>)[def.key] ?? def.prefix;
      const entity: CloningEntity = { id: `${prefix}-${n}${suffix}`, stage: def.key, target, branch, container: "", well: "", kind: "sample", parents: [], materials: materialKeys[def.key] ?? [] };
      if (def.key === "A") Object.assign(entity, { concentration: "20 ng/µL", lot: "LOT-TPL-DEMO", length: `${720 + 3 * ((target - 1) % 9)} bp`, sequenceRef: `SEQ-TPL-${n}-v1` });
      if (["B", "C"].includes(def.key)) Object.assign(entity, { concentration: "10 µM", lot: "LOT-OLI-DEMO", length: "42 nt", sequenceRef: `SEQ-OLI-${def.key === "B" ? "F" : "R"}-${n}-v1`, pairId: `PAIR-${n}` });
      if (["J", "K"].includes(def.key)) entity.cloneId = `CLN-${n}-C${branch}`;
      refs.set(refKey(def.key, target, branch), entity); flat.push(entity);
    }
    const units: CloningEntity[][] = []; for (let i = 0; i < flat.length; i += groupSize) units.push(flat.slice(i, i + groupSize));
    const count = Math.ceil(units.length / capacityUnits), tail = units.length - (count - 1) * capacityUnits;
    const stage: CloningStage = { key: def.key, name: def.name, phase: def.phase, plates: [], capacity: positions.length, sampleCount: flat.length, splits: 0, balanced: smart && config.balance && count > 1 && tail < capacityUnits * .25 };
    let cursor = 0;
    for (let index = 0; index < count; index++) {
      const take = stage.balanced ? Math.floor(units.length / count) + (index < units.length % count ? 1 : 0) : Math.min(capacityUnits, units.length - cursor);
      const samples = units.slice(cursor, cursor + take).flat(); cursor += take;
      const plate: CloningPlate = { id: `${def.prefix}-PLAN-${padTarget(index + 1)}`, stage: def.key, samples, controls: [], blocked: edge ? CLONING_WELLS.filter(isCloningEdge) : [], free: 0, capacity: positions.length };
      samples.forEach((e, i) => { e.container = plate.id; e.well = positions[i]; });
      plate.controls = controlPositions.map((well, i) => ({ id: `QC-${plate.id}-${i + 1}`, stage: def.key, target: null, branch: 1, container: plate.id, well, kind: "control", control: i % 2 ? "POS" : "NTC", parents: [], materials: [...(materialKeys[def.key] ?? []), ...(i % 2 ? ["MAT-POS"] : [])] }));
      plate.free = 96 - samples.length - plate.controls.length - plate.blocked.length; stage.plates.push(plate);
    }
    if (["J", "K"].includes(def.key)) for (let t = 1; t <= config.samples; t++) if (new Set(Array.from({ length: config.clones }, (_, i) => refs.get(refKey(def.key, t, i + 1))!.container)).size > 1) stage.splits++;
    stages.push(stage);
  }
  const link = (entity: CloningEntity, stage: string, target: number, branch = 1, kind: CloningParent["kind"] = "material") => {
    const source = refs.get(refKey(stage, target, branch))!;
    entity.parents.push({ id: source.id, container: source.container, well: source.well, kind });
  };
  for (let target = 1; target <= config.samples; target++) {
    const dish: CloningEntity = { id: `AGAR-${padTarget(target)}`, stage: "I", target, branch: 1, container: `AGAR-PLAN-${padTarget(target)}`, well: "surface", kind: "dish", parents: [], materials: ["MAT-MEDIA"] };
    link(dish, "H", target); dishes.push(dish); refs.set(refKey("I", target), dish);
  }
  for (const entity of refs.values()) {
    const target = entity.target!;
    if (entity.stage === "E") for (const k of ["A", "B", "C"]) link(entity, k, target);
    const simple: Partial<Record<CloningEntity["stage"], string>> = { F: "E", G: "F", H: "G", J: "I", M: "L", N: "M", O: "M", P: "L" };
    const upstream = simple[entity.stage]; if (upstream) link(entity, upstream, target);
    if (entity.stage === "K") link(entity, "J", target, entity.branch);
    if (entity.stage === "L") for (let c = 1; c <= config.clones; c++) { link(entity, "J", target, c, "conditional"); link(entity, "K", target, c, "result"); }
    if (["O", "P"].includes(entity.stage)) { link(entity, "N", target, 1, "result"); link(entity, "N", target, 2, "result"); }
  }
  const plates = stages.flatMap(s => s.plates), sum = (f: (p: CloningPlate) => number) => plates.reduce((n, p) => n + f(p), 0);
  const tails = stages.filter(s => ["E", "K"].includes(s.key) && s.plates.length > 1).map(s => s.plates.at(-1)!.samples.length / s.capacity);
  return { engineVersion: CLONING_ENGINE_VERSION, planningOnly: true, sourceMode: "fictional", config, mode, stages, dishes,
    materials: materialRows.map(([id, name, container], i) => ({ id, name, container, slot: String(i + 1).padStart(2, "0"), lot: `LOT-${id}-DEMO` })),
    summary: { plates: plates.length, sampleWells: sum(p => p.samples.length), controlWells: sum(p => p.controls.length), blockedWells: sum(p => p.blocked.length), freeWells: sum(p => p.free), dishes: dishes.length, splits: stages.reduce((n, s) => n + s.splits, 0), occupancy: sum(p => p.samples.length + p.controls.length) / (plates.length * 96), minReactionTail: tails.length ? Math.min(...tails) : null },
  };
}

export const cloningSaveSchema = z.object({
  workflowId: z.number().int().positive(), nodeKey: z.string().min(1).max(64).nullable(),
  name: z.string().trim().min(1).max(255), config: cloningConfigSchema, mode: cloningModeSchema,
  expectedVersion: z.number().int().min(0), idempotencyKey: z.string().uuid(),
});

export function cloningCSV(plan: CloningPlan): string {
  const rows: (string | number)[][] = [["stage", "container", "well", "status", "target", "entity", "parents", "materials"]];
  for (const stage of plan.stages) for (const plate of stage.plates) {
    const entries = new Map([...plate.samples, ...plate.controls].map(e => [e.well, e]));
    for (const well of CLONING_WELLS) {
      const e = entries.get(well);
      rows.push([stage.key, plate.id, well, e?.kind === "control" ? "control_reserved" : e ? "sample_planned" : plate.blocked.includes(well) ? "blocked" : "empty", e?.target ?? "", e?.id ?? "", e?.parents.map(p => `${p.id}@${p.container}:${p.well}[${p.kind}]`).join(";") ?? "", e?.materials.join(";") ?? ""]);
    }
  }
  return "\uFEFF" + rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
}
