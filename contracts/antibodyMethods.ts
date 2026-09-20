import { methodSpecSchema, type MethodSpec } from "./method";
import type { z } from "zod";
import { methodStageSchema } from "./methodOutputs";
import { antibodyStepRecords } from "./antibodyStepRecords";
export type AntibodyStage = z.infer<typeof methodStageSchema>;
export const antibodyStageNames: Record<AntibodyStage, { zh: string; en: string }> = {
 cloning: { zh: "分子克隆与序列确认", en: "Molecular cloning and sequence verification" },
 expression: { zh: "哺乳动物转染表达与收获", en: "Mammalian transfection, expression and harvest" },
 purification: { zh: "抗体纯化与批次放行", en: "Antibody purification and lot release" },
 characterization: { zh: "抗体表征与结果复核", en: "Antibody characterization and result review" },
};
// Business record scaffolds only. No scientific operating parameters, release
// thresholds or instrument qualifications are approved by these definitions.
const steps: Record<AntibodyStage, Array<[string, string, string, string, string]>> = {
 cloning: [
  ["identity", "核对目标、载体与构建体", "Verify target, vector and constructs", "抗体编号、重轻链设计、载体与输入 DNA 编号", "保留设计版本、序列文件及输入样本对应关系"],
  ["assembly", "记录分子克隆操作", "Record molecular cloning", "负责人批准的克隆 SOP 与试剂批号", "记录实际操作、反应批次及任何偏差"],
  ["clone_selection", "记录转化、培养与克隆筛选", "Record transformation, culture and clone selection", "克隆反应与培养体系", "记录克隆编号、培养批次及筛选原始记录"],
  ["plasmid_prep", "记录质粒制备与定量", "Record plasmid preparation and quantitation", "筛选后的克隆及提取方法", "保留浓度、纯度和实际回收量的原始数据"],
  ["sequence_confirmation", "确认序列并登记表达质粒", "Verify sequences and register expression plasmids", "质粒、目标序列及测序原始文件", "依据批准标准核对序列，登记对应重链或轻链质粒"],
 ],
 expression: [
  ["cell_readiness", "记录细胞状态与培养批次", "Record cell readiness and culture lot", "实际宿主细胞、培养批次及细胞状态", "记录细胞身份、代次、活率和实验适用性依据"],
  ["transfection", "核对重轻链配对并记录转染", "Verify chain pairing and record transfection", "同一抗体的重链与轻链表达质粒", "按批准 SOP 记录实际 DNA 用量、比例、试剂批号与转染条件"],
  ["culture", "记录表达培养与过程观察", "Record expression culture and observations", "转染后的表达培养批次", "保留培养时间、条件、观察及中间检查的原始记录"],
  ["harvest", "记录收获与澄清", "Record harvest and clarification", "表达培养批次与收获条件", "记录收获时间、处理过程及实际获得量"],
  ["harvest_qc", "登记表达上清及定量结果", "Register expression harvest and quantitation", "澄清上清与定量原始文件", "登记表达批次、来源质粒、储位及浓度结果"],
 ],
 purification: [
  ["input_check", "核对表达批次与纯化方案", "Verify expression lot and purification method", "已放行的表达上清与批准纯化 SOP", "确认抗体格式与所用捕获、精纯方法的适用性"],
  ["capture", "记录捕获与洗脱", "Record capture and elution", "表达上清与经确认的介质或色谱方法", "保留色谱、收集组分、实际用量与偏差记录"],
  ["polish", "记录精纯或缓冲液置换", "Record polishing or buffer exchange", "捕获产物与批准的后处理方法", "记录实际使用的后处理、缓冲液、组分及回收情况"],
  ["pool_qc", "登记纯化抗体批次", "Register purified antibody lot", "合并后抗体、定量及纯度原始文件", "登记实际体积、浓度、纯度、批次、储位与来源"],
 ],
 characterization: [
  ["identity", "核对抗体批次与检测需求", "Verify antibody lot and assay requirements", "已放行的纯化抗体与本批检测要求", "确认样本身份、用量、方法版本与样本分配"],
  ["purity", "采集纯度与聚集状态", "Measure purity and aggregation", "抗体样本与批准的纯度分析方法", "上传原始数据并记录单体比例等方法规定指标"],
  ["binding", "采集结合动力学", "Measure binding kinetics", "抗体样本、靶标与批准的结合分析方法", "保留传感器或色谱原始数据、拟合依据及结合指标"],
  ["stability", "采集热稳定性", "Measure thermal stability", "抗体样本与批准的热稳定性方法", "保留原始曲线及方法规定的稳定性指标"],
  ["report", "核对检测覆盖与形成结论", "Check assay coverage and document conclusions", "各项原始文件与样本指标", "对照实际用途核对检测覆盖、异常和待补充项目后提交复核"],
 ],
};
export function antibodyMethodDraft(stage: AntibodyStage, lang: "zh" | "en" = "zh") {
 const instrumentSteps: Record<AntibodyStage, string[]> = { cloning: ["plasmid_prep"], expression: ["culture"], purification: ["capture"], characterization: ["purity", "binding", "stability"] };
 const nodes = steps[stage].map(([nodeKey, zh, en], index) => ({ nodeKey, label: lang === "en" ? en : zh, type: instrumentSteps[stage].includes(nodeKey) ? "equipment" as const : "data" as const, posX: index * 260, posY: 0 }));
 const spec = methodSpecSchema.parse({ stage, inputTypes: stage === "cloning" ? ["other", "plasmid"] : stage === "expression" ? ["plasmid"] : stage === "purification" ? ["protein"] : ["antibody"], nodes: Object.fromEntries(steps[stage].map(([key, , , input, completion]) => [key, { input: lang === "en" ? "Confirm the actual samples, materials and approved SOP for this step." : input, output: lang === "en" ? "Traceable operation record and raw files" : "可追溯的操作记录与原始文件", completion: lang === "en" ? "Document actual operations and observations against the approved SOP, including any deviation." : completion }])) });
 const field = (key: string, label: string, labelEn: string) => ({ key, label, labelEn });
 const metric = (key: string, label: string, labelEn: string, unit: string, kind: "text" | "number" = "number") => ({ key, label, labelEn, unit, kind, required: true });
 if (stage !== "characterization") {
   const key = nodes.at(-1)!.nodeKey;
   spec.nodes[key] = { ...spec.nodes[key], resultRequired: true, resultsOn: "outputs", produces: {
     label: stage === "cloning" ? "确认序列的表达质粒" : stage === "expression" ? "表达上清" : "纯化抗体",
     labelEn: stage === "cloning" ? "Sequence-verified expression plasmid" : stage === "expression" ? "Expression harvest" : "Purified antibody",
     type: stage === "cloning" ? "plasmid" : stage === "expression" ? "protein" : "antibody",
     unit: stage === "cloning" ? "µg" : "mL", minCount: 1, maxCount: 200, requiresSequence: stage === "cloning", requireAllInputs: true,
     relation: stage === "cloning" ? "assembled_from" : stage === "expression" ? "expressed_from" : "purified_from",
     parentPolicy: stage === "cloning" ? "selected_inputs" : stage === "expression" ? "paired_hc_lc" : "same_antibody",
     requiredMetadata: stage === "cloning" ? [field("constructLot", "构建体与克隆批号", "Construct and clone lot"), field("sequenceReview", "序列确认依据", "Sequence verification reference")] : stage === "expression" ? [field("host", "实际表达宿主", "Actual expression host"), field("cultureLot", "培养批次", "Culture lot"), field("transfectionRecord", "转染记录编号", "Transfection record"), field("harvestTime", "实际收获时间", "Actual harvest time")] : [field("purificationLot", "纯化批号", "Purification lot"), field("buffer", "终产物缓冲液", "Final buffer"), field("fractionRecord", "收集组分记录", "Collected fraction record")],
   }, measurements: stage === "cloning" ? [metric("sequence_match", "序列确认结论", "Sequence verification", "", "text"), metric("concentration", "质粒浓度", "Plasmid concentration", "ng/µL")] : stage === "expression" ? [metric("concentration", "表达上清浓度", "Harvest concentration", "mg/mL")] : [metric("concentration", "抗体浓度", "Antibody concentration", "mg/mL"), metric("purity", "纯度", "Purity", "%")] };
 } else {
   spec.nodes.purity = { ...spec.nodes.purity, resultRequired: true, measurements: [metric("monomer", "单体比例", "Monomer proportion", "%")] };
   spec.nodes.binding = { ...spec.nodes.binding, resultRequired: true, measurements: [metric("kd", "平衡解离常数 KD", "Equilibrium dissociation constant KD", "nM"), metric("fit_review", "拟合质量与适用性", "Fit quality and applicability", "", "text")] };
   spec.nodes.stability = { ...spec.nodes.stability, resultRequired: true, measurements: [metric("tm", "热转变温度", "Thermal transition temperature", "°C")] };
 }
 for (const [key, record] of Object.entries(antibodyStepRecords[stage])) {
   spec.nodes[key] = { ...spec.nodes[key], record, evidenceRequired: false };
 }
 return { name: antibodyStageNames[stage][lang], description: lang === "en" ? "Method draft for antibody R&D records. The method owner must confirm the actual SOP, equipment, materials, assay coverage and acceptance criteria before publication. No scientific operating parameters are approved by this scaffold." : "抗体研发记录方法草稿。发布前由方法负责人确认实际 SOP、设备、物料、检测覆盖和验收标准；此草稿不预先批准实验操作参数。", nodes, edges: nodes.slice(1).map((node, index) => ({ edgeKey: `e${index + 1}`, sourceKey: nodes[index].nodeKey, targetKey: node.nodeKey })), spec: methodSpecSchema.parse(spec) as MethodSpec };
}
