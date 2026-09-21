import "dotenv/config";
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/biomap_v15_qa";
process.env.DATABASE_URL = url.toString();
const { migrateDatabase } = await import("../../api/queries/migrate.ts");
await migrateDatabase();
console.log("v15 isolated database migrations passed");
process.exit(0);
