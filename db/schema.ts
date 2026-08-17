import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  longtext,
  timestamp,
  bigint,
  int,
  decimal,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["viewer", "user", "reviewer", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── 项目 ───────────────────────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("teal").notNull(),
  status: mysqlEnum("status", ["active", "on_hold", "completed"]).default("active").notNull(),
  createdById: bigint("createdById", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Project = typeof projects.$inferSelect;

// ─── 实验记录 (ELN) ─────────────────────────────────────────────────────
export const experiments = mysqlTable(
  "experiments",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    projectId: bigint("projectId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    objective: text("objective"),
    status: mysqlEnum("status", ["planning", "in_progress", "completed", "signed"]).default("planning").notNull(),
    content: longtext("content"),
    revision: int("revision").default(0).notNull(),
    currentRevisionId: bigint("currentRevisionId", {
      mode: "number",
      unsigned: true,
    }),
    contentHash: varchar("contentHash", { length: 64 }),
    /** 已签署记录不能解锁；修订以新记录追加，并指向原记录。 */
    amendsExperimentId: bigint("amendsExperimentId", {
      mode: "number",
      unsigned: true,
    }),
    /** 来源业务流 + 节点（项目 → 业务流 → 节点 → ELN 条目 四级执行链） */
    workflowId: bigint("workflowId", { mode: "number", unsigned: true }),
    nodeKey: varchar("nodeKey", { length: 64 }),
    signedById: bigint("signedById", { mode: "number", unsigned: true }),
    signedByName: varchar("signedByName", { length: 255 }),
    signedAt: timestamp("signedAt"),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectIdx: index("exp_project_idx").on(table.projectId),
    statusIdx: index("exp_status_idx").on(table.status),
    amendmentUnique: uniqueIndex("exp_amendment_unique").on(table.amendsExperimentId),
  }),
);

export type Experiment = typeof experiments.$inferSelect;

// ─── 实验中消耗的样本 ───────────────────────────────────────────────────
export const experimentSamples = mysqlTable("experiment_samples", {
  id: serial("id").primaryKey(),
  experimentId: bigint("experimentId", {
    mode: "number",
    unsigned: true,
  }).notNull(),
  sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
  amountUsed: decimal("amountUsed", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  note: varchar("note", { length: 500 }),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExperimentSample = typeof experimentSamples.$inferSelect;

// ─── ELN 不可变版本与电子签名 ───────────────────────────────────────────
export const experimentRevisions = mysqlTable(
  "experiment_revisions",
  {
    id: serial("id").primaryKey(),
    experimentId: bigint("experimentId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    revision: int("revision").notNull(),
    snapshot: longtext("snapshot").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    changeReason: varchar("changeReason", { length: 500 }).notNull(),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
  },
  (table) => ({
    experimentRevisionUnique: uniqueIndex("eln_revision_unique").on(table.experimentId, table.revision),
    hashIdx: index("eln_revision_hash_idx").on(table.contentHash),
  }),
);

export const experimentSignatures = mysqlTable(
  "experiment_signatures",
  {
    id: serial("id").primaryKey(),
    experimentId: bigint("experimentId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    revisionId: bigint("revisionId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    revision: int("revision").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    meaning: mysqlEnum("meaning", ["reviewed_and_approved", "legacy_import"]).notNull(),
    statement: varchar("statement", { length: 500 }).notNull(),
    signedById: bigint("signedById", { mode: "number", unsigned: true }),
    signedByName: varchar("signedByName", { length: 255 }),
    signedAt: timestamp("signedAt", { fsp: 3 }).defaultNow().notNull(),
  },
  (table) => ({
    experimentUnique: uniqueIndex("eln_signature_experiment_unique").on(table.experimentId),
    revisionUnique: uniqueIndex("eln_signature_revision_unique").on(table.revisionId),
  }),
);

export type ExperimentRevision = typeof experimentRevisions.$inferSelect;
export type ExperimentSignature = typeof experimentSignatures.$inferSelect;

// ─── 存储位置（树形：实验室→冰箱→层架→冻存盒）──────────────────────────
export const storageLocations = mysqlTable("storage_locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["lab", "freezer", "fridge", "shelf", "rack", "box"]).notNull(),
  parentId: bigint("parentId", { mode: "number", unsigned: true }),
  temperature: varchar("temperature", { length: 20 }),
  rows: int("rows"),
  cols: int("cols"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StorageLocation = typeof storageLocations.$inferSelect;

// ─── 样本 ───────────────────────────────────────────────────────────────
export const samples = mysqlTable(
  "samples",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    type: mysqlEnum("type", [
      "cell_line",
      "plasmid",
      "primer",
      "antibody",
      "reagent",
      "chemical",
      "protein",
      "virus",
      "tissue",
      "buffer",
      "enzyme",
      "competent_cell",
      "other",
    ])
      .default("other")
      .notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
    unit: varchar("unit", { length: 20 }).default("管").notNull(),
    alertThreshold: decimal("alertThreshold", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    locationId: bigint("locationId", { mode: "number", unsigned: true }),
    boxRow: int("boxRow"),
    boxCol: int("boxCol"),
    /** 分子定义：该样本对应的序列记录（蛋白 AA / 质粒 DNA） */
    sequenceId: bigint("sequenceId", { mode: "number", unsigned: true }),
    projectId: bigint("projectId", { mode: "number", unsigned: true }),
    expiryDate: date("expiryDate", { mode: "string" }),
    notes: text("notes"),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp("archivedAt"),
  },
  (table) => ({
    typeIdx: index("sample_type_idx").on(table.type),
    locationIdx: index("sample_location_idx").on(table.locationId),
    boxPositionUnique: uniqueIndex("sample_box_position_unique").on(table.locationId, table.boxRow, table.boxCol),
  }),
);

export type Sample = typeof samples.$inferSelect;

// ─── 库存流水 ───────────────────────────────────────────────────────────
export const stockTransactions = mysqlTable(
  "stock_transactions",
  {
    id: serial("id").primaryKey(),
    sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
    delta: decimal("delta", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    quantityBefore: decimal("quantityBefore", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    quantityAfter: decimal("quantityAfter", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    reason: mysqlEnum("reason", ["restock", "consume", "adjust", "dispose", "transfer_out", "transfer_in"]).notNull(),
    note: varchar("note", { length: 500 }),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    userName: varchar("userName", { length: 255 }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    sampleCreatedIdx: index("stock_sample_created_idx").on(table.sampleId, table.createdAt),
    idempotencyUnique: uniqueIndex("stock_idempotency_unique").on(table.idempotencyKey),
  }),
);

export type StockTransaction = typeof stockTransactions.$inferSelect;

// ─── 序列库 ─────────────────────────────────────────────────────────────
export const sequences = mysqlTable("sequences", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["dna", "rna", "protein"]).default("dna").notNull(),
  sequence: text("sequence").notNull(),
  /** 蛋白三级结构（RCSB PDB ID），用于结构面板 */
  pdbId: varchar("pdbId", { length: 10 }),
  description: text("description"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sequence = typeof sequences.$inferSelect;

// ─── 序列特性注释（SnapGene 风格）──────────────────────────────────────
export const sequenceFeatures = mysqlTable("sequence_features", {
  id: serial("id").primaryKey(),
  sequenceId: bigint("sequenceId", {
    mode: "number",
    unsigned: true,
  }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "promoter",
    "cds",
    "resistance",
    "origin",
    "terminator",
    "tag",
    "primer_bind",
    "restriction_site",
    "regulatory",
    "other",
  ])
    .default("other")
    .notNull(),
  start: int("start").notNull(),
  end: int("end").notNull(),
  strand: int("strand").notNull().default(1),
  color: varchar("color", { length: 20 }).default("teal").notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SequenceFeature = typeof sequenceFeatures.$inferSelect;

// ─── 合成生物学 Pipeline ────────────────────────────────────────────────
export const pipelines = mysqlTable("pipelines", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "gibson_assembly",
    "golden_gate",
    "strain_engineering",
    "protein_expression",
    "dbtl_cycle",
    "custom",
  ]).notNull(),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  iteration: int("iteration").notNull().default(1),
  projectId: bigint("projectId", { mode: "number", unsigned: true }),
  description: text("description"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Pipeline = typeof pipelines.$inferSelect;

export const pipelineStages = mysqlTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  pipelineId: bigint("pipelineId", {
    mode: "number",
    unsigned: true,
  }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  orderIndex: int("orderIndex").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "done", "skipped"]).default("pending").notNull(),
  linkedExperimentId: bigint("linkedExperimentId", {
    mode: "number",
    unsigned: true,
  }),
  notes: text("notes"),
  completedAt: timestamp("completedAt"),
});

export type PipelineStage = typeof pipelineStages.$inferSelect;

// ─── 实验室设备 ─────────────────────────────────────────────────────────
export const equipment = mysqlTable("equipment", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["analytical", "execution", "automation", "support"]).notNull(),
  model: varchar("model", { length: 255 }),
  serialNo: varchar("serialNo", { length: 100 }),
  status: mysqlEnum("status", ["available", "in_use", "maintenance", "fault"]).default("available").notNull(),
  room: varchar("room", { length: 100 }),
  responsibleName: varchar("responsibleName", { length: 255 }),
  specs: text("specs"),
  nextCalibrationDate: date("nextCalibrationDate", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Equipment = typeof equipment.$inferSelect;

export const equipmentBookings = mysqlTable("equipment_bookings", {
  id: serial("id").primaryKey(),
  equipmentId: bigint("equipmentId", {
    mode: "number",
    unsigned: true,
  }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  purpose: varchar("purpose", { length: 500 }),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  status: mysqlEnum("status", ["active", "cancelled", "completed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EquipmentBooking = typeof equipmentBookings.$inferSelect;

export const equipmentMaintenance = mysqlTable("equipment_maintenance", {
  id: serial("id").primaryKey(),
  equipmentId: bigint("equipmentId", {
    mode: "number",
    unsigned: true,
  }).notNull(),
  type: mysqlEnum("type", ["calibration", "maintenance", "repair"]).notNull(),
  description: varchar("description", { length: 500 }),
  performedBy: varchar("performedBy", { length: 255 }),
  performedAt: timestamp("performedAt").notNull(),
  nextDueDate: date("nextDueDate", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EquipmentMaintenance = typeof equipmentMaintenance.$inferSelect;

// ─── 活动日志（审计追踪）────────────────────────────────────────────────
export const activities = mysqlTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    userName: varchar("userName", { length: 255 }),
    userId: bigint("userId", { mode: "number", unsigned: true }),
    source: varchar("source", { length: 30 }).default("web").notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    entityType: varchar("entityType", { length: 30 }).notNull(),
    entityId: bigint("entityId", { mode: "number", unsigned: true }),
    entityName: varchar("entityName", { length: 255 }),
    detail: text("detail"),
    beforeJson: longtext("beforeJson"),
    afterJson: longtext("afterJson"),
    reason: varchar("reason", { length: 500 }),
    previousHash: varchar("previousHash", { length: 64 }),
    hash: varchar("hash", { length: 64 }),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("activity_created_idx").on(table.createdAt),
    entityIdx: index("activity_entity_idx").on(table.entityType, table.entityId),
  }),
);

export type Activity = typeof activities.$inferSelect;

/** 单行锁，保证活动日志哈希链在并发写入时仍然保持线性。 */
export const auditState = mysqlTable("audit_state", {
  id: int("id").primaryKey(),
  lastHash: varchar("lastHash", { length: 64 }),
  updatedAt: timestamp("updatedAt", { fsp: 3 }).defaultNow().notNull(),
});

/** 并发安全的人类可读编号分配器（EXP-/SMP-）。 */
export const systemCounters = mysqlTable("system_counters", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: bigint("value", { mode: "number", unsigned: true }).notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── 样本全生命周期追溯（谱系图）：样本 / 序列混合 DAG ─────────────────
/** 边方向：child ← parent（child 由 parent 衍生），如 纯化蛋白 ←纯化自← 表达菌液 */
export const lineageEdges = mysqlTable(
  "lineage_edges",
  {
    id: serial("id").primaryKey(),
    childKind: mysqlEnum("childKind", ["sample", "sequence"]).notNull(),
    childId: bigint("childId", { mode: "number", unsigned: true }).notNull(),
    parentKind: mysqlEnum("parentKind", ["sample", "sequence"]).notNull(),
    parentId: bigint("parentId", { mode: "number", unsigned: true }).notNull(),
    /** expressed_from / purified_from / backbone_from / insert_from / aliquoted_from */
    relation: varchar("relation", { length: 40 }).notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    childIdx: index("lineage_child_idx").on(table.childKind, table.childId),
    parentIdx: index("lineage_parent_idx").on(table.parentKind, table.parentId),
  }),
);

export type LineageEdge = typeof lineageEdges.$inferSelect;

// ─── 外部委托（CRO / CDMO / 第三方检测）───────────────────────────────
export const serviceProviders = mysqlTable(
  "service_providers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    /** 关联内置 CRO 服务目录；为空时使用自由文本委托。 */
    catalogKey: varchar("catalogKey", { length: 64 }),
    type: mysqlEnum("type", ["cro", "cdmo", "testing_lab", "sequencing", "animal_facility", "academic_core", "other"])
      .default("cro")
      .notNull(),
    qualificationStatus: mysqlEnum("qualificationStatus", ["pending", "qualified", "restricted", "disqualified"])
      .default("pending")
      .notNull(),
    contactName: varchar("contactName", { length: 255 }),
    contactEmail: varchar("contactEmail", { length: 320 }),
    contactPhone: varchar("contactPhone", { length: 50 }),
    certifications: text("certifications"),
    specialties: text("specialties"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    providerNameUnique: uniqueIndex("service_provider_name_unique").on(table.name),
    catalogKeyUnique: uniqueIndex("service_provider_catalog_key_unique").on(table.catalogKey),
    qualificationIdx: index("service_provider_qualification_idx").on(table.qualificationStatus),
  }),
);

export type ServiceProvider = typeof serviceProviders.$inferSelect;

export const externalOrders = mysqlTable(
  "external_orders",
  {
    id: serial("id").primaryKey(),
    orderNo: varchar("orderNo", { length: 40 }).notNull(),
    projectId: bigint("projectId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    providerId: bigint("providerId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    objective: text("objective"),
    ownerName: varchar("ownerName", { length: 255 }),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
    commercialStatus: mysqlEnum("commercialStatus", [
      "draft",
      "quoting",
      "pending_approval",
      "approved",
      "ordered",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    executionStatus: mysqlEnum("executionStatus", [
      "awaiting_samples",
      "in_transit",
      "received",
      "in_progress",
      "delivered",
      "on_hold",
      "cancelled",
    ])
      .default("awaiting_samples")
      .notNull(),
    qualityStatus: mysqlEnum("qualityStatus", [
      "not_ready",
      "pending_review",
      "changes_requested",
      "accepted",
      "rejected",
    ])
      .default("not_ready")
      .notNull(),
    currency: varchar("currency", { length: 10 }).default("CNY").notNull(),
    quotedAmount: decimal("quotedAmount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    poNumber: varchar("poNumber", { length: 100 }),
    contractRef: varchar("contractRef", { length: 255 }),
    requestedAt: timestamp("requestedAt"),
    expectedDeliveryDate: date("expectedDeliveryDate", { mode: "string" }),
    actualDeliveryDate: date("actualDeliveryDate", { mode: "string" }),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderNoUnique: uniqueIndex("external_order_no_unique").on(table.orderNo),
    projectIdx: index("external_order_project_idx").on(table.projectId),
    providerIdx: index("external_order_provider_idx").on(table.providerId),
    deliveryIdx: index("external_order_delivery_idx").on(table.expectedDeliveryDate),
  }),
);

export type ExternalOrder = typeof externalOrders.$inferSelect;

export const externalOrderItems = mysqlTable(
  "external_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }),
    description: text("description"),
    quantity: int("quantity").default(1).notNull(),
    unit: varchar("unit", { length: 30 }).default("项").notNull(),
    protocolRef: varchar("protocolRef", { length: 255 }),
    acceptanceCriteria: text("acceptanceCriteria"),
    /** 内置服务模板的键与版本；需求数据保存为快照，避免目录升级改写历史订单。 */
    serviceTemplateKey: varchar("serviceTemplateKey", { length: 100 }),
    serviceTemplateVersion: int("serviceTemplateVersion"),
    requirementData: text("requirementData"),
    expectedDeliveryDate: date("expectedDeliveryDate", { mode: "string" }),
    status: mysqlEnum("status", ["pending", "in_progress", "delivered", "accepted", "rejected", "cancelled"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdx: index("external_order_item_order_idx").on(table.orderId),
  }),
);

export type ExternalOrderItem = typeof externalOrderItems.$inferSelect;

/** 外部委托明细与内部 ELN 实验的多对多关联。 */
export const externalOrderExperiments = mysqlTable(
  "external_order_experiments",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    orderItemId: bigint("orderItemId", { mode: "number", unsigned: true }),
    experimentId: bigint("experimentId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    relation: mysqlEnum("relation", ["source", "result_review", "reference"]).default("source").notNull(),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index("external_order_experiment_order_idx").on(table.orderId),
    experimentIdx: index("external_order_experiment_experiment_idx").on(table.experimentId),
    uniqueLink: uniqueIndex("external_order_experiment_unique").on(
      table.orderId,
      table.orderItemId,
      table.experimentId,
    ),
  }),
);

export type ExternalOrderExperiment = typeof externalOrderExperiments.$inferSelect;

export const externalOrderSamples = mysqlTable(
  "external_order_samples",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    orderItemId: bigint("orderItemId", { mode: "number", unsigned: true }),
    sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
    amount: decimal("amount", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    purpose: varchar("purpose", { length: 500 }),
    shipmentStatus: mysqlEnum("shipmentStatus", [
      "planned",
      "prepared",
      "shipped",
      "received",
      "returned",
      "consumed",
      "exception",
    ])
      .default("planned")
      .notNull(),
    carrier: varchar("carrier", { length: 100 }),
    trackingNo: varchar("trackingNo", { length: 100 }),
    direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
    sourceExternalOrderSampleId: bigint("sourceExternalOrderSampleId", {
      mode: "number",
      unsigned: true,
    }),
    outboundTransactionId: bigint("outboundTransactionId", {
      mode: "number",
      unsigned: true,
    }),
    returnTransactionId: bigint("returnTransactionId", {
      mode: "number",
      unsigned: true,
    }),
    returnedAmount: decimal("returnedAmount", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    shippedAt: timestamp("shippedAt"),
    receivedAt: timestamp("receivedAt"),
    returnedAt: timestamp("returnedAt"),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index("external_order_sample_order_idx").on(table.orderId),
    sampleIdx: index("external_order_sample_sample_idx").on(table.sampleId),
  }),
);

export type ExternalOrderSample = typeof externalOrderSamples.$inferSelect;

/** 样本在实验室、运输方和 CRO 之间的不可变交接事件。 */
export const externalSampleCustodyEvents = mysqlTable(
  "external_sample_custody_events",
  {
    id: serial("id").primaryKey(),
    externalOrderSampleId: bigint("externalOrderSampleId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
    eventType: mysqlEnum("eventType", [
      "planned",
      "prepared",
      "shipped",
      "received",
      "returned",
      "consumed",
      "exception",
      "produced",
    ]).notNull(),
    amount: decimal("amount", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    carrier: varchar("carrier", { length: 100 }),
    trackingNo: varchar("trackingNo", { length: 100 }),
    stockTransactionId: bigint("stockTransactionId", {
      mode: "number",
      unsigned: true,
    }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
  },
  (table) => ({
    shipmentIdx: index("external_custody_shipment_idx").on(table.externalOrderSampleId, table.createdAt),
    sampleIdx: index("external_custody_sample_idx").on(table.sampleId, table.createdAt),
    idempotencyUnique: uniqueIndex("external_custody_idempotency_unique").on(table.idempotencyKey),
  }),
);

export type ExternalSampleCustodyEvent = typeof externalSampleCustodyEvents.$inferSelect;

export const externalDeliverables = mysqlTable(
  "external_deliverables",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    orderItemId: bigint("orderItemId", { mode: "number", unsigned: true }),
    name: varchar("name", { length: 255 }).notNull(),
    type: mysqlEnum("type", ["raw_data", "report", "certificate", "protocol", "other"]).default("report").notNull(),
    fileUrl: text("fileUrl"),
    version: varchar("version", { length: 30 }).default("v1").notNull(),
    checksum: varchar("checksum", { length: 128 }),
    reviewStatus: mysqlEnum("reviewStatus", ["pending", "accepted", "changes_requested", "rejected"])
      .default("pending")
      .notNull(),
    notes: text("notes"),
    uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
    reviewedByName: varchar("reviewedByName", { length: 255 }),
  },
  (table) => ({
    orderIdx: index("external_deliverable_order_idx").on(table.orderId),
  }),
);

export type ExternalDeliverable = typeof externalDeliverables.$inferSelect;

/** CRO 返回的结构化检测结果；文件仍由 external_deliverables 管理。 */
export const externalResults = mysqlTable(
  "external_results",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).notNull(),
    orderItemId: bigint("orderItemId", { mode: "number", unsigned: true }),
    externalOrderSampleId: bigint("externalOrderSampleId", {
      mode: "number",
      unsigned: true,
    }),
    sampleId: bigint("sampleId", { mode: "number", unsigned: true }),
    sourceDeliverableId: bigint("sourceDeliverableId", {
      mode: "number",
      unsigned: true,
    }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }),
    metric: varchar("metric", { length: 255 }).notNull(),
    valueText: varchar("valueText", { length: 500 }).notNull(),
    numericValue: decimal("numericValue", {
      precision: 30,
      scale: 6,
      mode: "number",
    }),
    unit: varchar("unit", { length: 50 }),
    referenceRange: varchar("referenceRange", { length: 255 }),
    method: varchar("method", { length: 255 }),
    replicate: varchar("replicate", { length: 50 }),
    reviewStatus: mysqlEnum("reviewStatus", ["pending", "accepted", "changes_requested", "rejected"])
      .default("pending")
      .notNull(),
    notes: text("notes"),
    createdById: bigint("createdById", { mode: "number", unsigned: true }),
    createdByName: varchar("createdByName", { length: 255 }),
    reviewedAt: timestamp("reviewedAt"),
    reviewedByName: varchar("reviewedByName", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdx: index("external_result_order_idx").on(table.orderId),
    sampleIdx: index("external_result_sample_idx").on(table.sampleId),
    itemIdx: index("external_result_item_idx").on(table.orderItemId),
    idempotencyUnique: uniqueIndex("external_result_idempotency_unique").on(table.idempotencyKey),
  }),
);

export type ExternalResult = typeof externalResults.$inferSelect;

// ─── 业务流 DAG（合成生物学流程编排）────────────────────────────────────
export const workflows = mysqlTable("workflows", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  scenario: varchar("scenario", { length: 64 }).default("synbio").notNull(),
  status: mysqlEnum("status", ["draft", "active", "completed", "archived"]).default("draft").notNull(),
  projectId: bigint("projectId", { mode: "number", unsigned: true }),
  /** 归属的实验任务（项目 → 任务 → 业务流 三级追踪链） */
  experimentId: bigint("experimentId", { mode: "number", unsigned: true }),
  /** 子流程：指向父流程与父节点（穿透式层级 DAG） */
  parentWorkflowId: bigint("parentWorkflowId", {
    mode: "number",
    unsigned: true,
  }),
  parentNodeId: bigint("parentNodeId", { mode: "number", unsigned: true }),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workflow = typeof workflows.$inferSelect;

export const workflowNodes = mysqlTable(
  "workflow_nodes",
  {
    id: serial("id").primaryKey(),
    workflowId: bigint("workflowId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    nodeKey: varchar("nodeKey", { length: 64 }).notNull(),
    type: mysqlEnum("type", ["manual", "equipment", "decision", "data", "timer", "external"]).notNull(),
    templateKey: varchar("templateKey", { length: 64 }),
    label: varchar("label", { length: 255 }).notNull(),
    owner: varchar("owner", { length: 255 }),
    equipmentId: bigint("equipmentId", { mode: "number", unsigned: true }),
    /** 外部委托节点仅保存关联明细，委托单是状态与交付物的唯一数据源。 */
    externalOrderItemId: bigint("externalOrderItemId", {
      mode: "number",
      unsigned: true,
    }),
    /** 子流程：该节点下钻挂接的子业务流 */
    childWorkflowId: bigint("childWorkflowId", {
      mode: "number",
      unsigned: true,
    }),
    config: text("config"),
    params: text("params"),
    status: mysqlEnum("status", ["pending", "in_progress", "done", "skipped"]).default("pending").notNull(),
    posX: int("posX").notNull().default(0),
    posY: int("posY").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    wfIdx: index("wfnode_wf_idx").on(table.workflowId),
    workflowNodeUnique: uniqueIndex("wfnode_workflow_key_unique").on(table.workflowId, table.nodeKey),
  }),
);

export type WorkflowNode = typeof workflowNodes.$inferSelect;

export const workflowEdges = mysqlTable(
  "workflow_edges",
  {
    id: serial("id").primaryKey(),
    workflowId: bigint("workflowId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    edgeKey: varchar("edgeKey", { length: 64 }).notNull(),
    sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
    targetKey: varchar("targetKey", { length: 64 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 16 }),
    label: varchar("label", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    wfIdx: index("wfedge_wf_idx").on(table.workflowId),
    workflowEdgeUnique: uniqueIndex("wfedge_workflow_key_unique").on(table.workflowId, table.edgeKey),
  }),
);

export type WorkflowEdge = typeof workflowEdges.$inferSelect;
