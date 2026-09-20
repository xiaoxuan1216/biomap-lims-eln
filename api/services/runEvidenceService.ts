import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { labRunEvidence, type users } from "@db/schema";
import type { EvidenceMetadata } from "@contracts/runEvidence";
import { appendActivity, type DatabaseTransaction } from "../queries/labHelpers";
import { lockedExecution } from "./runExecutionState";

type Actor = typeof users.$inferSelect;
export async function assertEvidenceUpload(tx: DatabaseTransaction, user: Actor, input: EvidenceMetadata) {
  if (!["user", "reviewer", "admin"].includes(user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "无权提交实验原始文件" });
  const state = await lockedExecution(tx, input.runId);
  if (state.execution.ownerId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "仅当前任务负责人可以提交原始证据" });
  if (["review", "approved"].includes(state.execution.resultState) || !["running", "completed"].includes(state.run.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "当前任务状态不允许新增证据" });
  if (!state.nodes.some(node => node.nodeKey === input.nodeKey && ["running", "completed"].includes(node.status))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "证据必须对应已开始的步骤" });
  return state;
}

export async function saveRunEvidence(tx: DatabaseTransaction, user: Actor, input: EvidenceMetadata & { byteSize: number; sha256: string; storageKey?: string; contentBase64?: string }) {
  const { run } = await assertEvidenceUpload(tx, user, input);
  const [existing] = await tx.select({ id: labRunEvidence.id }).from(labRunEvidence).where(and(eq(labRunEvidence.runId, run.id), eq(labRunEvidence.nodeKey, input.nodeKey), eq(labRunEvidence.sha256, input.sha256))).limit(1);
  if (existing) return { ...existing, reused: true };
  const [row] = await tx.insert(labRunEvidence).values({ ...input, uploadedById: user.id, uploadedByName: user.name ?? "用户" }).$returningId();
  await appendActivity(tx, { userId: user.id, userName: user.name, action: "提交了实验原始文件", entityType: "lab_run", entityId: run.id, entityName: run.runNo, detail: `${input.nodeKey} · ${input.name} · ${input.byteSize} bytes · sha256:${input.sha256}` });
  return { ...row, reused: false };
}
