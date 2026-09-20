import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const fixture = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
const [user] = await getDb().select().from(users).where(eq(users.id, 54));
if (!user || user.role === "viewer") throw new Error("Existing QA operator unavailable");
writeFileSync("/tmp/v18-ui-token", await signSessionToken({ unionId: user.unionId }), { mode: 0o600 });

console.log("QA session refreshed"); process.exit(0);
