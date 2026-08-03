import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "node:fs";
const db = getDb();
const tables = ["projects","experiments","experiment_samples","storage_locations","samples","stock_transactions","sequences","sequence_features","equipment","equipment_bookings","equipment_maintenance","activities","workflows","workflow_nodes","workflow_edges"];
const out: any = {};
for (const t of tables) {
  const [rows] = await db.execute(sql.raw(`SELECT * FROM ${t}`));
  out[t] = rows;
}
fs.writeFileSync("/tmp/dbdump.json", JSON.stringify(out, null, 1));
console.log("done");
process.exit(0);
