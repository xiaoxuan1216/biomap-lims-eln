import { getDb } from "../api/queries/connection";
import { users } from "./schema";
const db = getDb();
const r = await db.select().from(users);
r.forEach((u) => console.log(u.id, "|", u.unionId, "|", u.name, "|", u.role));
process.exit(0);
