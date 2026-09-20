import { z } from "zod";

export const PLATE_STAGES = ["cloning", "expression", "purification", "characterization"] as const;
export const PLATE_STAGE_LABELS = { cloning: "分子克隆", expression: "转染表达", purification: "纯化", characterization: "表征" };
export const PLATE_FORMATS = { "24": [4, 6], "48": [6, 8], "96": [8, 12], "384": [16, 24], rack24: [4, 6] } as const;
export const plateConfigSchema = z.object({
  stage: z.enum(PLATE_STAGES), format: z.enum(["24", "48", "96", "384", "rack24"]),
  sampleIds: z.array(z.number().int().positive()).min(1).max(200).refine(ids => new Set(ids).size === ids.length, "样本不能重复"),
  copies: z.number().int().min(1).max(24), avoidEdges: z.boolean(),
  order: z.enum(["row", "column"]), pairChains: z.boolean(),
  controls: z.array(z.string().trim().min(1).max(80)).max(12),
});
export const savePlateSchema = z.object({ workflowId: z.number().int().positive(), nodeKey: z.string().max(64).nullable(), name: z.string().trim().min(1).max(255), config: plateConfigSchema, expectedVersion: z.number().int().min(0), idempotencyKey: z.string().uuid() });
export type PlateConfig = z.infer<typeof plateConfigSchema>;
export type PlateSample = { id: number; sku: string; name: string; type: string; identity: { antibodyId: string; chain: string; origin: string; originId: number } | null };
export type PlateEntry = { plate: number; well: string; sampleIds: number[]; label: string; copy: number; kind: "sample" | "control" };
export type SamplePlatePlan = { schemaVersion: "1"; config: PlateConfig; samples: PlateSample[]; entries: PlateEntry[]; plateCount: number };
export type FrozenSamplePlate = { id: number; version: number; name: string; nodeKey: string | null; snapshotHash: string; plan: SamplePlatePlan };

export function plateWells(format: PlateConfig["format"], avoidEdges = false, order: PlateConfig["order"] = "row") {
  const [rows, cols] = PLATE_FORMATS[format];
  const positions = Array.from({ length: rows * cols }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols }));
  if (order === "column") positions.sort((a, b) => a.col - b.col || a.row - b.row);
  return positions.filter(p => !avoidEdges || (p.row > 0 && p.col > 0 && p.row < rows - 1 && p.col < cols - 1)).map(p => `${String.fromCharCode(65 + p.row)}${p.col + 1}`);
}
export function buildSamplePlate(raw: PlateConfig, catalog: PlateSample[]): SamplePlatePlan {
  const config = plateConfigSchema.parse(raw);
  const samples = config.sampleIds.map(id => { const item = catalog.find(s => s.id === id); if (!item) throw new Error("样本不存在或已归档"); return item; });
  let groups = samples.map(s => ({ ids: [s.id], label: s.sku }));
  if (config.pairChains) {
    if (config.stage !== "expression") throw new Error("重轻链配对仅适用于转染表达");
    if (samples.some(s => !s.identity || !["HC", "LC"].includes(s.identity.chain))) throw new Error("配对需要已确认的重链和轻链身份");
    groups = [...new Set(samples.map(s => s.identity!.antibodyId))].map(antibodyId => {
      const pair = samples.filter(s => s.identity!.antibodyId === antibodyId);
      if (pair.length !== 2 || !pair.some(s => s.identity!.chain === "HC") || !pair.some(s => s.identity!.chain === "LC")) throw new Error("每个抗体请选择一个重链批次和一个轻链批次");
      return { ids: pair.map(s => s.id), label: antibodyId };
    });
  }
  const wells = plateWells(config.format, config.avoidEdges, config.order);
  const capacity = wells.length - config.controls.length;
  if (capacity < 1) throw new Error("对照位占满了可用孔位，请调整板型或对照数量");
  const planned = groups.flatMap(group => Array.from({ length: config.copies }, (_, i) => ({ sampleIds: group.ids, label: group.label, copy: i + 1 })));
  if (planned.length > 4000) throw new Error("本次排板超过 4000 个样本位置，请分批规划");
  const plateCount = Math.ceil(planned.length / capacity);
  const entries: PlateEntry[] = [];
  for (let plate = 1; plate <= plateCount; plate++) {
    config.controls.forEach((label, i) => entries.push({ plate, well: wells[i], label, sampleIds: [], copy: 1, kind: "control" }));
    planned.slice((plate - 1) * capacity, plate * capacity).forEach((entry, i) => entries.push({ ...entry, plate, well: wells[i + config.controls.length], kind: "sample" }));
  }
  return { schemaVersion: "1", config, samples, entries, plateCount };
}

export function plateCoverage(plans: SamplePlatePlan[], sampleIds: number[]) {
  const covered = new Set(plans.flatMap(plan => plan.config.sampleIds));
  return sampleIds.length > 0 && sampleIds.every(id => covered.has(id)) && [...covered].every(id => sampleIds.includes(id));
}
