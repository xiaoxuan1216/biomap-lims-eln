import { getDb } from "../api/queries/connection";
import { projects } from "./schema";
import { sql } from "drizzle-orm";
console.log("start");
const db = getDb();
const [r] = await db.select({ n: sql<number>`COUNT(*)` }).from(projects);
console.log("count:", r?.n);
process.exit(0);
