import { getDb } from "../api/queries/connection";
import { eq } from "drizzle-orm";
import { users } from "./schema";
const db = getDb();
await db.update(users).set({ name: "Xiaoxuan" }).where(eq(users.id, 2000001));
const u = await db.query.users.findFirst({ where: eq(users.id, 2000001) });
console.log("user:", u?.id, u?.name);
process.exit(0);
