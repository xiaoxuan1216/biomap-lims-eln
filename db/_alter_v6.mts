import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const cols = (await db.execute(sql`SHOW COLUMNS FROM experiments`))[0] as unknown as any[];
const names = cols.map((c) => c.Field);
if (!names.includes("workflowId")) {
  await db.execute(sql`ALTER TABLE experiments ADD COLUMN workflowId BIGINT UNSIGNED NULL AFTER content`);
  console.log("added workflowId");
}
if (!names.includes("nodeKey")) {
  await db.execute(sql`ALTER TABLE experiments ADD COLUMN nodeKey VARCHAR(64) NULL AFTER workflowId`);
  console.log("added nodeKey");
}
console.log("done");
process.exit(0);
