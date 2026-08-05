import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const tx = await db.execute(sql`SELECT * FROM stock_transactions ORDER BY id DESC LIMIT 4`);
console.log("stock tx:", JSON.stringify(tx[0]).slice(0, 800));
const mx = await db.execute(sql`SELECT MAX(code) m FROM experiments`);
console.log("max code:", JSON.stringify(mx[0]));
process.exit(0);
