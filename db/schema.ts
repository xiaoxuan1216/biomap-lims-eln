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
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  status: mysqlEnum("status", ["active", "on_hold", "completed"])
    .default("active")
    .notNull(),
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
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    objective: text("objective"),
    status: mysqlEnum("status", [
      "planning",
      "in_progress",
      "completed",
      "signed",
    ])
      .default("planning")
      .notNull(),
    content: longtext("content"),
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
  }),
);

export type Experiment = typeof experiments.$inferSelect;

// ─── 实验中消耗的样本 ───────────────────────────────────────────────────
export const experimentSamples = mysqlTable("experiment_samples", {
  id: serial("id").primaryKey(),
  experimentId: bigint("experimentId", { mode: "number", unsigned: true }).notNull(),
  sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
  amountUsed: decimal("amountUsed", { precision: 14, scale: 3, mode: "number" })
    .notNull()
    .default(0),
  note: varchar("note", { length: 500 }),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExperimentSample = typeof experimentSamples.$inferSelect;

// ─── 存储位置（树形：实验室→冰箱→层架→冻存盒）──────────────────────────
export const storageLocations = mysqlTable("storage_locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["lab", "freezer", "fridge", "shelf", "rack", "box"])
    .notNull(),
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
      "other",
    ])
      .default("other")
      .notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    unit: varchar("unit", { length: 20 }).default("管").notNull(),
    alertThreshold: decimal("alertThreshold", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    locationId: bigint("locationId", { mode: "number", unsigned: true }),
    boxRow: int("boxRow"),
    boxCol: int("boxCol"),
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
  },
  (table) => ({
    typeIdx: index("sample_type_idx").on(table.type),
    locationIdx: index("sample_location_idx").on(table.locationId),
  }),
);

export type Sample = typeof samples.$inferSelect;

// ─── 库存流水 ───────────────────────────────────────────────────────────
export const stockTransactions = mysqlTable("stock_transactions", {
  id: serial("id").primaryKey(),
  sampleId: bigint("sampleId", { mode: "number", unsigned: true }).notNull(),
  delta: decimal("delta", { precision: 14, scale: 3, mode: "number" }).notNull(),
  reason: mysqlEnum("reason", ["restock", "consume", "adjust", "dispose"]).notNull(),
  note: varchar("note", { length: 500 }),
  userName: varchar("userName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockTransaction = typeof stockTransactions.$inferSelect;

// ─── 序列库 ─────────────────────────────────────────────────────────────
export const sequences = mysqlTable("sequences", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["dna", "rna", "protein"]).default("dna").notNull(),
  sequence: text("sequence").notNull(),
  description: text("description"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sequence = typeof sequences.$inferSelect;

// ─── 序列特性注释（SnapGene 风格）──────────────────────────────────────
export const sequenceFeatures = mysqlTable("sequence_features", {
  id: serial("id").primaryKey(),
  sequenceId: bigint("sequenceId", { mode: "number", unsigned: true }).notNull(),
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
  status: mysqlEnum("status", ["active", "paused", "completed"])
    .default("active")
    .notNull(),
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
  pipelineId: bigint("pipelineId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  orderIndex: int("orderIndex").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "done", "skipped"])
    .default("pending")
    .notNull(),
  linkedExperimentId: bigint("linkedExperimentId", { mode: "number", unsigned: true }),
  notes: text("notes"),
  completedAt: timestamp("completedAt"),
});

export type PipelineStage = typeof pipelineStages.$inferSelect;

// ─── 实验室设备 ─────────────────────────────────────────────────────────
export const equipment = mysqlTable("equipment", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", [
    "analytical",
    "execution",
    "automation",
    "support",
  ]).notNull(),
  model: varchar("model", { length: 255 }),
  serialNo: varchar("serialNo", { length: 100 }),
  status: mysqlEnum("status", ["available", "in_use", "maintenance", "fault"])
    .default("available")
    .notNull(),
  room: varchar("room", { length: 100 }),
  responsibleName: varchar("responsibleName", { length: 255 }),
  specs: text("specs"),
  nextCalibrationDate: date("nextCalibrationDate", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Equipment = typeof equipment.$inferSelect;

export const equipmentBookings = mysqlTable("equipment_bookings", {
  id: serial("id").primaryKey(),
  equipmentId: bigint("equipmentId", { mode: "number", unsigned: true }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  purpose: varchar("purpose", { length: 500 }),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  status: mysqlEnum("status", ["active", "cancelled", "completed"])
    .default("active")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EquipmentBooking = typeof equipmentBookings.$inferSelect;

export const equipmentMaintenance = mysqlTable("equipment_maintenance", {
  id: serial("id").primaryKey(),
  equipmentId: bigint("equipmentId", { mode: "number", unsigned: true }).notNull(),
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
    action: varchar("action", { length: 50 }).notNull(),
    entityType: varchar("entityType", { length: 30 }).notNull(),
    entityId: bigint("entityId", { mode: "number", unsigned: true }),
    entityName: varchar("entityName", { length: 255 }),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("activity_created_idx").on(table.createdAt),
  }),
);

export type Activity = typeof activities.$inferSelect;

// ─── 业务流 DAG（合成生物学流程编排）────────────────────────────────────
export const workflows = mysqlTable("workflows", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  scenario: varchar("scenario", { length: 64 }).default("synbio").notNull(),
  status: mysqlEnum("status", ["draft", "active", "completed", "archived"])
    .default("draft")
    .notNull(),
  projectId: bigint("projectId", { mode: "number", unsigned: true }),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workflow = typeof workflows.$inferSelect;

export const workflowNodes = mysqlTable(
  "workflow_nodes",
  {
    id: serial("id").primaryKey(),
    workflowId: bigint("workflowId", { mode: "number", unsigned: true }).notNull(),
    nodeKey: varchar("nodeKey", { length: 64 }).notNull(),
    type: mysqlEnum("type", ["manual", "equipment", "decision", "data", "timer"]).notNull(),
    templateKey: varchar("templateKey", { length: 64 }),
    label: varchar("label", { length: 255 }).notNull(),
    owner: varchar("owner", { length: 255 }),
    equipmentId: bigint("equipmentId", { mode: "number", unsigned: true }),
    config: text("config"),
    params: text("params"),
    status: mysqlEnum("status", ["pending", "in_progress", "done", "skipped"])
      .default("pending")
      .notNull(),
    posX: int("posX").notNull().default(0),
    posY: int("posY").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    wfIdx: index("wfnode_wf_idx").on(table.workflowId),
  }),
);

export type WorkflowNode = typeof workflowNodes.$inferSelect;

export const workflowEdges = mysqlTable(
  "workflow_edges",
  {
    id: serial("id").primaryKey(),
    workflowId: bigint("workflowId", { mode: "number", unsigned: true }).notNull(),
    edgeKey: varchar("edgeKey", { length: 64 }).notNull(),
    sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
    targetKey: varchar("targetKey", { length: 64 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 16 }),
    label: varchar("label", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    wfIdx: index("wfedge_wf_idx").on(table.workflowId),
  }),
);

export type WorkflowEdge = typeof workflowEdges.$inferSelect;
