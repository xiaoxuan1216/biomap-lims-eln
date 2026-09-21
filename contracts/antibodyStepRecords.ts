import { stepRecordSpecSchema, type StepRecordSpec } from "./stepRecords";

// Fields for observations; these provide no operating settings or acceptance thresholds.
type Field = [string, string, string, ("text" | "number" | "datetime")?, string?, boolean?];
const record = (fields: Field[]): StepRecordSpec => stepRecordSpecSchema.parse({ fields: fields.map(([key, label, labelEn, kind = "text", unit = "", required = true]) => ({ key, label, labelEn, kind, unit, required })) });
const time: Field = ["observedAt", "实际记录时间", "Observed at", "datetime"];
const method: Field = ["method", "实际方法与版本", "Actual method and version"];
const vessel: Field = ["vessel", "容器编号与位置", "Container ID and position"];
const note: Field = ["deviation", "观察或偏差（选填）", "Observation or deviation (optional)", "text", "", false];

export const antibodyStepRecords: Record<string, Record<string, StepRecordSpec>> = {
  cloning: {
    identity: record([["antibody", "抗体或构建体编号", "Antibody or construct ID"], ["chain", "链别或构型", "Chain or format"], ["design", "设计与目标序列版本", "Design and target sequence version"], ["vector", "载体编号与版本", "Vector ID and version"], note]),
    assembly: record([["reaction", "克隆反应编号", "Cloning reaction ID"], method, ["reagentLot", "关键试剂批号", "Key reagent lots"], vessel, time, note]),
    clone_selection: record([["clone", "克隆编号", "Clone ID"], ["sourceReaction", "来源反应编号", "Source reaction ID"], ["hostLot", "宿主与培养批次", "Host and culture lot"], vessel, ["screen", "筛选方法与结论", "Screening method and conclusion"], time, note]),
    plasmid_prep: record([["clone", "来源克隆编号", "Source clone ID"], ["plasmidLot", "质粒制备批次", "Plasmid preparation lot"], method, ["concentration", "实测浓度", "Measured concentration", "number", "ng/µL"], ["volume", "实际回收体积", "Recovered volume", "number", "µL"], vessel, time, note]),
    sequence_confirmation: record([["plasmidLot", "质粒制备批次", "Plasmid preparation lot"], ["targetVersion", "比对目标序列版本", "Reference sequence version"], ["sequenceRef", "测序批次与记录编号", "Sequencing lot and record ID"], ["conclusion", "序列比对结论", "Sequence comparison conclusion"], ["reviewer", "序列核对人员", "Sequence checked by"], time, note]),
  },
  expression: {
    cell_readiness: record([["host", "细胞系与来源批次", "Cell line and source lot"], ["cultureLot", "培养批次", "Culture lot"], ["passage", "细胞代次", "Cell passage"], ["density", "实测活细胞密度", "Measured viable cell density", "number", "10⁶ cells/mL"], ["viability", "实测细胞活率", "Measured cell viability", "number", "%"], vessel, time, note]),
    transfection: record([["cultureLot", "培养批次", "Culture lot"], ["transfectionLot", "转染批次", "Transfection lot"], ["heavyPlasmid", "重链质粒批号", "Heavy-chain plasmid lot"], ["lightPlasmid", "轻链质粒批号", "Light-chain plasmid lot"], ["heavyMass", "实际重链 DNA 用量", "Actual heavy-chain DNA amount", "number", "µg"], ["lightMass", "实际轻链 DNA 用量", "Actual light-chain DNA amount", "number", "µg"], ["volume", "实际培养体积", "Actual culture volume", "number", "mL"], ["reagentLot", "转染试剂批号", "Transfection reagent lot"], method, time, note]),
    culture: record([["cultureLot", "培养批次", "Culture lot"], vessel, time, ["condition", "实际培养条件与补料记录", "Actual culture conditions and feeds"], ["density", "实测活细胞密度", "Measured viable cell density", "number", "10⁶ cells/mL", false], ["viability", "实测细胞活率", "Measured cell viability", "number", "%", false], ["observation", "过程观察与处理", "Observation and action"], note]),
    harvest: record([["cultureLot", "培养批次", "Culture lot"], ["harvestLot", "收获批号", "Harvest lot"], time, method, ["volume", "实际澄清上清体积", "Clarified harvest volume", "number", "mL"], vessel, note]),
    harvest_qc: record([["harvestLot", "收获批号", "Harvest lot"], method, ["dilution", "检测稀释倍数", "Assay dilution factor", "number", "×"], ["storage", "保存条件与位置", "Storage conditions and location"], ["disposition", "上清处理结论", "Harvest disposition"], time, note]),
  },
  purification: {
    input_check: record([["purificationLot", "纯化批号", "Purification lot"], method, ["route", "实际纯化路线", "Actual purification route"], ["volume", "实际输入体积", "Actual input volume", "number", "mL"], ["concentration", "输入蛋白浓度（如已测定）", "Input protein concentration (if measured)", "number", "mg/mL", false], ["mediumLot", "介质或磁珠批号", "Resin or bead lot"], time, note]),
    capture: record([["purificationLot", "纯化批号", "Purification lot"], method, ["carrier", "层析柱或磁珠板编号", "Column or bead plate ID"], ["program", "程序或运行序列编号", "Program or run sequence ID"], ["fraction", "洗脱组分与收集位置", "Elution fractions and collection positions"], ["volume", "实际收集体积", "Collected volume", "number", "mL"], ["bufferLot", "缓冲液批号", "Buffer lots"], time, note]),
    polish: record([["purificationLot", "纯化批号", "Purification lot"], ["sourceFraction", "来源组分", "Source fractions"], ["treatment", "实际后处理或不适用依据", "Actual treatment or reason not applicable"], ["buffer", "目标缓冲液及批号", "Target buffer and lot"], ["volume", "处理后体积", "Volume after treatment", "number", "mL"], vessel, time, note]),
    pool_qc: record([["purificationLot", "纯化批号", "Purification lot"], ["pooledFractions", "合并组分编号", "Pooled fraction IDs"], ["volume", "终产物体积", "Final volume", "number", "mL"], ["concentration", "终产物浓度", "Final concentration", "number", "mg/mL"], ["buffer", "终产物缓冲液", "Final buffer"], ["storage", "保存条件与位置", "Storage conditions and location"], time, note]),
  },
  characterization: {
    identity: record([["panel", "本批检测组合", "Assay panel for this batch"], ["allocation", "分装编号、检测项目与分配量", "Aliquot IDs, assays and allocated amounts"], ["control", "对照与参考品批次", "Control and reference lots"], time, note]),
    purity: record([method, ["sequence", "仪器运行序列编号", "Instrument sequence ID"], vessel, ["dilution", "检测稀释倍数", "Assay dilution factor", "number", "×"], ["analysis", "积分或分析方法与版本", "Integration or analysis method and version"], ["suitability", "系统适用性结论", "System suitability conclusion"], time, note]),
    binding: record([method, ["targetLot", "靶标与批号", "Target and lot"], ["sensorLot", "传感器或检测板批号", "Sensor or assay plate lot"], vessel, ["series", "样本浓度系列及单位", "Sample concentration series and unit"], ["reference", "参比与空白设置", "Reference and blank settings"], ["fit", "拟合模型与分析版本", "Fit model and analysis version"], time, note]),
    stability: record([method, ["program", "温控程序与版本", "Thermal program and version"], vessel, ["concentration", "实际检测浓度", "Actual assay concentration", "number", "mg/mL"], ["buffer", "检测缓冲液", "Assay buffer"], ["analysis", "曲线分析方法与版本", "Curve analysis method and version"], time, note]),
    report: record([["coverage", "检测覆盖与缺项说明", "Assay coverage and gaps"], ["conclusion", "综合结论", "Overall conclusion"], ["nextAction", "后续处理建议", "Proposed next action"], time, note]),
  },
};

