import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const tables = ["projects","experiments","experiment_samples","storage_locations","samples","stock_transactions","sequences","sequence_features","pipelines","pipeline_stages","equipment","equipment_bookings","equipment_maintenance","activities","workflows","workflow_nodes","workflow_edges"];
for (const t of tables) {
  const [r] = await db.execute(sql.raw(`SELECT COUNT(*) n FROM ${t}`));
  console.log(t, (r as any)[0].n);
}
process.exit(0);
