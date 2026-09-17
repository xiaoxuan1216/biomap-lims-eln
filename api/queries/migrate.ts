import path from "node:path";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb } from "./connection";
import { initializeAuditChain } from "./labHelpers";
import { initializeElnHistory } from "../services/elnService";

const MIGRATIONS_TABLE = "__drizzle_migrations";
const migrationsFolder = path.resolve(process.cwd(), "db/migrations");

type CountRow = { n: number | string };
type ColumnRow = { Field: string; Type: string };
type DuplicateRow = Record<string, string | number> & { n: number | string };

async function tableExists(table: string): Promise<boolean> {
  const db = getDb();
  const [rows] = (await db.execute(sql`
    SELECT COUNT(*) AS n
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `)) as unknown as [CountRow[], unknown];
  return Number(rows[0]?.n ?? 0) > 0;
}

async function migrationCount(): Promise<number> {
  if (!(await tableExists(MIGRATIONS_TABLE))) return 0;
  const [rows] = (await getDb().execute(
    sql.raw(`SELECT COUNT(*) AS n FROM \`${MIGRATIONS_TABLE}\``),
  )) as unknown as [CountRow[], unknown];
  return Number(rows[0]?.n ?? 0);
}

async function columnsFor(table: string): Promise<Map<string, ColumnRow>> {
  const [rows] = (await getDb().execute(
    sql.raw(`SHOW COLUMNS FROM \`${table}\``),
  )) as unknown as [ColumnRow[], unknown];
  return new Map(rows.map((row) => [row.Field, row]));
}

async function ensureColumn(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if ((await columnsFor(table)).has(column)) return;
  await getDb().execute(
    sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`),
  );
  console.log(`[migrate] legacy column added: ${table}.${column}`);
}

async function assertNoLegacyKeyConflicts(): Promise<void> {
  const checks = [
    {
      label: "冻存盒格位",
      query: `SELECT locationId, boxRow, boxCol, COUNT(*) AS n
        FROM samples
        WHERE locationId IS NOT NULL AND boxRow IS NOT NULL AND boxCol IS NOT NULL
        GROUP BY locationId, boxRow, boxCol HAVING COUNT(*) > 1 LIMIT 5`,
    },
    {
      label: "业务流节点标识",
      query: `SELECT workflowId, nodeKey, COUNT(*) AS n
        FROM workflow_nodes GROUP BY workflowId, nodeKey HAVING COUNT(*) > 1 LIMIT 5`,
    },
    {
      label: "业务流连线标识",
      query: `SELECT workflowId, edgeKey, COUNT(*) AS n
        FROM workflow_edges GROUP BY workflowId, edgeKey HAVING COUNT(*) > 1 LIMIT 5`,
    },
  ];
  for (const check of checks) {
    const [rows] = (await getDb().execute(sql.raw(check.query))) as unknown as [
      DuplicateRow[],
      unknown,
    ];
    if (rows.length) {
      throw new Error(
        `[migrate] ${check.label}存在重复数据，需先清理后再升级：${JSON.stringify(rows)}`,
      );
    }
  }
}

/**
 * Adopt databases created by the pre-v8 startup DDL. This path runs once, then
 * records the generated baseline migration so all future changes use the same
 * append-only migration history as fresh installations.
 */
async function adoptLegacySchema(): Promise<void> {
  const db = getDb();

  await ensureColumn("experiments", "workflowId", "BIGINT UNSIGNED NULL AFTER `content`");
  await ensureColumn("experiments", "nodeKey", "VARCHAR(64) NULL AFTER `workflowId`");
  await ensureColumn("samples", "sequenceId", "BIGINT UNSIGNED NULL AFTER `boxCol`");
  await ensureColumn("sequences", "pdbId", "VARCHAR(10) NULL AFTER `sequence`");
  await ensureColumn("workflows", "experimentId", "BIGINT UNSIGNED NULL AFTER `projectId`");
  await ensureColumn("workflows", "parentWorkflowId", "BIGINT UNSIGNED NULL AFTER `experimentId`");
  await ensureColumn("workflows", "parentNodeId", "BIGINT UNSIGNED NULL AFTER `parentWorkflowId`");
  await ensureColumn("workflow_nodes", "childWorkflowId", "BIGINT UNSIGNED NULL AFTER `equipmentId`");
  await ensureColumn("workflow_nodes", "params", "TEXT NULL AFTER `config`");

  const sampleType = (await columnsFor("samples")).get("type")?.Type ?? "";
  if (!sampleType.includes("competent_cell")) {
    await db.execute(sql.raw(
      "ALTER TABLE `samples` MODIFY COLUMN `type` ENUM('cell_line','plasmid','primer','antibody','reagent','chemical','protein','virus','tissue','buffer','enzyme','competent_cell','other') NOT NULL DEFAULT 'other'",
    ));
  }

  const nodeType = (await columnsFor("workflow_nodes")).get("type")?.Type ?? "";
  if (!nodeType.includes("timer")) {
    await db.execute(sql.raw(
      "ALTER TABLE `workflow_nodes` MODIFY COLUMN `type` ENUM('manual','equipment','decision','data','timer') NOT NULL",
    ));
  }

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`lineage_edges\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`childKind\` ENUM('sample','sequence') NOT NULL,
      \`childId\` BIGINT UNSIGNED NOT NULL,
      \`parentKind\` ENUM('sample','sequence') NOT NULL,
      \`parentId\` BIGINT UNSIGNED NOT NULL,
      \`relation\` VARCHAR(40) NOT NULL,
      \`note\` TEXT,
      \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`lineage_child_idx\` (\`childKind\`, \`childId\`),
      INDEX \`lineage_parent_idx\` (\`parentKind\`, \`parentId\`)
    )
  `));

  const [baseline] = readMigrationFiles({ migrationsFolder });
  if (!baseline) throw new Error("Baseline migration is missing");
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`hash\` TEXT NOT NULL,
      \`created_at\` BIGINT
    )
  `));
  await db.execute(sql`
    INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} (\`hash\`, \`created_at\`)
    VALUES (${baseline.hash}, ${baseline.folderMillis})
  `);
  console.log("[migrate] adopted legacy schema at baseline");
}

let migrationTask: Promise<void> | undefined;

export function migrateDatabase(): Promise<void> {
  migrationTask ??= runMigrations();
  return migrationTask;
}

async function runMigrations(): Promise<void> {
  const isLegacy = await tableExists("users");
  if (isLegacy) await assertNoLegacyKeyConflicts();
  if (isLegacy && (await migrationCount()) === 0) {
    await adoptLegacySchema();
  }

  await migrate(getDb(), { migrationsFolder, migrationsTable: MIGRATIONS_TABLE });
  await initializeAuditChain();
  await initializeElnHistory();
  console.log("[migrate] database schema is current");
}
