import { sql } from "drizzle-orm";
import { getDb } from "./connection";
import { projects } from "@db/schema";

/**
 * 启动时自愈：确保数据库架构存在（幂等 CREATE TABLE IF NOT EXISTS），
 * 并在空库时自动注入演示数据。
 * 解决部署环境数据库为全新实例、手工迁移脚本未曾运行导致的缺表问题。
 */

const DDLS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    unionId varchar(255) NOT NULL,
    name varchar(255),
    email varchar(320),
    avatar text,
    role enum('user','admin') NOT NULL DEFAULT 'user',
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    lastSignInAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY users_unionId_unique (unionId)
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    description text,
    color varchar(20) NOT NULL DEFAULT 'teal',
    status enum('active','on_hold','completed') NOT NULL DEFAULT 'active',
    createdById bigint unsigned,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experiments (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code varchar(30) NOT NULL,
    projectId bigint unsigned NOT NULL,
    title varchar(255) NOT NULL,
    objective text,
    status enum('planning','in_progress','completed','signed') NOT NULL DEFAULT 'planning',
    content longtext,
    signedById bigint unsigned,
    signedByName varchar(255),
    signedAt timestamp NULL,
    createdById bigint unsigned,
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY experiments_code_unique (code),
    INDEX exp_project_idx (projectId),
    INDEX exp_status_idx (status)
  )`,
  `CREATE TABLE IF NOT EXISTS experiment_samples (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    experimentId bigint unsigned NOT NULL,
    sampleId bigint unsigned NOT NULL,
    amountUsed decimal(14,3) NOT NULL DEFAULT 0,
    note varchar(500),
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS storage_locations (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    type enum('lab','freezer','fridge','shelf','rack','box') NOT NULL,
    parentId bigint unsigned,
    temperature varchar(20),
    \`rows\` int,
    cols int,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS samples (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sku varchar(30) NOT NULL,
    name varchar(255) NOT NULL,
    type enum('cell_line','plasmid','primer','antibody','reagent','chemical','protein','virus','tissue','other') NOT NULL DEFAULT 'other',
    quantity decimal(14,3) NOT NULL DEFAULT 0,
    unit varchar(20) NOT NULL DEFAULT '管',
    alertThreshold decimal(14,3),
    locationId bigint unsigned,
    boxRow int,
    boxCol int,
    projectId bigint unsigned,
    expiryDate date,
    notes text,
    createdById bigint unsigned,
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY samples_sku_unique (sku),
    INDEX sample_type_idx (type),
    INDEX sample_location_idx (locationId)
  )`,
  `CREATE TABLE IF NOT EXISTS stock_transactions (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sampleId bigint unsigned NOT NULL,
    delta decimal(14,3) NOT NULL,
    reason enum('restock','consume','adjust','dispose') NOT NULL,
    note varchar(500),
    userName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sequences (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    type enum('dna','rna','protein') NOT NULL DEFAULT 'dna',
    sequence text NOT NULL,
    description text,
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userName varchar(255),
    action varchar(50) NOT NULL,
    entityType varchar(30) NOT NULL,
    entityId bigint unsigned,
    entityName varchar(255),
    detail text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX activity_created_idx (createdAt)
  )`,
  `CREATE TABLE IF NOT EXISTS sequence_features (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sequenceId bigint unsigned NOT NULL,
    name varchar(255) NOT NULL,
    type enum('promoter','cds','resistance','origin','terminator','tag','primer_bind','restriction_site','regulatory','other') NOT NULL DEFAULT 'other',
    start int NOT NULL,
    end int NOT NULL,
    strand int NOT NULL DEFAULT 1,
    color varchar(20) NOT NULL DEFAULT 'teal',
    note varchar(500),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pipelines (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    type enum('gibson_assembly','golden_gate','strain_engineering','protein_expression','dbtl_cycle','custom') NOT NULL,
    status enum('active','paused','completed') NOT NULL DEFAULT 'active',
    iteration int NOT NULL DEFAULT 1,
    projectId bigint unsigned,
    description text,
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_stages (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    pipelineId bigint unsigned NOT NULL,
    name varchar(255) NOT NULL,
    orderIndex int NOT NULL,
    status enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
    linkedExperimentId bigint unsigned,
    notes text,
    completedAt timestamp NULL
  )`,
  `CREATE TABLE IF NOT EXISTS equipment (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    category enum('analytical','execution','automation','support') NOT NULL,
    model varchar(255),
    serialNo varchar(100),
    status enum('available','in_use','maintenance','fault') NOT NULL DEFAULT 'available',
    room varchar(100),
    responsibleName varchar(255),
    specs text,
    nextCalibrationDate date,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS equipment_bookings (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    equipmentId bigint unsigned NOT NULL,
    userName varchar(255) NOT NULL,
    purpose varchar(500),
    startTime timestamp NOT NULL,
    endTime timestamp NOT NULL,
    status enum('active','cancelled','completed') NOT NULL DEFAULT 'active',
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS equipment_maintenance (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    equipmentId bigint unsigned NOT NULL,
    type enum('calibration','maintenance','repair') NOT NULL,
    description varchar(500),
    performedBy varchar(255),
    performedAt timestamp NOT NULL,
    nextDueDate date,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS workflows (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL,
    description text,
    scenario varchar(64) NOT NULL DEFAULT 'synbio',
    status enum('draft','active','completed','archived') NOT NULL DEFAULT 'draft',
    projectId bigint unsigned,
    createdByName varchar(255),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS workflow_nodes (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    workflowId bigint unsigned NOT NULL,
    nodeKey varchar(64) NOT NULL,
    type enum('manual','equipment','decision','data','timer') NOT NULL,
    templateKey varchar(64),
    label varchar(255) NOT NULL,
    owner varchar(255),
    equipmentId bigint unsigned,
    config text,
    params text,
    status enum('pending','in_progress','done','skipped') NOT NULL DEFAULT 'pending',
    posX int NOT NULL DEFAULT 0,
    posY int NOT NULL DEFAULT 0,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX wfnode_wf_idx (workflowId)
  )`,
  `CREATE TABLE IF NOT EXISTS workflow_edges (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    workflowId bigint unsigned NOT NULL,
    edgeKey varchar(64) NOT NULL,
    sourceKey varchar(64) NOT NULL,
    targetKey varchar(64) NOT NULL,
    sourceHandle varchar(16),
    label varchar(64),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX wfedge_wf_idx (workflowId)
  )`,
];

let task: Promise<void> | null = null;

/** 幂等：每个进程只执行一次（共享同一个 Promise）；失败不阻断服务启动（错误打日志） */
export function ensureSchemaAndSeed(): Promise<void> {
  if (!task) task = run();
  return task;
}

async function run(): Promise<void> {
  try {
    const db = getDb();
    for (const ddl of DDLS) {
      await db.execute(sql.raw(ddl));
    }

    // ── 存量库的增量列/枚举升级（幂等）──
    // workflow_nodes.params 列
    const [pRows] = (await db.execute(
      sql.raw(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='workflow_nodes' AND COLUMN_NAME='params'",
      ),
    )) as unknown as [{ n: number }[], unknown];
    if (Number(pRows[0]?.n ?? 0) === 0) {
      await db.execute(sql.raw("ALTER TABLE workflow_nodes ADD COLUMN params text"));
      console.log("[ensure] added workflow_nodes.params");
    }
    // workflow_nodes.type 枚举加入 timer
    const [tRows] = (await db.execute(
      sql.raw(
        "SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='workflow_nodes' AND COLUMN_NAME='type'",
      ),
    )) as unknown as [{ ct: string }[], unknown];
    if (tRows[0]?.ct && !tRows[0].ct.includes("timer")) {
      await db.execute(
        sql.raw("ALTER TABLE workflow_nodes MODIFY COLUMN type enum('manual','equipment','decision','data','timer') NOT NULL"),
      );
      console.log("[ensure] workflow_nodes.type enum extended with timer");
    }

    console.log(`[ensure] schema ok (${DDLS.length} tables verified)`);

    // 空库（全新部署）时自动注入演示数据
    const [r] = await db.select({ n: sql<number>`COUNT(*)` }).from(projects);
    if (Number(r?.n ?? 0) === 0) {
      console.log("[ensure] empty database detected, seeding demo data...");
      const { seed: seedV1 } = await import("../../db/seed");
      const { seed: seedV2 } = await import("../../db/seed2");
      const { seed: seedV3 } = await import("../../db/seed3");
      await seedV1();
      await seedV2();
      await seedV3();
      console.log("[ensure] demo data seeded");
    }
  } catch (e) {
    console.error("[ensure] schema ensure failed (service continues):", e);
  }
}
