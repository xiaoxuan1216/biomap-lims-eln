import { getDb } from "../api/queries/connection";
import { storageLocations } from "./schema";
const db = getDb();
const rows = await db.select().from(storageLocations);
for (const r of rows) console.log(r.id, r.type, r.name, "parent:", r.parentId);
process.exit(0);
