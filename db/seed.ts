import { getDb } from "../api/queries/connection";
import {
  projects,
  experiments,
  experimentSamples,
  samples,
  storageLocations,
  stockTransactions,
  sequences,
  activities,
} from "./schema";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // 清空业务表（幂等种子）
  await db.delete(experimentSamples);
  await db.delete(stockTransactions);
  await db.delete(experiments);
  await db.delete(samples);
  await db.delete(storageLocations);
  await db.delete(projects);
  await db.delete(sequences);
  await db.delete(activities);

  // ─── 项目 ───
  const [p1] = await db
    .insert(projects)
    .values({
      name: "CAR-T 细胞疗法开发",
      description: "针对 CD19 靶点的第四代 CAR-T 构建与体外功能验证，包含慢病毒包装、T 细胞转导与杀伤实验。",
      color: "teal",
      status: "active",
    })
    .$returningId();
  const [p2] = await db
    .insert(projects)
    .values({
      name: "AAV 载体规模化生产",
      description: "建立 HEK293 三质粒瞬转 AAV 生产工艺，优化滴度与空壳率，支持下游纯化放大。",
      color: "indigo",
      status: "active",
    })
    .$returningId();
  const [p3] = await db
    .insert(projects)
    .values({
      name: "单细胞测序平台搭建",
      description: "10x Genomics 单细胞 RNA-seq 流程建立与质控标准制定。",
      color: "amber",
      status: "on_hold",
    })
    .$returningId();

  // ─── 实验 ───
  const elnContent = (extra: object[]) =>
    JSON.stringify([
      { id: "b1", type: "heading", text: "实验目的" },
      {
        id: "b2",
        type: "text",
        text: "验证第四代 CD19-CAR 慢病毒载体对原代 T 细胞的转导效率，并评估 CAR-T 细胞对 Nalm6 靶细胞的特异性杀伤活性。",
      },
      { id: "b3", type: "heading", text: "材料与试剂" },
      {
        id: "b4",
        type: "checklist",
        items: [
          { id: "m1", text: "原代人 T 细胞（供体 D-042）", done: true },
          { id: "m2", text: "CD19-CAR 慢病毒（MOI=5）", done: true },
          { id: "m3", text: "X-VIVO 15 培养基 + IL-2 (200 IU/mL)", done: true },
          { id: "m4", text: "Nalm6-luc 靶细胞", done: false },
        ],
      },
      { id: "b5", type: "heading", text: "实验步骤" },
      {
        id: "b6",
        type: "checklist",
        items: [
          { id: "s1", text: "Day 0：复苏 T 细胞，CD3/CD28 磁珠激活 24h", done: true },
          { id: "s2", text: "Day 1：按 MOI=5 加入慢病毒，离心转导 90 min", done: true },
          { id: "s3", text: "Day 3：流式检测 CAR 表达率", done: true },
          { id: "s4", text: "Day 7：与 Nalm6-luc 按 5:1 / 1:1 / 0.2:1 效靶比共孵育 16h", done: false },
          { id: "s5", text: "荧光素酶法检测杀伤率，qPCR 检测 IFN-γ 释放", done: false },
        ],
      },
      { id: "b7", type: "heading", text: "结果与结论" },
      {
        id: "b8",
        type: "text",
        text: "Day 3 流式结果显示 CAR 阳性率 58.3%，活率 91%。杀伤实验待完成。",
      },
      ...extra,
    ]);

  const [e1] = await db
    .insert(experiments)
    .values({
      code: "EXP-0001",
      projectId: p1.id,
      title: "CD19-CAR 慢病毒转导效率优化",
      objective: "优化 MOI 与离心转导条件，目标 CAR 阳性率 ≥ 50%",
      status: "in_progress",
      content: elnContent([]),
      createdByName: "演示用户",
    })
    .$returningId();
  const [e2] = await db
    .insert(experiments)
    .values({
      code: "EXP-0002",
      projectId: p1.id,
      title: "CAR-T 体外杀伤实验（效靶比梯度）",
      objective: "评估不同效靶比下的特异性裂解率",
      status: "planning",
      content: elnContent([]),
      createdByName: "演示用户",
    })
    .$returningId();
  await db.insert(experiments).values({
    code: "EXP-0003",
    projectId: p1.id,
    title: "CAR 载体测序验证",
    objective: "Sanger 测序验证 CD19-CAR 质粒阅读框正确性",
    status: "signed",
    content: JSON.stringify([
      { id: "b1", type: "heading", text: "结论" },
      {
        id: "b2",
        type: "text",
        text: "测序结果与参考序列 100% 匹配，scFv 阅读框完整，无移码突变。质粒可用于下游病毒包装。",
      },
    ]),
    signedByName: "演示用户",
    signedAt: new Date(Date.now() - 3 * 86400000),
    createdByName: "演示用户",
  });
  await db.insert(experiments).values({
    code: "EXP-0004",
    projectId: p2.id,
    title: "AAV9 三质粒瞬转条件摸索",
    objective: "比较 PEI 与磷酸钙转染的病毒滴度差异",
    status: "in_progress",
    content: JSON.stringify([
      { id: "b1", type: "heading", text: "实验目的" },
      { id: "b2", type: "text", text: "比较两种转染体系下 AAV9 的基因组滴度（GC/mL）与感染滴度。" },
    ]),
    createdByName: "演示用户",
  });
  await db.insert(experiments).values({
    code: "EXP-0005",
    projectId: p2.id,
    title: "碘克沙醇梯度纯化 AAV",
    objective: "建立超速离心纯化流程，控制空壳率 < 15%",
    status: "completed",
    content: JSON.stringify([
      { id: "b1", type: "heading", text: "结果" },
      { id: "b2", type: "text", text: "纯化后滴度 3.2E13 GC/mL，空壳率 11.4%，达到质量标准。" },
    ]),
    createdByName: "演示用户",
  });

  // ─── 存储位置 ───
  const [lab] = await db
    .insert(storageLocations)
    .values({ name: "B2 实验区", type: "lab" })
    .$returningId();
  const [freezer1] = await db
    .insert(storageLocations)
    .values({ name: "-80°C 冰箱 1 号", type: "freezer", parentId: lab.id, temperature: "-80°C" })
    .$returningId();
  const [freezer2] = await db
    .insert(storageLocations)
    .values({ name: "液氮罐 A", type: "freezer", parentId: lab.id, temperature: "-196°C" })
    .$returningId();
  const [fridge] = await db
    .insert(storageLocations)
    .values({ name: "4°C 冷藏柜", type: "fridge", parentId: lab.id, temperature: "4°C" })
    .$returningId();
  const [shelf1] = await db
    .insert(storageLocations)
    .values({ name: "1 号冰箱 · 第 2 层", type: "shelf", parentId: freezer1.id })
    .$returningId();
  const [box1] = await db
    .insert(storageLocations)
    .values({ name: "质粒盒 A", type: "box", parentId: shelf1.id, rows: 9, cols: 9 })
    .$returningId();
  const [box2] = await db
    .insert(storageLocations)
    .values({ name: "细胞株盒 1", type: "box", parentId: freezer2.id, rows: 10, cols: 10 })
    .$returningId();
  const [box3] = await db
    .insert(storageLocations)
    .values({ name: "抗体盒", type: "box", parentId: fridge.id, rows: 9, cols: 9 })
    .$returningId();

  // ─── 样本 ───
  const smp = async (data: {
    sku: string;
    name: string;
    type: (typeof samples.$inferInsert)["type"];
    quantity: number;
    unit?: string;
    alertThreshold?: number | null;
    locationId?: number | null;
    boxRow?: number | null;
    boxCol?: number | null;
    projectId?: number | null;
    expiryDate?: string | null;
    notes?: string;
  }) => {
    const [r] = await db
      .insert(samples)
      .values({
        sku: data.sku,
        name: data.name,
        type: data.type,
        quantity: data.quantity,
        unit: data.unit ?? "管",
        alertThreshold: data.alertThreshold ?? null,
        locationId: data.locationId ?? null,
        boxRow: data.boxRow ?? null,
        boxCol: data.boxCol ?? null,
        projectId: data.projectId ?? null,
        expiryDate: data.expiryDate ?? null,
        notes: data.notes ?? null,
        createdByName: "演示用户",
      })
      .$returningId();
    await db.insert(stockTransactions).values({
      sampleId: r.id,
      delta: data.quantity,
      reason: "restock",
      note: "初始入库",
      userName: "演示用户",
    });
    return r.id;
  };

  const sPlasmid1 = await smp({
    sku: "SMP-0001", name: "pLenti-CD19-CAR-4G 质粒", type: "plasmid", quantity: 25, unit: "µg",
    alertThreshold: 10, locationId: box1.id, boxRow: 1, boxCol: 1, projectId: p1.id,
    expiryDate: daysFromNow(400), notes: "第四代 CAR，含 4-1BB + CD28 共刺激域",
  });
  await smp({
    sku: "SMP-0002", name: "pMD2.G 包膜质粒", type: "plasmid", quantity: 40, unit: "µg",
    alertThreshold: 10, locationId: box1.id, boxRow: 1, boxCol: 2, projectId: p1.id,
    expiryDate: daysFromNow(500),
  });
  await smp({
    sku: "SMP-0003", name: "psPAX2 包装质粒", type: "plasmid", quantity: 8, unit: "µg",
    alertThreshold: 10, locationId: box1.id, boxRow: 1, boxCol: 3, projectId: p1.id,
    expiryDate: daysFromNow(20),
  });
  const sCell1 = await smp({
    sku: "SMP-0004", name: "原代人 T 细胞（供体 D-042）", type: "cell_line", quantity: 5, unit: "支",
    alertThreshold: 2, locationId: box2.id, boxRow: 1, boxCol: 1, projectId: p1.id,
    notes: "1E7 cells/支，液氮保存",
  });
  await smp({
    sku: "SMP-0005", name: "Nalm6-luc 细胞株", type: "cell_line", quantity: 3, unit: "支",
    alertThreshold: 2, locationId: box2.id, boxRow: 1, boxCol: 2, projectId: p1.id,
  });
  await smp({
    sku: "SMP-0006", name: "HEK293T 细胞株", type: "cell_line", quantity: 8, unit: "支",
    alertThreshold: 3, locationId: box2.id, boxRow: 2, boxCol: 1, projectId: p2.id,
  });
  const sAb1 = await smp({
    sku: "SMP-0007", name: "抗 CD19-PE 流式抗体", type: "antibody", quantity: 50, unit: "µL",
    alertThreshold: 20, locationId: box3.id, boxRow: 1, boxCol: 1, projectId: p1.id,
    expiryDate: daysFromNow(15),
  });
  await smp({
    sku: "SMP-0008", name: "抗 CD3/CD28 激活磁珠", type: "reagent", quantity: 2, unit: "mL",
    alertThreshold: 1, locationId: box3.id, boxRow: 1, boxCol: 2, projectId: p1.id,
    expiryDate: daysFromNow(90),
  });
  await smp({
    sku: "SMP-0009", name: "X-VIVO 15 无血清培养基", type: "reagent", quantity: 6, unit: "瓶",
    alertThreshold: 3, locationId: fridge.id, projectId: p1.id, expiryDate: daysFromNow(120),
  });
  await smp({
    sku: "SMP-0010", name: "重组人 IL-2 (200 IU/µL)", type: "protein", quantity: 100, unit: "µL",
    alertThreshold: 30, locationId: box3.id, boxRow: 2, boxCol: 1, projectId: p1.id,
    expiryDate: daysFromNow(-5),
  });
  await smp({
    sku: "SMP-0011", name: "AAV9-GFP 对照病毒", type: "virus", quantity: 50, unit: "µL",
    alertThreshold: 10, locationId: box1.id, boxRow: 3, boxCol: 1, projectId: p2.id,
    expiryDate: daysFromNow(200),
  });
  const sPrimer = await smp({
    sku: "SMP-0012", name: "CD19-scFv 测序引物 F", type: "primer", quantity: 20, unit: "µL",
    alertThreshold: 5, locationId: box1.id, boxRow: 4, boxCol: 1, projectId: p1.id,
    expiryDate: daysFromNow(600),
  });
  await smp({
    sku: "SMP-0013", name: "PEI MAX 转染试剂", type: "chemical", quantity: 1, unit: "g",
    alertThreshold: 0.2, locationId: shelf1.id, projectId: p2.id, expiryDate: daysFromNow(300),
  });

  // 实验消耗登记
  await db.insert(experimentSamples).values([
    {
      experimentId: e1.id, sampleId: sCell1, amountUsed: 1,
      note: "复苏 1 支用于转导", createdByName: "演示用户",
    },
    {
      experimentId: e1.id, sampleId: sAb1, amountUsed: 15,
      note: "流式染色", createdByName: "演示用户",
    },
  ]);
  await db.insert(stockTransactions).values([
    { sampleId: sCell1, delta: -1, reason: "consume", note: "实验 EXP-0001 消耗：复苏 1 支用于转导", userName: "演示用户" },
    { sampleId: sAb1, delta: -15, reason: "consume", note: "实验 EXP-0001 消耗：流式染色", userName: "演示用户" },
  ]);
  await db.insert(experimentSamples).values({
    experimentId: e2.id, sampleId: sPrimer, amountUsed: 2,
    note: "qPCR 检测", createdByName: "演示用户",
  });

  // ─── 序列库 ───
  await db.insert(sequences).values([
    {
      name: "CD19-scFv (FMC63)", type: "dna",
      sequence: "GACATCCAGATGACCCAGTCTCCATCCTCCCTGTCTGCATCTGTAGGAGACAGAGTCACCATCACTTGCCGGGCGAGTCAGGACATTAGAAACTATTTAAATTGGTATCAGCAGAAACCAGGGAAAGCCCCTAAACTCCTGATCTATGCTACATCCAGTTTGCAAAGTGGGGTCCCATCAAGGTTCAGTGGCAGTGGATCTGGGACAGATTTCACTCTCACCATCAGCAGTCTGCAACCTGAAGATTTTGCAACTTACTACTGCCAACAGAGTTACAGTACCCCTCCGACGTTCGGCCAAGGGACCAAGGTGGAAATCAAAC",
      description: "FMC63 来源抗 CD19 单链抗体可变区，CAR 构建用",
      createdByName: "演示用户",
    },
    {
      name: "EGFP 编码序列", type: "dna",
      sequence: "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA",
      description: "增强型绿色荧光蛋白，报告基因对照",
      createdByName: "演示用户",
    },
    {
      name: "人胰岛素前体", type: "protein",
      sequence: "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN",
      description: "Human insulin precursor (UniProt P01308)",
      createdByName: "演示用户",
    },
  ]);

  // ─── 活动日志 ───
  await db.insert(activities).values([
    { userName: "演示用户", action: "登记了样本", entityType: "sample", entityId: 13, entityName: "SMP-0013 PEI MAX 转染试剂" },
    { userName: "演示用户", action: "创建了实验", entityType: "experiment", entityId: e2.id, entityName: "EXP-0002 CAR-T 体外杀伤实验（效靶比梯度）" },
    { userName: "演示用户", action: "签署锁定了实验", entityType: "experiment", entityId: 3, entityName: "EXP-0003 CAR 载体测序验证" },
    { userName: "演示用户", action: "登记了样本消耗", entityType: "sample", entityId: sCell1, entityName: "原代人 T 细胞（供体 D-042）", detail: "实验 EXP-0001 使用 1 支" },
    { userName: "演示用户", action: "创建了项目", entityType: "project", entityId: p3.id, entityName: "单细胞测序平台搭建" },
  ]);

  console.log("Done. Seed data inserted:");
  console.log("  3 projects, 5 experiments, 13 samples, 8 locations, 3 sequences");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
