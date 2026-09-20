/** Barcode/SKU lists only. Never guess by a partial name or silently import a partial batch. */
export function resolveSampleBatch<T extends { id: number; sku: string }>(raw: string, resources: T[]) {
  const codes = [...new Set(raw.trim().split(/[\s,;，；]+/).filter(Boolean))];
  if (!codes.length || codes.length > 200) return { samples: [] as T[], errors: ["请输入 1 至 200 个样本编号"] };
  const samples: T[] = [], errors: string[] = [];
  for (const code of codes) {
    const matches = resources.filter(resource => resource.sku === code);
    if (matches.length !== 1) errors.push(code);
    else samples.push(matches[0]);
  }
  return { samples: errors.length ? [] : samples, errors };
}
