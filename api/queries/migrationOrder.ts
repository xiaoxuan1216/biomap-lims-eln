export function assertMigrationOrder(migrations: readonly { folderMillis: number }[]) {
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].folderMillis <= migrations[i - 1].folderMillis) {
      throw new Error(`Migration ${i} is not newer than its predecessor; refusing to silently skip a schema upgrade.`);
    }
  }
}
