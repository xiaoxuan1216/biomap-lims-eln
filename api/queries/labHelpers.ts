import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import {
  activities,
  auditState,
  experiments,
  samples,
  systemCounters,
} from "@db/schema";
import { getDb } from "./connection";

type Database = ReturnType<typeof getDb>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ActivityInput {
  userId?: number | null;
  userName?: string | null;
  source?: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  entityName?: string | null;
  detail?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

function serialize(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export type ActivityHashPayload = {
  previousHash: string | null;
  createdAt: string;
  userId: number | null;
  userName: string;
  source: string;
  action: string;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  detail: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
};

export function hashActivityPayload(payload: ActivityHashPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

type VerifiableActivity = Omit<ActivityHashPayload, "createdAt"> & {
  id: number;
  createdAt: Date;
  hash: string | null;
};

export function verifyAuditChain(records: VerifiableActivity[]): {
  valid: boolean;
  checked: number;
  brokenAtId: number | null;
  lastHash: string | null;
} {
  let previousHash: string | null = null;
  for (const record of records) {
    if (record.previousHash !== previousHash) {
      return { valid: false, checked: 0, brokenAtId: record.id, lastHash: previousHash };
    }
    const expected = hashActivityPayload({
      previousHash: record.previousHash,
      createdAt: record.createdAt.toISOString(),
      userId: record.userId,
      userName: record.userName,
      source: record.source,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      entityName: record.entityName,
      detail: record.detail,
      beforeJson: record.beforeJson,
      afterJson: record.afterJson,
      reason: record.reason,
    });
    if (record.hash !== expected) {
      return { valid: false, checked: 0, brokenAtId: record.id, lastHash: previousHash };
    }
    previousHash = expected;
  }
  return {
    valid: true,
    checked: records.length,
    brokenAtId: null,
    lastHash: previousHash,
  };
}

/** 在调用方事务中追加一条防并发分叉的哈希链审计记录。 */
export async function appendActivity(
  tx: DatabaseTransaction,
  params: ActivityInput,
): Promise<{ id: number; hash: string }> {
  await tx
    .insert(auditState)
    .values({ id: 1, lastHash: null })
    .onDuplicateKeyUpdate({ set: { id: 1 } });

  const [state] = await tx
    .select()
    .from(auditState)
    .where(eq(auditState.id, 1))
    .for("update");
  const previousHash = state?.lastHash ?? null;
  const createdAt = new Date();
  const beforeJson = serialize(params.before);
  const afterJson = serialize(params.after);
  const payload: ActivityHashPayload = {
    previousHash,
    createdAt: createdAt.toISOString(),
    userId: params.userId ?? null,
    userName: params.userName ?? "系统",
    source: params.source ?? "web",
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    entityName: params.entityName ?? null,
    detail: params.detail ?? null,
    beforeJson,
    afterJson,
    reason: params.reason ?? null,
  };
  const hash = hashActivityPayload(payload);

  const [{ id }] = await tx
    .insert(activities)
    .values({ ...payload, createdAt, hash })
    .$returningId();
  await tx
    .update(auditState)
    .set({ lastHash: hash, updatedAt: createdAt })
    .where(eq(auditState.id, 1));
  return { id, hash };
}

/** 记录独立活动；业务变更应优先调用 appendActivity 并复用其事务。 */
export async function logActivity(params: ActivityInput) {
  return getDb().transaction((tx) => appendActivity(tx, params));
}

/** 首次升级时把旧活动纳入哈希链；已有链一旦异常则拒绝静默重写。 */
export async function initializeAuditChain(): Promise<void> {
  await getDb().transaction(async (tx) => {
    const records = await tx.select().from(activities).orderBy(asc(activities.id)).for("update");
    if (records.length === 0) return;

    const hashedCount = records.filter((record) => record.hash).length;
    if (hashedCount > 0) {
      if (hashedCount !== records.length) {
        throw new Error("Audit trail contains a partially initialized hash chain");
      }
      const result = verifyAuditChain(records as VerifiableActivity[]);
      if (!result.valid) {
        throw new Error(`Audit trail integrity failure at activity ${result.brokenAtId}`);
      }
      await tx
        .insert(auditState)
        .values({ id: 1, lastHash: result.lastHash })
        .onDuplicateKeyUpdate({ set: { lastHash: result.lastHash, updatedAt: new Date() } });
      return;
    }

    let previousHash: string | null = null;
    for (const record of records) {
      const payload: ActivityHashPayload = {
        previousHash,
        createdAt: record.createdAt.toISOString(),
        userId: record.userId,
        userName: record.userName ?? "系统",
        source: record.source,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        entityName: record.entityName,
        detail: record.detail,
        beforeJson: record.beforeJson,
        afterJson: record.afterJson,
        reason: record.reason,
      };
      const hash = hashActivityPayload(payload);
      await tx
        .update(activities)
        .set({ previousHash, hash, userName: payload.userName })
        .where(eq(activities.id, record.id));
      previousHash = hash;
    }
    await tx
      .insert(auditState)
      .values({ id: 1, lastHash: previousHash })
      .onDuplicateKeyUpdate({ set: { lastHash: previousHash, updatedAt: new Date() } });
    console.log(`[migrate] initialized audit hash chain for ${records.length} activities`);
  });
}

async function allocateCounter(
  tx: DatabaseTransaction,
  key: "experiment" | "sample",
): Promise<number> {
  await tx
    .insert(systemCounters)
    .values({ key, value: 0 })
    .onDuplicateKeyUpdate({ set: { key } });
  const [counter] = await tx
    .select()
    .from(systemCounters)
    .where(eq(systemCounters.key, key))
    .for("update");

  let current = counter?.value ?? 0;
  if (current === 0) {
    if (key === "experiment") {
      const [row] = await tx
        .select({ value: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${experiments.code}, 5) AS UNSIGNED)), 0)` })
        .from(experiments);
      current = Number(row?.value ?? 0);
    } else {
      const [row] = await tx
        .select({ value: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${samples.sku}, 5) AS UNSIGNED)), 0)` })
        .from(samples);
      current = Number(row?.value ?? 0);
    }
  }

  const next = current + 1;
  await tx
    .update(systemCounters)
    .set({ value: next, updatedAt: new Date() })
    .where(eq(systemCounters.key, key));
  return next;
}

/** 生成并发安全的下一个实验编号 EXP-0001。 */
export async function nextExperimentCode(tx?: DatabaseTransaction): Promise<string> {
  const num = tx
    ? await allocateCounter(tx, "experiment")
    : await getDb().transaction((inner) => allocateCounter(inner, "experiment"));
  return `EXP-${String(num).padStart(4, "0")}`;
}

/** 生成并发安全的下一个样本编号 SMP-0001。 */
export async function nextSampleSku(tx?: DatabaseTransaction): Promise<string> {
  const num = tx
    ? await allocateCounter(tx, "sample")
    : await getDb().transaction((inner) => allocateCounter(inner, "sample"));
  return `SMP-${String(num).padStart(4, "0")}`;
}
