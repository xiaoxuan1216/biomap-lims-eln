import { validRecordTime, type StepRecordRow, type StepRecordSpec } from "./stepRecords";

// Excel/Sheets clipboard TSV, including quoted tabs, newlines and escaped quotes.
function table(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += char; continue; }
    if (char === '"' && !cell && !closed) { quoted = true; continue; }
    if (char === "\t") { row.push(cell); cell = ""; closed = false; continue; }
    if (char === "\r" || char === "\n") { if (char === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; closed = false; continue; }
    if (closed) throw new Error("粘贴内容的引号格式不完整");
    cell += char;
  }
  if (quoted) throw new Error("粘贴内容的引号格式不完整");
  row.push(cell); rows.push(row);
  return rows.filter(row => row.some(value => value.trim()));
}

export function parseStepRecordPaste(text: string, spec: StepRecordSpec, samples: { sampleId: number; sku: string }[]): Omit<StepRecordRow, "id">[] {
  if (!text.trim() || text.length > 500_000) throw new Error("请粘贴不超过 200 行的实验记录");
  const rows = table(text);
  const header = rows[0];
  if (header && ["样本编号", "Sample codes"].includes(header[0].trim())) {
    if (header.length !== spec.fields.length + 1 || header.slice(1).some((label, index) => { const field = spec.fields[index]; return ![field.key, field.label, field.labelEn, `${field.label} (${field.unit})`, `${field.labelEn} (${field.unit})`].includes(label.trim()); })) throw new Error("表头与本步骤字段不一致，请复制当前表头后重试");
    rows.shift();
  }
  if (!rows.length || rows.length > 200) throw new Error("请粘贴不超过 200 行的实验记录");
  const bySku = new Map(samples.map(sample => [sample.sku, sample.sampleId]));
  return rows.map(row => {
    if (row.length > spec.fields.length + 1) throw new Error("粘贴列数超过本步骤字段数，请核对表头");
    const skus = row[0].split(/[,，;；]/).map(value => value.trim()).filter(Boolean);
    if (!skus.length || skus.some(sku => !bySku.has(sku)) || new Set(skus).size !== skus.length) throw new Error("粘贴记录包含空白、重复或不属于本批的样本编号");
    return { sampleIds: skus.map(sku => bySku.get(sku)!), values: Object.fromEntries(spec.fields.map((field, index) => {
      let value = (row[index + 1] ?? "").trim();
      if (value.length > 2000) throw new Error("单个记录字段不能超过 2000 个字符");
      if (value && field.kind === "datetime") {
        // A spreadsheet's local timestamp has the same meaning as the manual
        // datetime-local input. Reject rollover dates rather than normalizing them.
        const local = value.replace(" ", "T");
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) {
          if (!validRecordTime(`${local}Z`)) throw new Error("粘贴记录中的日期时间无效");
          const date = new Date(local);
          if (Number.isNaN(date.getTime())) throw new Error("粘贴记录中的日期时间无效");
          value = date.toISOString();
        } else if (!validRecordTime(value)) throw new Error("粘贴记录中的日期时间无效");
      }
      return [field.key, value];
    })) };
  });
}
