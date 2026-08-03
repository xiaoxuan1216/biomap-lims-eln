import { getDb } from "../api/queries/connection";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import { signSessionToken } from "../api/kimi/session";
import fs from "node:fs";

const db = getDb();
const UNION_ID = "demo-qa-user";
const [exist] = await db.select().from(users).where(eq(users.unionId, UNION_ID));
if (!exist) {
  await db.insert(users).values({ unionId: UNION_ID, name: "QA Demo", role: "admin", lastSignInAt: new Date() });
}
const token = await signSessionToken({ unionId: UNION_ID, clientId: "qa" });
fs.writeFileSync("/tmp/token.txt", token);
console.log("token ok", token.slice(0, 24));
process.exit(0);
