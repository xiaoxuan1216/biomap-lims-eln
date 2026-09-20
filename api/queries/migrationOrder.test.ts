import { expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { assertMigrationOrder } from "./migrationOrder";
it("rejects the clock skew that would silently skip a later migration", () => {
  expect(() => assertMigrationOrder([{ folderMillis: 100 }, { folderMillis: 99 }])).toThrow(/silently skip/);
  expect(() => assertMigrationOrder([{ folderMillis: 100 }, { folderMillis: 100 }])).toThrow();
  expect(() => assertMigrationOrder(readMigrationFiles({ migrationsFolder: "db/migrations" }))).not.toThrow();
});
