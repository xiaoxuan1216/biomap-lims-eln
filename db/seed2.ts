import { getDb } from "../api/queries/connection";
import {
  sequenceFeatures,
  sequences,
  equipment,
  equipmentBookings,
  equipmentMaintenance,
} from "./schema";
import { sql } from "drizzle-orm";

function ts(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function dateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function seed() {
  const db = getDb();
  console.log("Seeding v2 data...");

  // ─── 序列特性注释 ───
  const [featCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(sequenceFeatures);
  if (Number(featCount?.n ?? 0) === 0) {
    const seqs = await db.select().from(sequences);
    const scfv = seqs.find((s) => s.name.includes("CD19"));
    const egfp = seqs.find((s) => s.name.includes("EGFP"));
    const insulin = seqs.find((s) => s.name.includes("胰岛素"));
    const feats: (typeof sequenceFeatures.$inferInsert)[] = [];
    if (scfv) {
      const len = scfv.sequence.length;
      feats.push(
        { sequenceId: scfv.id, name: "VL 结构域 (FMC63)", type: "cds", start: 1, end: 321, strand: 1, color: "indigo", note: "轻链可变区" },
        { sequenceId: scfv.id, name: "(G4S)3 柔性接头", type: "tag", start: 322, end: Math.min(366, len), strand: 1, color: "amber", note: "连接 VL 与 VH" },
        { sequenceId: scfv.id, name: "VH 结构域 (FMC63)", type: "cds", start: Math.min(367, len), end: len, strand: 1, color: "teal", note: "重链可变区" },
      );
    }
    if (egfp) {
      feats.push(
        { sequenceId: egfp.id, name: "EGFP CDS", type: "cds", start: 1, end: egfp.sequence.length, strand: 1, color: "emerald", note: "增强型绿色荧光蛋白完整编码框" },
      );
    }
    if (insulin) {
      feats.push(
        { sequenceId: insulin.id, name: "信号肽", type: "tag", start: 1, end: 24, strand: 1, color: "cyan" },
        { sequenceId: insulin.id, name: "B 链", type: "cds", start: 25, end: 54, strand: 1, color: "teal" },
        { sequenceId: insulin.id, name: "C 肽", type: "cds", start: 57, end: 87, strand: 1, color: "amber" },
        { sequenceId: insulin.id, name: "A 链", type: "cds", start: 90, end: 110, strand: 1, color: "rose" },
      );
    }
    if (feats.length) await db.insert(sequenceFeatures).values(feats);
    console.log(`  features: ${feats.length}`);
  }

  // ─── 实验室设备 ───
  const [eqCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(equipment);
  if (Number(eqCount?.n ?? 0) === 0) {
    const eqList: (typeof equipment.$inferInsert)[] = [
      { name: "流式细胞仪", category: "analytical", model: "BD FACSCanto II", serialNo: "BD-2021-0338", status: "in_use", room: "B2-204", responsibleName: "张工", specs: "3 激光 8 色；488/633/405 nm", nextCalibrationDate: dateStr(45) },
      { name: "实时荧光定量 PCR 仪", category: "analytical", model: "QuantStudio 5", serialNo: "QS5-2022-1120", status: "available", room: "B2-203", responsibleName: "李工", specs: "96 孔 0.1 mL 模块，6 通道荧光", nextCalibrationDate: dateStr(80) },
      { name: "多功能酶标仪", category: "analytical", model: "SpectraMax i3x", serialNo: "MD-2020-0511", status: "available", room: "B2-203", responsibleName: "李工", specs: "吸收光/荧光/化学发光；支持 6–384 孔板", nextCalibrationDate: dateStr(10) },
      { name: "生物分析仪", category: "analytical", model: "Agilent 2100", serialNo: "AG-2019-0245", status: "available", room: "B2-205", responsibleName: "王工", specs: "DNA/RNA/蛋白芯片电泳质控", nextCalibrationDate: dateStr(120) },
      { name: "高通量测序仪", category: "analytical", model: "Illumina iSeq 100", serialNo: "ILM-2023-0087", status: "maintenance", room: "B2-206", responsibleName: "张工", specs: "4M reads/run，2×150 bp", nextCalibrationDate: dateStr(30) },
      { name: "高速冷冻离心机", category: "execution", model: "Eppendorf 5910 Ri", serialNo: "EP-2021-0776", status: "available", room: "B2-201", responsibleName: "公共", specs: "4×750 mL，最高 22,132 × g，-11–40°C" },
      { name: "CO₂ 细胞培养箱", category: "execution", model: "Thermo Heracell 240i", serialNo: "TH-2022-0901", status: "in_use", room: "B2-102 细胞房", responsibleName: "公共", specs: "240 L，CO₂ 0–20%，湿度 >90%" },
      { name: "恒温振荡培养箱", category: "execution", model: "INFORS Multitron", serialNo: "IF-2020-0332", status: "available", room: "B2-101", responsibleName: "公共", specs: "3 层叠加，20–300 rpm，4–60°C" },
      { name: "蛋白纯化系统", category: "execution", model: "ÄKTA pure 25", serialNo: "GE-2021-0159", status: "available", room: "B2-205", responsibleName: "王工", specs: "流速 0.001–25 mL/min，UV 190–700 nm", nextCalibrationDate: dateStr(60) },
      { name: "自动化液体处理工作站", category: "automation", model: "Hamilton Microlab STAR", serialNo: "HAM-2023-0042", status: "available", room: "B2-301 自动化岛", responsibleName: "赵工", specs: "8 通道独立移液 + 96 通道头；板位 32；支持 NGS 建库/PCR 体系构建", nextCalibrationDate: dateStr(90) },
      { name: "自动化细胞培养岛台", category: "automation", model: "自定义集成岛台 Alpha", serialNo: "ISLAND-A-01", status: "in_use", room: "B2-301 自动化岛", responsibleName: "赵工", specs: "机械臂 + 培养箱 + 离心机 + 撕膜机联动作业；支持 24 块 96 孔板并行", nextCalibrationDate: dateStr(75) },
      { name: "菌落自动挑选机器人", category: "automation", model: "Singer PIXL", serialNo: "SG-2024-0013", status: "fault", room: "B2-301 自动化岛", responsibleName: "赵工", specs: "白光/荧光成像筛选，挑取精度 ±0.1 mm", nextCalibrationDate: dateStr(-3) },
      { name: "超低温冰箱群监控系统", category: "support", model: "Thermo Smart-Vue Pro", serialNo: "SV-2022-0660", status: "available", room: "B2 全域", responsibleName: "公共", specs: "32 通道温度/CO₂/门磁监控，超限短信报警" },
    ];
    const ids: number[] = [];
    for (const e of eqList) {
      const [r] = await db.insert(equipment).values(e).$returningId();
      ids.push(r.id);
    }

    // 预约
    const flow = ids[0], qpcr = ids[1], plate = ids[2], akta = ids[8], hamilton = ids[9], island = ids[10];
    await db.insert(equipmentBookings).values([
      { equipmentId: flow, userName: "演示用户", purpose: "CAR 阳性率流式检测（EXP-0001）", startTime: ts(0, 10), endTime: ts(0, 12), status: "active" },
      { equipmentId: flow, userName: "陈研究员", purpose: "T 细胞分型 Panel", startTime: ts(0, 14), endTime: ts(0, 16), status: "active" },
      { equipmentId: qpcr, userName: "演示用户", purpose: "IFN-γ 表达定量", startTime: ts(1, 9), endTime: ts(1, 11), status: "active" },
      { equipmentId: plate, userName: "陈研究员", purpose: "BCA 蛋白定量", startTime: ts(1, 13), endTime: ts(1, 14), status: "active" },
      { equipmentId: akta, userName: "王工", purpose: "scFv 亲和纯化", startTime: ts(2, 9, 30), endTime: ts(2, 17), status: "active" },
      { equipmentId: hamilton, userName: "演示用户", purpose: "qPCR 体系自动化构建", startTime: ts(1, 8, 30), endTime: ts(1, 9, 30), status: "active" },
      { equipmentId: island, userName: "赵工", purpose: "96 孔板杀伤实验自动化孵育", startTime: ts(0, 8), endTime: ts(0, 20), status: "active" },
      { equipmentId: flow, userName: "演示用户", purpose: "杀伤实验收尾检测", startTime: ts(-3, 10), endTime: ts(-3, 12), status: "completed" },
    ]);

    // 维护记录
    const ngs = ids[4], pixl = ids[11];
    await db.insert(equipmentMaintenance).values([
      { equipmentId: ngs, type: "maintenance", description: "光路校准与流动槽更换，年度保养", performedBy: "Illumina 工程师", performedAt: ts(-2, 14), nextDueDate: dateStr(30) },
      { equipmentId: pixl, type: "repair", description: "挑针头定位偏移，待厂商备件更换", performedBy: "赵工", performedAt: ts(-1, 11), nextDueDate: dateStr(7) },
      { equipmentId: plate, type: "calibration", description: "吸光度标准板计量校准", performedBy: "计量院", performedAt: ts(-80, 10), nextDueDate: dateStr(10) },
      { equipmentId: flow, type: "calibration", description: "CST 质控微球验证，CV 均 <3%", performedBy: "张工", performedAt: ts(-15, 9), nextDueDate: dateStr(45) },
    ]);
    console.log("  equipment: 13, bookings: 8, maintenance: 4");
  }

  console.log("Seed v2 done.");
  return;
}

// CLI 入口：直接运行该脚本时执行（被 import 时不执行）
const isMain = process.argv[1]?.endsWith("seed2.ts") ?? false;
if (isMain) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
