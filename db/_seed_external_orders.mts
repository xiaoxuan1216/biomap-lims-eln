/**
 * 外部委托演示数据（幂等）：服务商、委托单、送样、交付物，以及一条关联 BioFlow。
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { logActivity } from "../api/queries/labHelpers";
import {
  externalDeliverables,
  externalOrderExperiments,
  externalOrderItems,
  externalOrders,
  externalOrderSamples,
  externalResults,
  externalSampleCustodyEvents,
  experiments,
  projects,
  samples,
  serviceProviders,
  workflowEdges,
  workflowNodes,
  workflows,
} from "./schema";

const db = getDb();

function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function upsertProvider(
  name: string,
  row: Omit<typeof serviceProviders.$inferInsert, "name">
): Promise<number> {
  await db
    .insert(serviceProviders)
    .values({ name, ...row })
    .onDuplicateKeyUpdate({ set: row });
  const provider = await db.query.serviceProviders.findFirst({
    where: eq(serviceProviders.name, name),
  });
  if (!provider) throw new Error(`provider seed failed: ${name}`);
  return provider.id;
}

async function upsertOrder(
  row: typeof externalOrders.$inferInsert,
  items: Array<Omit<typeof externalOrderItems.$inferInsert, "orderId">>
) {
  let order = await db.query.externalOrders.findFirst({
    where: eq(externalOrders.orderNo, row.orderNo),
  });
  let created = false;
  if (!order) {
    const [{ id }] = await db.insert(externalOrders).values(row).$returningId();
    order = await db.query.externalOrders.findFirst({
      where: eq(externalOrders.id, id),
    });
    created = true;
  } else {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...changes
    } = row as typeof row & {
      id?: number;
      createdAt?: Date;
      updatedAt?: Date;
    };
    await db
      .update(externalOrders)
      .set(changes)
      .where(eq(externalOrders.id, order.id));
  }
  if (!order) throw new Error(`order seed failed: ${row.orderNo}`);

  const itemIds: number[] = [];
  for (const item of items) {
    let existing = await db.query.externalOrderItems.findFirst({
      where: and(
        eq(externalOrderItems.orderId, order.id),
        eq(externalOrderItems.name, item.name)
      ),
    });
    if (!existing) {
      const [{ id }] = await db
        .insert(externalOrderItems)
        .values({ orderId: order.id, ...item })
        .$returningId();
      existing = await db.query.externalOrderItems.findFirst({
        where: eq(externalOrderItems.id, id),
      });
    } else {
      await db
        .update(externalOrderItems)
        .set(item)
        .where(eq(externalOrderItems.id, existing.id));
    }
    if (existing) itemIds.push(existing.id);
  }

  if (created) {
    await logActivity({
      userName: "系统",
      source: "seed",
      action: "创建了外部委托演示数据",
      entityType: "external_order",
      entityId: order.id,
      entityName: order.orderNo,
      detail: order.title,
    });
  }
  return { orderId: order.id, itemIds };
}

async function linkSample(
  orderId: number,
  orderItemId: number | undefined,
  sampleId: number | undefined,
  row: Omit<
    typeof externalOrderSamples.$inferInsert,
    "orderId" | "orderItemId" | "sampleId"
  >
) {
  if (!sampleId) return undefined;
  let existing = await db.query.externalOrderSamples.findFirst({
    where: and(
      eq(externalOrderSamples.orderId, orderId),
      eq(externalOrderSamples.sampleId, sampleId)
    ),
  });
  if (!existing) {
    const [{ id }] = await db
      .insert(externalOrderSamples)
      .values({ orderId, orderItemId, sampleId, ...row })
      .$returningId();
    existing = await db.query.externalOrderSamples.findFirst({
      where: eq(externalOrderSamples.id, id),
    });
  } else {
    await db
      .update(externalOrderSamples)
      .set({
        orderItemId,
        amount: row.amount,
        unit: row.unit,
        purpose: row.purpose,
        carrier: row.carrier,
        trackingNo: row.trackingNo,
      })
      .where(eq(externalOrderSamples.id, existing.id));
  }
  if (!existing) return undefined;
  await db
    .insert(externalSampleCustodyEvents)
    .values({
      externalOrderSampleId: existing.id,
      orderId,
      sampleId,
      eventType: row.shipmentStatus ?? "planned",
      amount: row.amount,
      unit: row.unit,
      carrier: row.carrier,
      trackingNo: row.trackingNo,
      idempotencyKey: `seed-custody:${existing.id}:${row.shipmentStatus ?? "planned"}`,
      note: "演示数据的历史交接事件",
      createdByName: "系统",
    })
    .onDuplicateKeyUpdate({ set: { note: "演示数据的历史交接事件" } });
  return existing.id;
}

async function addDeliverable(
  orderId: number,
  orderItemId: number | undefined,
  row: Omit<typeof externalDeliverables.$inferInsert, "orderId" | "orderItemId">
) {
  const existing = await db.query.externalDeliverables.findFirst({
    where: and(
      eq(externalDeliverables.orderId, orderId),
      eq(externalDeliverables.name, row.name)
    ),
  });
  if (!existing)
    await db
      .insert(externalDeliverables)
      .values({ orderId, orderItemId, ...row });
}

async function addResult(
  orderId: number,
  row: Omit<typeof externalResults.$inferInsert, "orderId">
) {
  const existing = await db.query.externalResults.findFirst({
    where: and(
      eq(externalResults.orderId, orderId),
      eq(externalResults.metric, row.metric)
    ),
  });
  if (!existing) await db.insert(externalResults).values({ orderId, ...row });
}

async function linkExperiment(
  orderId: number,
  orderItemId: number | undefined,
  experimentId: number | undefined,
  relation: "source" | "result_review" | "reference"
) {
  if (!experimentId) return;
  const existing = await db.query.externalOrderExperiments.findFirst({
    where: and(
      eq(externalOrderExperiments.orderId, orderId),
      eq(externalOrderExperiments.experimentId, experimentId)
    ),
  });
  if (!existing) {
    await db.insert(externalOrderExperiments).values({
      orderId,
      orderItemId,
      experimentId,
      relation,
      createdByName: "系统",
    });
  }
}

const projectRows = await db.select().from(projects).orderBy(asc(projects.id));
if (projectRows.length < 3)
  throw new Error("external order seed requires at least 3 projects");
const sampleRows = await db
  .select()
  .from(samples)
  .where(isNull(samples.archivedAt))
  .orderBy(asc(samples.id));
const experimentRows = await db
  .select()
  .from(experiments)
  .orderBy(asc(experiments.id));

const bioanalysis = await upsertProvider("华衡生物分析 CRO", {
  type: "cro",
  qualificationStatus: "qualified",
  contactName: "周敏",
  contactEmail: "zhou.min@example.test",
  contactPhone: "021-5550-1201",
  certifications: "GLP · ISO 17025",
  specialties: "SPR / BLI 亲和力、PK、免疫原性与生物分析",
  notes: "演示服务商，非真实商务数据",
});
const animal = await upsertProvider("博岳动物研究中心", {
  type: "animal_facility",
  qualificationStatus: "qualified",
  contactName: "王珊",
  contactEmail: "wang.shan@example.test",
  certifications: "AAALAC · GLP",
  specialties: "药效、PK/PD、毒理与疾病模型",
  notes: "演示服务商，非真实商务数据",
});
const sequencing = await upsertProvider("启序基因科技", {
  type: "sequencing",
  qualificationStatus: "qualified",
  contactName: "陈宇",
  contactEmail: "chen.yu@example.test",
  certifications: "ISO 15189",
  specialties: "单细胞转录组、全基因组与长读长测序",
  notes: "演示服务商，非真实商务数据",
});
const cdmo = await upsertProvider("恒源生物工艺 CDMO", {
  type: "cdmo",
  qualificationStatus: "pending",
  contactName: "刘欣",
  contactEmail: "liu.xin@example.test",
  specialties: "病毒载体工艺开发、蛋白表达纯化与分析方法",
  notes: "演示服务商，非真实商务数据",
});

const genscript = await upsertProvider("金斯瑞（GenScript）", {
  catalogKey: "genscript",
  type: "cro",
  qualificationStatus: "pending",
  specialties: "基因合成、质粒制备、重组蛋白、定制抗体与多肽服务",
  notes:
    "内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。",
});
const genewiz = await upsertProvider("金唯智（GENEWIZ）", {
  catalogKey: "genewiz",
  type: "sequencing",
  qualificationStatus: "pending",
  specialties: "Sanger 测序、二代测序、基因合成与质粒制备",
  notes:
    "内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。",
});
const wuxiApptec = await upsertProvider("药明康德（WuXi AppTec）", {
  catalogKey: "wuxi_apptec",
  type: "cro",
  qualificationStatus: "pending",
  specialties: "DMPK、生物分析、药理与非临床安全性评价",
  notes:
    "内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。",
});
const wuxiBiologics = await upsertProvider("药明生物（WuXi Biologics）", {
  catalogKey: "wuxi_biologics",
  type: "cdmo",
  qualificationStatus: "pending",
  specialties: "生物药发现、稳定细胞株、上下游工艺和分析方法开发",
  notes:
    "内置目录依据服务商公开能力介绍整理；下单前需完成内部供应商准入并确认最终规格与报价。",
});
const biointron = await upsertProvider("百英生物（Biointron）", {
  catalogKey: "biointron",
  type: "cro",
  qualificationStatus: "pending",
  specialties: "抗体表达、双抗表达、抗体人源化与亲和力成熟",
  notes:
    "内置目录依据服务商公开产品分类整理；下单前需完成内部供应商准入并确认最终规格与报价。",
});

// ─── 早研场景：HER2×CD3 双抗候选发现 → 构建 → 表达 → 可开发性 → PK ───
const earlyProject =
  projectRows.find(project => project.name === "重组抗体表达与表征") ??
  projectRows.find(project => project.name.includes("抗体")) ??
  projectRows[6] ??
  projectRows[0];

const earlyGeneSynthesis = await upsertOrder(
  {
    orderNo: "EXT-EARLY-0001",
    projectId: earlyProject.id,
    providerId: genscript,
    title: "HER2×CD3 双抗候选重轻链基因合成与表达载体构建",
    objective:
      "将内部设计的 12 个双抗候选序列转化为哺乳动物瞬时表达载体，为小量表达和功能筛选提供构建物。",
    ownerName: "周博士",
    priority: "high",
    commercialStatus: "ordered",
    executionStatus: "delivered",
    qualityStatus: "accepted",
    currency: "CNY",
    quotedAmount: 36800,
    poNumber: "PO-EARLY-BSAB-001",
    contractRef: "SOW-BSAB-GENE-V1",
    requestedAt: new Date(Date.now() - 28 * 86400000),
    expectedDeliveryDate: day(-12),
    actualDeliveryDate: day(-13),
    createdByName: "早研项目组",
  },
  [
    {
      name: "基因合成与克隆",
      category: "基因服务",
      description:
        "合成 12 组 HER2×CD3 双抗候选重链与轻链，并克隆至 pcDNA3.4 瞬时表达载体。",
      quantity: 12,
      unit: "构建",
      acceptanceCriteria:
        "交付序列应与确认版本一致，并提供测序验证文件、质粒图谱及约定的质量检测结果。",
      serviceTemplateKey: "gene_synthesis_cloning",
      serviceTemplateVersion: 1,
      requirementData: JSON.stringify({
        sequence: "SEQ-BSAB-001 至 SEQ-BSAB-012（BioMap 序列库）",
        codonHost: "cho",
        vector: "pcDNA3.4",
        cloningSites: "Gibson Assembly；重链/轻链分别构建",
        plasmidScale: "100ug",
        endotoxin: "low",
      }),
      expectedDeliveryDate: day(-12),
      status: "accepted",
    },
  ]
);

const earlySequencing = await upsertOrder(
  {
    orderNo: "EXT-EARLY-0002",
    projectId: earlyProject.id,
    providerId: genewiz,
    title: "双抗表达载体全长 Sanger 双向测序确认",
    objective:
      "对首轮 24 个重链/轻链表达载体进行全长双向测序，排除合成、组装及扩增过程中引入的序列偏差。",
    ownerName: "林研究员",
    priority: "normal",
    commercialStatus: "ordered",
    executionStatus: "delivered",
    qualityStatus: "pending_review",
    currency: "CNY",
    quotedAmount: 7200,
    poNumber: "PO-EARLY-BSAB-002",
    requestedAt: new Date(Date.now() - 17 * 86400000),
    expectedDeliveryDate: day(-6),
    actualDeliveryDate: day(-7),
    createdByName: "早研项目组",
  },
  [
    {
      name: "Sanger 测序",
      category: "测序服务",
      description:
        "24 个表达载体采用载体通用引物加内部 walking primer 进行全长双向覆盖和参考序列比对。",
      quantity: 24,
      unit: "反应",
      acceptanceCriteria:
        "交付原始峰图、碱基判读文件和质量信息；有效读长及样本匹配规则按订单约定执行。",
      serviceTemplateKey: "sanger_sequencing",
      serviceTemplateVersion: 1,
      requirementData: JSON.stringify({
        sampleType: "plasmid",
        sampleCount: 24,
        primerStrategy: "customer",
        direction: "bidirectional",
        specialTemplate:
          "双抗重链约 1.5 kb，要求全长无缝拼接并与 BioMap 参考序列比对",
        dataFormat: ["ab1", "seq", "pdf"],
      }),
      expectedDeliveryDate: day(-6),
      status: "delivered",
    },
  ]
);

const earlyExpression = await upsertOrder(
  {
    orderNo: "EXT-EARLY-0003",
    projectId: earlyProject.id,
    providerId: biointron,
    title: "12 个 HER2×CD3 双抗候选小量表达与纯化",
    objective:
      "快速获得研究级双抗蛋白，用于细胞结合、T 细胞激活、杀伤活性和初步可开发性筛选。",
    ownerName: "赵研究员",
    priority: "high",
    commercialStatus: "ordered",
    executionStatus: "in_progress",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 58600,
    poNumber: "PO-EARLY-BSAB-003",
    contractRef: "WO-BSAB-EXPRESSION-01",
    requestedAt: new Date(Date.now() - 10 * 86400000),
    expectedDeliveryDate: day(8),
    createdByName: "早研项目组",
  },
  [
    {
      name: "重组抗体表达与纯化",
      category: "抗体表达",
      description:
        "HEK293 瞬时共转染表达 12 个 IgG-like 双抗候选，Protein A 纯化后按候选分别交付。",
      quantity: 12,
      unit: "抗体",
      acceptanceCriteria:
        "交付抗体、浓度、纯度及约定质量结果，并提供构建、批次、缓冲液和检测原始文件。",
      serviceTemplateKey: "recombinant_antibody_expression",
      serviceTemplateVersion: 1,
      requirementData: JSON.stringify({
        sequence: "已确认构建 AB-BSAB-01 至 AB-BSAB-12",
        format: "igg",
        host: "hek293",
        scale: "每个候选 5 mg",
        purityTarget: "95",
        qc: ["sds_page", "sec_hplc", "endotoxin", "binding"],
        buffer: "PBS，pH 7.4；无菌过滤",
      }),
      expectedDeliveryDate: day(8),
      status: "in_progress",
    },
  ]
);

const earlyDevelopability = await upsertOrder(
  {
    orderNo: "EXT-EARLY-0004",
    projectId: earlyProject.id,
    providerId: wuxiBiologics,
    title: "6 个双抗候选的早期可开发性与分析表征",
    objective:
      "对功能筛选后的 6 个候选比较纯度、聚集、电荷异质性、热稳定性和体外效价，支持先导排序。",
    ownerName: "钱博士",
    priority: "normal",
    commercialStatus: "pending_approval",
    executionStatus: "awaiting_samples",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 98000,
    expectedDeliveryDate: day(24),
    createdByName: "早研项目组",
  },
  [
    {
      name: "分析方法开发与表征",
      category: "生物药分析",
      description:
        "以研究级方法完成 6 个候选的 SEC-HPLC、CE-SDS、icIEF、DSF 和细胞效价横向比较。",
      quantity: 1,
      unit: "项目",
      acceptanceCriteria:
        "方法、系统适用性和接受标准应预先确认，交付原始数据、方法文件、验证/确认报告和偏差记录。",
      serviceTemplateKey: "analytical_development",
      serviceTemplateVersion: 1,
      requirementData: JSON.stringify({
        sample: "AB-BSAB-02、03、05、07、09、11；每个候选 ≥2 mg",
        cqas: ["identity", "purity", "charge", "potency"],
        methodScope: "comparability",
        sampleCount: 6,
        stage: "research",
      }),
      expectedDeliveryDate: day(24),
      status: "pending",
    },
  ]
);

const earlyPk = await upsertOrder(
  {
    orderNo: "EXT-EARLY-0005",
    projectId: earlyProject.id,
    providerId: wuxiApptec,
    title: "3 个双抗先导候选的小鼠单次给药 PK 预实验",
    objective:
      "在正式候选确认前比较 3 个先导分子的早期暴露和清除差异，识别明显非线性或快速清除风险。",
    ownerName: "孙博士",
    priority: "normal",
    commercialStatus: "quoting",
    executionStatus: "awaiting_samples",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 126000,
    expectedDeliveryDate: day(38),
    createdByName: "早研项目组",
  },
  [
    {
      name: "体内药代动力学研究",
      category: "DMPK",
      description:
        "C57BL/6 小鼠单次静脉给药探索性 PK；每个候选独立组别，采用抗原捕获 LBA 定量。",
      quantity: 1,
      unit: "研究",
      acceptanceCriteria:
        "动物、给药、采样和生物分析记录应完整，交付个体与汇总浓度数据、PK 参数、偏差及签发报告。",
      serviceTemplateKey: "in_vivo_pk",
      serviceTemplateVersion: 1,
      requirementData: JSON.stringify({
        species: "mouse",
        animalDesign: "每个候选 3 只雌性 C57BL/6，共 9 只",
        route: ["iv"],
        dose: "2 mg/kg，单次静脉给药；PBS 制剂",
        timepoints: "给药前、0.25、1、4、8、24、48、72、120、168 h",
        bioanalysis: "ligand_binding",
        regulatory: "discovery",
      }),
      expectedDeliveryDate: day(38),
      status: "pending",
    },
  ]
);

const affinity = await upsertOrder(
  {
    orderNo: "EXT-DEMO-0001",
    projectId: projectRows[0].id,
    providerId: bioanalysis,
    title: "CD19-CAR 候选分子 SPR 亲和力与动力学检测",
    objective: "比较候选分子的 KD、kon 与 koff，为下一轮构建筛选提供依据。",
    ownerName: "陈研究员",
    priority: "high",
    commercialStatus: "ordered",
    executionStatus: "in_progress",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 48600,
    poNumber: "PO-DEMO-24081",
    contractRef: "SOW-DEMO-SPR-01",
    requestedAt: new Date(Date.now() - 8 * 86400000),
    expectedDeliveryDate: day(8),
    createdByName: "演示用户",
  },
  [
    {
      name: "8 个候选分子的 KD / kon / koff 测定",
      category: "亲和力与动力学",
      description:
        "采用 SPR 多循环动力学法，设置空白与阳性对照，每个分子至少两个技术重复。",
      quantity: 8,
      unit: "分子",
      protocolRef: "BM-SOP-SPR-003",
      acceptanceCriteria:
        "原始 sensorgram 完整；拟合残差可接受；报告包含 KD、kon、koff、Rmax 与 QC 结论。",
      expectedDeliveryDate: day(8),
      status: "in_progress",
    },
    {
      name: "结果复测与技术报告",
      category: "数据分析",
      description: "对异常结合曲线进行一次复测并输出中英文技术报告。",
      acceptanceCriteria: "复测原因、参数与结论可追溯，报告可用于项目评审。",
      expectedDeliveryDate: day(10),
      status: "pending",
    },
  ]
);

const aav = await upsertOrder(
  {
    orderNo: "EXT-DEMO-0002",
    projectId: projectRows[1].id,
    providerId: cdmo,
    title: "AAV9 小试工艺外部放大与质量分析",
    objective: "验证 10 L 规模瞬转、纯化和质量分析的可放大性。",
    ownerName: "王工",
    priority: "urgent",
    commercialStatus: "ordered",
    executionStatus: "delivered",
    qualityStatus: "pending_review",
    currency: "CNY",
    quotedAmount: 128000,
    poNumber: "PO-DEMO-24063",
    contractRef: "MSA-DEMO-AAV / WO-02",
    requestedAt: new Date(Date.now() - 35 * 86400000),
    expectedDeliveryDate: day(-2),
    actualDeliveryDate: day(-1),
    createdByName: "演示用户",
  },
  [
    {
      name: "AAV9 10 L 小试生产与纯化",
      category: "工艺开发",
      description: "三质粒瞬转、澄清、亲和纯化与超滤换液。",
      quantity: 1,
      unit: "批",
      acceptanceCriteria:
        "产量 ≥ 1E14 vg；回收率、残留 DNA 与宿主蛋白数据完整。",
      expectedDeliveryDate: day(-2),
      status: "delivered",
    },
  ]
);

const singleCell = await upsertOrder(
  {
    orderNo: "EXT-DEMO-0003",
    projectId: projectRows[2].id,
    providerId: sequencing,
    title: "单细胞转录组建库与 PE150 测序",
    objective: "完成 6 个样本的 10x 单细胞建库、测序和基础分析。",
    ownerName: "张工",
    priority: "normal",
    commercialStatus: "pending_approval",
    executionStatus: "awaiting_samples",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 72000,
    expectedDeliveryDate: day(28),
    createdByName: "演示用户",
  },
  [
    {
      name: "6 个样本的 10x 单细胞建库与测序",
      category: "单细胞测序",
      quantity: 6,
      unit: "样本",
      acceptanceCriteria:
        "每样本目标 20,000 reads/cell；Q30、有效 barcode、细胞数和 doublet 指标完整。",
      expectedDeliveryDate: day(28),
      status: "pending",
    },
  ]
);

await upsertOrder(
  {
    orderNo: "EXT-DEMO-0004",
    projectId: projectRows[0].id,
    providerId: animal,
    title: "CAR-T 体内药效预实验",
    objective: "评估两组候选 CAR-T 在 Nalm6 荷瘤模型中的初步药效。",
    ownerName: "赵工",
    priority: "high",
    commercialStatus: "quoting",
    executionStatus: "awaiting_samples",
    qualityStatus: "not_ready",
    currency: "CNY",
    quotedAmount: 96000,
    expectedDeliveryDate: day(45),
    createdByName: "演示用户",
  },
  [
    {
      name: "Nalm6 荷瘤模型 CAR-T 药效预实验",
      category: "动物药效",
      quantity: 30,
      unit: "只",
      acceptanceCriteria:
        "随机化记录、给药记录、BLI 原始数据、体重与生存数据完整。",
      expectedDeliveryDate: day(45),
      status: "pending",
    },
  ]
);

const completedProject = projectRows[6] ?? projectRows[0];
const completed = await upsertOrder(
  {
    orderNo: "EXT-DEMO-0005",
    projectId: completedProject.id,
    providerId: bioanalysis,
    title: "重组抗体 SEC-HPLC 纯度与聚集体分析",
    objective: "确认候选抗体纯度、单体比例与聚集体水平。",
    ownerName: "李工",
    priority: "normal",
    commercialStatus: "ordered",
    executionStatus: "delivered",
    qualityStatus: "accepted",
    currency: "CNY",
    quotedAmount: 12600,
    poNumber: "PO-DEMO-24042",
    expectedDeliveryDate: day(-14),
    actualDeliveryDate: day(-13),
    createdByName: "演示用户",
  },
  [
    {
      name: "12 个抗体样本 SEC-HPLC 分析",
      category: "纯度分析",
      quantity: 12,
      unit: "样本",
      acceptanceCriteria:
        "提供原始色谱、积分方法、单体/聚集体比例及系统适用性结果。",
      expectedDeliveryDate: day(-14),
      status: "accepted",
    },
  ]
);

await addDeliverable(
  earlyGeneSynthesis.orderId,
  earlyGeneSynthesis.itemIds[0],
  {
    name: "HER2xCD3_12个候选构建_序列验证与质粒图谱.zip",
    type: "certificate",
    version: "v1",
    reviewStatus: "accepted",
    reviewedAt: new Date(Date.now() - 11 * 86400000),
    reviewedByName: "林研究员",
    notes: "12 组重链/轻链构建均与确认序列一致。",
  }
);
await addDeliverable(earlySequencing.orderId, earlySequencing.itemIds[0], {
  name: "AB-BSAB_Sanger峰图与全长比对结果.zip",
  type: "raw_data",
  version: "v1",
  reviewStatus: "pending",
  notes: "24 个载体中 22 个全长一致；2 个候选需内部复核低质量末端峰图。",
});
await addResult(earlySequencing.orderId, {
  orderItemId: earlySequencing.itemIds[0],
  metric: "全长序列确认通过率",
  valueText: "22 / 24",
  numericValue: 91.7,
  unit: "%",
  referenceRange: "目标 100%；异常构建进入复测或重制",
  method: "Sanger 双向测序 + 参考序列比对",
  replicate: "首轮 24 个表达载体",
  reviewStatus: "pending",
  notes: "AB-BSAB-04-HC 与 AB-BSAB-10-LC 需人工复核。",
  createdByName: "系统",
});

await linkExperiment(
  earlyGeneSynthesis.orderId,
  earlyGeneSynthesis.itemIds[0],
  experimentRows.find(experiment => experiment.code === "EXP-0013")?.id,
  "reference"
);
await linkExperiment(
  earlyExpression.orderId,
  earlyExpression.itemIds[0],
  experimentRows.find(experiment => experiment.code === "EXP-0014")?.id,
  "source"
);

await linkSample(affinity.orderId, affinity.itemIds[0], sampleRows[0]?.id, {
  amount: 5,
  unit: sampleRows[0]?.unit ?? "µg",
  purpose: "SPR 动力学检测",
  shipmentStatus: "received",
  carrier: "顺丰冷链",
  trackingNo: "SF-DEMO-240801",
  shippedAt: new Date(Date.now() - 5 * 86400000),
  receivedAt: new Date(Date.now() - 4 * 86400000),
});
await linkSample(affinity.orderId, affinity.itemIds[0], sampleRows[3]?.id, {
  amount: 1,
  unit: sampleRows[3]?.unit ?? "管",
  purpose: "细胞结合实验备选材料",
  shipmentStatus: "received",
  carrier: "顺丰冷链",
  trackingNo: "SF-DEMO-240801",
  shippedAt: new Date(Date.now() - 5 * 86400000),
  receivedAt: new Date(Date.now() - 4 * 86400000),
});
await linkSample(affinity.orderId, affinity.itemIds[0], sampleRows[1]?.id, {
  amount: 2,
  unit: sampleRows[1]?.unit ?? "µg",
  purpose: "复测备用质粒，等待确认发货",
  shipmentStatus: "prepared",
  carrier: "顺丰冷链",
  trackingNo: "SF-DEMO-SYNC-01",
});
const aavSampleLink = await linkSample(
  aav.orderId,
  aav.itemIds[0],
  sampleRows[10]?.id,
  {
    amount: 5,
    unit: sampleRows[10]?.unit ?? "µL",
    purpose: "工艺放大参考品",
    shipmentStatus: "consumed",
    carrier: "京东冷链",
    trackingNo: "JD-DEMO-240603",
    shippedAt: new Date(Date.now() - 30 * 86400000),
    receivedAt: new Date(Date.now() - 29 * 86400000),
  }
);
await linkSample(singleCell.orderId, singleCell.itemIds[0], sampleRows[4]?.id, {
  amount: 1,
  unit: sampleRows[4]?.unit ?? "管",
  purpose: "单细胞建库待送样",
  shipmentStatus: "prepared",
});

await addDeliverable(aav.orderId, aav.itemIds[0], {
  name: "AAV9_10L_工艺总结报告.pdf",
  type: "report",
  version: "v1.1",
  reviewStatus: "pending",
  notes: "报告已收齐，等待工艺和 QA 联合验收。",
});
await addDeliverable(aav.orderId, aav.itemIds[0], {
  name: "AAV9_10L_批次原始数据包.zip",
  type: "raw_data",
  version: "v1",
  reviewStatus: "accepted",
  reviewedAt: new Date(Date.now() - 12 * 3600000),
  reviewedByName: "王工",
});
await addDeliverable(completed.orderId, completed.itemIds[0], {
  name: "SEC-HPLC_纯度与聚集体分析报告.pdf",
  type: "report",
  version: "v2",
  reviewStatus: "accepted",
  reviewedAt: new Date(Date.now() - 12 * 86400000),
  reviewedByName: "李工",
  notes: "全部样本系统适用性通过，报告验收完成。",
});

await addResult(aav.orderId, {
  orderItemId: aav.itemIds[0],
  externalOrderSampleId: aavSampleLink,
  sampleId: sampleRows[10]?.id,
  metric: "Vector genome titer",
  valueText: "1.28E14",
  numericValue: 128000000000000,
  unit: "vg/batch",
  referenceRange: "≥ 1.0E14 vg/batch",
  method: "ddPCR",
  replicate: "Batch AAV9-10L-01",
  reviewStatus: "accepted",
  reviewedByName: "王工",
  reviewedAt: new Date(Date.now() - 8 * 3600000),
  createdByName: "系统",
});
await addResult(aav.orderId, {
  orderItemId: aav.itemIds[0],
  externalOrderSampleId: aavSampleLink,
  sampleId: sampleRows[10]?.id,
  metric: "Full capsid ratio",
  valueText: "72.4",
  numericValue: 72.4,
  unit: "%",
  referenceRange: "≥ 70%",
  method: "AUC",
  replicate: "Batch AAV9-10L-01",
  reviewStatus: "pending",
  createdByName: "系统",
});
await addResult(completed.orderId, {
  orderItemId: completed.itemIds[0],
  metric: "SEC-HPLC monomer",
  valueText: "98.7",
  numericValue: 98.7,
  unit: "%",
  referenceRange: "≥ 95%",
  method: "SEC-HPLC",
  replicate: "Mean of 12 samples",
  reviewStatus: "accepted",
  reviewedByName: "李工",
  reviewedAt: new Date(Date.now() - 12 * 86400000),
  createdByName: "系统",
});

const firstExperimentForProject = (projectId: number) =>
  experimentRows.find(experiment => experiment.projectId === projectId)?.id;
await linkExperiment(
  affinity.orderId,
  affinity.itemIds[0],
  firstExperimentForProject(projectRows[0].id),
  "source"
);
await linkExperiment(
  aav.orderId,
  aav.itemIds[0],
  firstExperimentForProject(projectRows[1].id),
  "result_review"
);

let demoWorkflow = await db.query.workflows.findFirst({
  where: eq(workflows.name, "CRO 外部亲和力检测协作流程"),
});
if (!demoWorkflow) {
  const [{ id }] = await db
    .insert(workflows)
    .values({
      name: "CRO 外部亲和力检测协作流程",
      description: "展示内部备样 → CRO 执行 → 交付验收的闭环流程。",
      scenario: "antibody",
      status: "active",
      projectId: projectRows[0].id,
      createdByName: "演示用户",
    })
    .$returningId();
  demoWorkflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  });
}
if (!demoWorkflow) throw new Error("demo workflow seed failed");

const demoNodes: Array<typeof workflowNodes.$inferInsert> = [
  {
    workflowId: demoWorkflow.id,
    nodeKey: "cro_prepare",
    type: "manual",
    templateKey: "m_cell_prep",
    label: "候选分子备样与出库",
    owner: "陈研究员",
    status: "done",
    posX: 80,
    posY: 180,
  },
  {
    workflowId: demoWorkflow.id,
    nodeKey: "cro_spr",
    type: "external",
    templateKey: "x_cro_assay",
    label: "CRO SPR 亲和力检测",
    owner: "陈研究员",
    externalOrderItemId: affinity.itemIds[0],
    status: "in_progress",
    posX: 390,
    posY: 180,
  },
  {
    workflowId: demoWorkflow.id,
    nodeKey: "cro_accept",
    type: "data",
    templateKey: "p_archive",
    label: "报告验收与数据归档",
    owner: "李工",
    status: "pending",
    posX: 700,
    posY: 180,
  },
];
for (const node of demoNodes) {
  const { workflowId, nodeKey, ...changes } = node;
  await db
    .insert(workflowNodes)
    .values(node)
    .onDuplicateKeyUpdate({ set: changes });
}
const demoEdges: Array<typeof workflowEdges.$inferInsert> = [
  {
    workflowId: demoWorkflow.id,
    edgeKey: "cro_e1",
    sourceKey: "cro_prepare",
    targetKey: "cro_spr",
  },
  {
    workflowId: demoWorkflow.id,
    edgeKey: "cro_e2",
    sourceKey: "cro_spr",
    targetKey: "cro_accept",
  },
];
for (const edge of demoEdges) {
  const { workflowId, edgeKey, ...changes } = edge;
  await db
    .insert(workflowEdges)
    .values(edge)
    .onDuplicateKeyUpdate({ set: changes });
}

let earlyWorkflow = await db.query.workflows.findFirst({
  where: eq(workflows.name, "HER2×CD3 双抗早研 CRO 协作流程"),
});
if (!earlyWorkflow) {
  const [{ id }] = await db
    .insert(workflows)
    .values({
      name: "HER2×CD3 双抗早研 CRO 协作流程",
      description:
        "候选设计 → 基因合成 → 序列确认 → 小量表达 → 功能筛选 → 可开发性与 PK → 先导决策。",
      scenario: "antibody",
      status: "active",
      projectId: earlyProject.id,
      createdByName: "早研项目组",
    })
    .$returningId();
  earlyWorkflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  });
}
if (!earlyWorkflow) throw new Error("early research workflow seed failed");

const earlyNodes: Array<typeof workflowNodes.$inferInsert> = [
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_design",
    type: "manual",
    templateKey: "m_construct_design",
    label: "12 个双抗候选序列设计",
    owner: "周博士",
    status: "done",
    posX: 60,
    posY: 220,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_gene",
    type: "external",
    templateKey: "x_gene_synthesis",
    label: "金斯瑞基因合成与载体构建",
    owner: "周博士",
    externalOrderItemId: earlyGeneSynthesis.itemIds[0],
    status: "done",
    posX: 340,
    posY: 220,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_sequence",
    type: "external",
    templateKey: "x_sanger",
    label: "金唯智全长 Sanger 确认",
    owner: "林研究员",
    externalOrderItemId: earlySequencing.itemIds[0],
    status: "in_progress",
    posX: 620,
    posY: 220,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_expression",
    type: "external",
    templateKey: "x_antibody_expression",
    label: "百英生物小量表达与纯化",
    owner: "赵研究员",
    externalOrderItemId: earlyExpression.itemIds[0],
    status: "in_progress",
    posX: 900,
    posY: 220,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_function",
    type: "manual",
    templateKey: "m_function_screen",
    label: "内部结合与杀伤功能筛选",
    owner: "赵研究员",
    status: "pending",
    posX: 1180,
    posY: 220,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_developability",
    type: "external",
    templateKey: "x_developability",
    label: "药明生物可开发性表征",
    owner: "钱博士",
    externalOrderItemId: earlyDevelopability.itemIds[0],
    status: "pending",
    posX: 1460,
    posY: 100,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_pk",
    type: "external",
    templateKey: "x_mouse_pk",
    label: "药明康德小鼠 PK 预实验",
    owner: "孙博士",
    externalOrderItemId: earlyPk.itemIds[0],
    status: "pending",
    posX: 1460,
    posY: 340,
  },
  {
    workflowId: earlyWorkflow.id,
    nodeKey: "early_decision",
    type: "data",
    templateKey: "p_candidate_decision",
    label: "先导候选决策与归档",
    owner: "周博士",
    status: "pending",
    posX: 1740,
    posY: 220,
  },
];
for (const node of earlyNodes) {
  const { workflowId, nodeKey, ...changes } = node;
  await db
    .insert(workflowNodes)
    .values(node)
    .onDuplicateKeyUpdate({ set: changes });
}
const earlyEdges: Array<typeof workflowEdges.$inferInsert> = [
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e1",
    sourceKey: "early_design",
    targetKey: "early_gene",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e2",
    sourceKey: "early_gene",
    targetKey: "early_sequence",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e3",
    sourceKey: "early_sequence",
    targetKey: "early_expression",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e4",
    sourceKey: "early_expression",
    targetKey: "early_function",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e5",
    sourceKey: "early_function",
    targetKey: "early_developability",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e6",
    sourceKey: "early_function",
    targetKey: "early_pk",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e7",
    sourceKey: "early_developability",
    targetKey: "early_decision",
  },
  {
    workflowId: earlyWorkflow.id,
    edgeKey: "early_e8",
    sourceKey: "early_pk",
    targetKey: "early_decision",
  },
];
for (const edge of earlyEdges) {
  const { workflowId, edgeKey, ...changes } = edge;
  await db
    .insert(workflowEdges)
    .values(edge)
    .onDuplicateKeyUpdate({ set: changes });
}

// 早研故事线作为当前演示主场景，列表中优先展示；保留原通用数据用于物流和验收功能对照。
await db
  .update(externalOrders)
  // MySQL 演示库时间戳为秒精度；加 1 秒可稳定压过同次种子运行中先更新的通用订单。
  .set({ updatedAt: new Date(Date.now() + 1_000) })
  .where(
    inArray(externalOrders.id, [
      earlyGeneSynthesis.orderId,
      earlySequencing.orderId,
      earlyExpression.orderId,
      earlyDevelopability.orderId,
      earlyPk.orderId,
    ])
  );

console.log("external order seed complete", {
  providers: 9,
  orders: 10,
  workflowIds: [demoWorkflow.id, earlyWorkflow.id],
});
process.exit(0);