// References are part of the method draft and require the same publication review as other requirements.
const carry: Record<string, Record<string, Record<string, NonNullable<StepRecordSpec["fields"][number]["reuse"]>>>> = {
  cloning: {
    clone_selection: { sourceReaction: { kind: "step", nodeKey: "assembly", fieldKey: "reaction" } },
    plasmid_prep: { clone: { kind: "step", nodeKey: "clone_selection", fieldKey: "clone" } },
    sequence_confirmation: { plasmidLot: { kind: "step", nodeKey: "plasmid_prep", fieldKey: "plasmidLot" }, targetVersion: { kind: "step", nodeKey: "identity", fieldKey: "design" } },
  },
  expression: {
    transfection: { cultureLot: { kind: "step", nodeKey: "cell_readiness", fieldKey: "cultureLot" }, heavyPlasmid: { kind: "identity", field: "lot", chain: "HC" }, lightPlasmid: { kind: "identity", field: "lot", chain: "LC" } },
    culture: { cultureLot: { kind: "step", nodeKey: "transfection", fieldKey: "cultureLot" } },
    harvest: { cultureLot: { kind: "step", nodeKey: "culture", fieldKey: "cultureLot" } },
    harvest_qc: { harvestLot: { kind: "step", nodeKey: "harvest", fieldKey: "harvestLot" } },
  },
  purification: {
    capture: { purificationLot: { kind: "step", nodeKey: "input_check", fieldKey: "purificationLot" } },
    polish: { purificationLot: { kind: "step", nodeKey: "capture", fieldKey: "purificationLot" }, sourceFraction: { kind: "step", nodeKey: "capture", fieldKey: "fraction" } },
    pool_qc: { purificationLot: { kind: "step", nodeKey: "polish", fieldKey: "purificationLot" } },
  },
};
for (const [stage, nodes] of Object.entries(carry)) for (const [nodeKey, fields] of Object.entries(nodes)) {
  antibodyStepRecords[stage][nodeKey].fields = antibodyStepRecords[stage][nodeKey].fields.map(field => fields[field.key] ? { ...field, reuse: fields[field.key] } : field);
}
