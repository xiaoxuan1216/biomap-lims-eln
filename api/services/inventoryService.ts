import { and, eq, isNull } from "drizzle-orm";
import { samples, stockTransactions } from "@db/schema";
import { appendActivity, type DatabaseTransaction } from "../queries/labHelpers";
import { getDb } from "../queries/connection";

export type InventoryReason = "restock" | "consume" | "adjust" | "dispose";

export class InventoryError extends Error {
  public readonly kind: "not_found" | "invalid" | "insufficient";

  constructor(
    kind: "not_found" | "invalid" | "insufficient",
    message: string,
  ) {
    super(message);
    this.kind = kind;
    this.name = "InventoryError";
  }
}

export interface InventoryChangeInput {
  sampleId: number;
  delta: number;
  reason: InventoryReason;
  note?: string | null;
  actorId?: number | null;
  actorName?: string | null;
  source?: "web" | "api" | "mcp" | "system";
  idempotencyKey?: string | null;
}

export interface InventoryChangeResult {
  transactionId: number;
  sampleId: number;
  quantityBefore: number;
  quantityAfter: number;
  replayed: boolean;
}

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

export function validateInventoryChange(
  delta: number,
  reason: InventoryReason,
): number {
  const rounded = roundQuantity(delta);
  if (!Number.isFinite(rounded) || rounded === 0) {
    throw new InventoryError("invalid", "库存变化量必须是非零有限数字");
  }
  if (Math.abs(rounded) > 1_000_000_000) {
    throw new InventoryError("invalid", "单次库存变化量超出允许范围");
  }
  if (reason === "restock" && rounded < 0) {
    throw new InventoryError("invalid", "入库数量必须为正数");
  }
  if ((reason === "consume" || reason === "dispose") && rounded > 0) {
    throw new InventoryError("invalid", "消耗或废弃数量必须为负数");
  }
  return rounded;
}

export async function changeInventory(
  input: InventoryChangeInput,
): Promise<InventoryChangeResult> {
  return getDb().transaction((tx) => changeInventoryInTransaction(tx, input));
}

export async function changeInventoryInTransaction(
  tx: DatabaseTransaction,
  input: InventoryChangeInput,
): Promise<InventoryChangeResult> {
  const delta = validateInventoryChange(input.delta, input.reason);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > 128) {
    throw new InventoryError("invalid", "幂等键长度不能超过 128 个字符");
  }

    const [sample] = await tx
      .select()
      .from(samples)
      .where(and(eq(samples.id, input.sampleId), isNull(samples.archivedAt)))
      .limit(1)
      .for("update");
    if (!sample) throw new InventoryError("not_found", "样本不存在或已归档");

    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(stockTransactions)
        .where(eq(stockTransactions.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        if (existing.sampleId !== input.sampleId || Number(existing.delta) !== delta) {
          throw new InventoryError("invalid", "幂等键已用于另一笔库存操作");
        }
        return {
          transactionId: existing.id,
          sampleId: existing.sampleId,
          quantityBefore: Number(existing.quantityBefore ?? sample.quantity - delta),
          quantityAfter: Number(existing.quantityAfter ?? sample.quantity),
          replayed: true,
        };
      }
    }

    const quantityBefore = roundQuantity(Number(sample.quantity));
    const quantityAfter = roundQuantity(quantityBefore + delta);
    if (quantityAfter < 0) {
      throw new InventoryError(
        "insufficient",
        `库存不足：当前 ${quantityBefore} ${sample.unit}，操作后将为 ${quantityAfter}`,
      );
    }

    await tx
      .update(samples)
      .set({ quantity: quantityAfter })
      .where(eq(samples.id, sample.id));
    const [{ id: transactionId }] = await tx
      .insert(stockTransactions)
      .values({
        sampleId: sample.id,
        delta,
        quantityBefore,
        quantityAfter,
        reason: input.reason,
        note: input.note ?? null,
        userId: input.actorId ?? null,
        userName: input.actorName ?? null,
        idempotencyKey,
      })
      .$returningId();

    await appendActivity(tx, {
      userId: input.actorId,
      userName: input.actorName,
      source: input.source ?? "web",
      action: "变更了样本库存",
      entityType: "sample",
      entityId: sample.id,
      entityName: `${sample.sku} ${sample.name}`,
      detail: `${input.reason} ${delta > 0 ? "+" : ""}${delta} ${sample.unit}`,
      before: { quantity: quantityBefore, unit: sample.unit },
      after: { quantity: quantityAfter, unit: sample.unit },
      reason: input.note ?? null,
    });

    return {
      transactionId,
      sampleId: sample.id,
      quantityBefore,
      quantityAfter,
      replayed: false,
    };
}
