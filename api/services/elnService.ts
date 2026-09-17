import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  experimentRevisions,
  experimentSamples,
  experimentSignatures,
  experiments,
  type Experiment,
} from "@db/schema";
import {
  appendActivity,
  nextExperimentCode,
  type DatabaseTransaction,
} from "../queries/labHelpers";
import { getDb } from "../queries/connection";

const MAX_ELN_CONTENT_BYTES = 2 * 1024 * 1024;

export class ElnError extends Error {
  public readonly kind: "not_found" | "locked" | "invalid" | "conflict";

  constructor(
    kind: "not_found" | "locked" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
    this.kind = kind;
    this.name = "ElnError";
  }
}

export type ElnActor = {
  id?: number | null;
  name?: string | null;
  source?: "web" | "api" | "system";
};

type SigningActor = Omit<ElnActor, "id"> & { id: number };

type RevisionChange = Partial<
  Pick<Experiment, "title" | "objective" | "status" | "content">
>;

export function normalizeElnContent(content: string): string {
  if (Buffer.byteLength(content, "utf8") > MAX_ELN_CONTENT_BYTES) {
    throw new ElnError("invalid", "实验内容不能超过 2 MB");
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("ELN content must be an array");
    }
    return JSON.stringify(parsed);
  } catch {
    throw new ElnError("invalid", "实验内容必须是有效的区块 JSON 数组");
  }
}

export function hashSnapshot(snapshot: string): string {
  return createHash("sha256").update(snapshot).digest("hex");
}

function parsedContent(content: string | null): unknown {
  if (!content) return [];
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

async function buildSnapshot(
  tx: DatabaseTransaction,
  experiment: Experiment,
  revision: number,
): Promise<string> {
  const usages = await tx
    .select({
      id: experimentSamples.id,
      sampleId: experimentSamples.sampleId,
      amountUsed: experimentSamples.amountUsed,
      note: experimentSamples.note,
    })
    .from(experimentSamples)
    .where(eq(experimentSamples.experimentId, experiment.id))
    .orderBy(asc(experimentSamples.id));

  return JSON.stringify({
    schemaVersion: 1,
    experimentId: experiment.id,
    revision,
    code: experiment.code,
    projectId: experiment.projectId,
    title: experiment.title,
    objective: experiment.objective,
    content: parsedContent(experiment.content),
    workflowId: experiment.workflowId,
    nodeKey: experiment.nodeKey,
    amendsExperimentId: experiment.amendsExperimentId,
    createdById: experiment.createdById,
    createdByName: experiment.createdByName,
    sampleUsages: usages.map((usage) => ({
      id: usage.id,
      sampleId: usage.sampleId,
      amountUsed: Number(usage.amountUsed),
      note: usage.note,
    })),
  });
}

export async function appendExperimentRevision(
  tx: DatabaseTransaction,
  experiment: Experiment,
  actor: ElnActor,
  changeReason: string,
): Promise<{ revisionId: number; revision: number; contentHash: string }> {
  const revision = experiment.revision + 1;
  const snapshot = await buildSnapshot(tx, experiment, revision);
  const contentHash = hashSnapshot(snapshot);
  const [{ id: revisionId }] = await tx
    .insert(experimentRevisions)
    .values({
      experimentId: experiment.id,
      revision,
      snapshot,
      contentHash,
      changeReason,
      createdById: actor.id ?? null,
      createdByName: actor.name ?? null,
    })
    .$returningId();

  await tx
    .update(experiments)
    .set({ revision, currentRevisionId: revisionId, contentHash })
    .where(eq(experiments.id, experiment.id));

  return { revisionId, revision, contentHash };
}

export async function reviseExperiment(
  tx: DatabaseTransaction,
  experimentId: number,
  changes: RevisionChange,
  actor: ElnActor,
  changeReason: string,
): Promise<{ revision: number; contentHash: string }> {
  const [current] = await tx
    .select()
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1)
    .for("update");
  if (!current) throw new ElnError("not_found", "实验不存在");
  if (current.status === "signed") {
    throw new ElnError("locked", "实验已签署锁定，不能修改；请创建修订记录");
  }

  const next = { ...current, ...changes };
  await tx
    .update(experiments)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(experiments.id, experimentId));
  const revision = await appendExperimentRevision(tx, next, actor, changeReason);
  await appendActivity(tx, {
    userId: actor.id,
    userName: actor.name,
    source: actor.source ?? "web",
    action: "创建了实验版本",
    entityType: "experiment",
    entityId: current.id,
    entityName: `${current.code} ${next.title}`,
    before: { revision: current.revision, contentHash: current.contentHash },
    after: { revision: revision.revision, contentHash: revision.contentHash },
    reason: changeReason,
  });
  return revision;
}

export async function signExperiment(
  tx: DatabaseTransaction,
  experimentId: number,
  actor: SigningActor,
): Promise<{ revision: number; contentHash: string; signedAt: Date }> {
  const [experiment] = await tx
    .select()
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1)
    .for("update");
  if (!experiment) throw new ElnError("not_found", "实验不存在");
  if (experiment.status === "signed") {
    throw new ElnError("locked", "实验已签署");
  }
  if (experiment.status !== "completed") {
    throw new ElnError("invalid", "只有状态为“已完成”的实验才能签署");
  }

  const revision = await appendExperimentRevision(
    tx,
    experiment,
    actor,
    "复核签署前的最终快照",
  );
  const signedAt = new Date();
  const statement = "本人已复核该版本的内容、样本消耗与关联信息，并批准其作为不可变记录。";
  await tx.insert(experimentSignatures).values({
    experimentId,
    revisionId: revision.revisionId,
    revision: revision.revision,
    contentHash: revision.contentHash,
    meaning: "reviewed_and_approved",
    statement,
    signedById: actor.id,
    signedByName: actor.name ?? null,
    signedAt,
  });
  await tx
    .update(experiments)
    .set({
      status: "signed",
      signedById: actor.id,
      signedByName: actor.name ?? null,
      signedAt,
      updatedAt: signedAt,
    })
    .where(eq(experiments.id, experimentId));
  await appendActivity(tx, {
    userId: actor.id,
    userName: actor.name,
    source: actor.source ?? "web",
    action: "复核并签署了实验",
    entityType: "experiment",
    entityId: experiment.id,
    entityName: `${experiment.code} ${experiment.title}`,
    after: {
      revision: revision.revision,
      contentHash: revision.contentHash,
      meaning: "reviewed_and_approved",
    },
    reason: statement,
  });
  return { ...revision, signedAt };
}

export async function createExperimentAmendment(
  tx: DatabaseTransaction,
  originalId: number,
  actor: SigningActor,
  reason: string,
): Promise<{ id: number; code: string }> {
  const [original] = await tx
    .select()
    .from(experiments)
    .where(eq(experiments.id, originalId))
    .limit(1)
    .for("update");
  if (!original) throw new ElnError("not_found", "实验不存在");
  if (original.status !== "signed") {
    throw new ElnError("invalid", "只有已签署记录需要通过追加修订进行变更");
  }
  const [existing] = await tx
    .select({ id: experiments.id, code: experiments.code })
    .from(experiments)
    .where(eq(experiments.amendsExperimentId, originalId))
    .limit(1);
  if (existing) {
    throw new ElnError(
      "conflict",
      `该记录已有修订版本 ${existing.code}，请在现有修订链上继续`,
    );
  }

  const code = await nextExperimentCode(tx);
  const [{ id }] = await tx
    .insert(experiments)
    .values({
      code,
      projectId: original.projectId,
      title: `${original.title}（修订）`,
      objective: original.objective,
      status: "planning",
      content: original.content,
      workflowId: original.workflowId,
      nodeKey: original.nodeKey,
      amendsExperimentId: original.id,
      createdById: actor.id,
      createdByName: actor.name ?? null,
    })
    .$returningId();
  const [amendment] = await tx
    .select()
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);
  await appendExperimentRevision(tx, amendment, actor, `创建签署记录修订：${reason}`);
  await appendActivity(tx, {
    userId: actor.id,
    userName: actor.name,
    source: actor.source ?? "web",
    action: "创建了已签署实验的修订记录",
    entityType: "experiment",
    entityId: id,
    entityName: `${code} ${amendment.title}`,
    before: { originalId: original.id, originalCode: original.code },
    after: { amendmentId: id, amendmentCode: code },
    reason,
  });
  return { id, code };
}

/** 为升级前已有的 ELN 建立第一个快照；旧签名明确标记为迁移导入。 */
export async function initializeElnHistory(): Promise<void> {
  await getDb().transaction(async (tx) => {
    const legacyRecords = await tx
      .select()
      .from(experiments)
      .where(eq(experiments.revision, 0))
      .for("update");
    for (const experiment of legacyRecords) {
      const revision = await appendExperimentRevision(
        tx,
        experiment,
        { name: "系统迁移", source: "system" },
        "从旧版数据库建立初始不可变快照",
      );
      if (experiment.status === "signed") {
        await tx.insert(experimentSignatures).values({
          experimentId: experiment.id,
          revisionId: revision.revisionId,
          revision: revision.revision,
          contentHash: revision.contentHash,
          meaning: "legacy_import",
          statement: "此签名来自旧版记录；升级时为当时内容建立哈希快照，未执行新的复核签署。",
          signedById: experiment.signedById,
          signedByName: experiment.signedByName,
          signedAt: experiment.signedAt ?? new Date(),
        });
      }
      await appendActivity(tx, {
        userName: "系统迁移",
        source: "system",
        action: "建立了实验初始版本",
        entityType: "experiment",
        entityId: experiment.id,
        entityName: `${experiment.code} ${experiment.title}`,
        after: {
          revision: revision.revision,
          contentHash: revision.contentHash,
          legacySignature: experiment.status === "signed",
        },
      });
    }
    if (legacyRecords.length) {
      console.log(`[migrate] initialized ELN history for ${legacyRecords.length} experiments`);
    }
  });
}

export async function verifySignedExperiment(
  tx: DatabaseTransaction,
  experiment: Experiment,
): Promise<{
  valid: boolean;
  reason: string | null;
  signature: typeof experimentSignatures.$inferSelect | null;
}> {
  if (experiment.status !== "signed") {
    return { valid: true, reason: null, signature: null };
  }
  const [signature] = await tx
    .select()
    .from(experimentSignatures)
    .where(eq(experimentSignatures.experimentId, experiment.id))
    .limit(1);
  if (!signature) {
    return { valid: false, reason: "缺少电子签名记录", signature: null };
  }
  const [revision] = await tx
    .select()
    .from(experimentRevisions)
    .where(eq(experimentRevisions.id, signature.revisionId))
    .limit(1);
  if (!revision) {
    return { valid: false, reason: "签名指向的版本不存在", signature };
  }

  const currentSnapshot = await buildSnapshot(tx, experiment, signature.revision);
  const currentHash = hashSnapshot(currentSnapshot);
  const storedSnapshotHash = hashSnapshot(revision.snapshot);
  const valid =
    experiment.currentRevisionId === signature.revisionId &&
    experiment.contentHash === signature.contentHash &&
    revision.contentHash === signature.contentHash &&
    storedSnapshotHash === signature.contentHash &&
    currentHash === signature.contentHash;
  return {
    valid,
    reason: valid ? null : "当前记录、版本快照或签名哈希不一致",
    signature,
  };
}
