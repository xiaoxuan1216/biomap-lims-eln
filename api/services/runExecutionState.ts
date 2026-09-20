import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { labRuns, labRunExecution, labRunNodes, labRunResources } from "@db/schema";
import type { DatabaseTransaction } from "../queries/labHelpers";
import { parseFrozenRunPlan, runProjectionIntegrity } from "../labRunRouter";

export async function lockedExecution(tx: DatabaseTransaction, runId: number) {
  const [run] = await tx.select().from(labRuns).where(eq(labRuns.id, runId)).limit(1).for("update");
  const [execution] = await tx.select().from(labRunExecution).where(eq(labRunExecution.runId, runId)).limit(1).for("update");
  if (!run || !execution || run.executionMode !== "manual") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "此任务不是人工执行任务" });
  const nodes = await tx.select().from(labRunNodes).where(eq(labRunNodes.runId, runId)).for("update");
  const resources = await tx.select().from(labRunResources).where(eq(labRunResources.runId, runId));
  const plan = parseFrozenRunPlan(run);
  if (!plan?.method || !runProjectionIntegrity(run, plan, nodes, resources)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "任务快照完整性检查失败，无法执行" });
  return { run, execution, nodes, resources, plan };
}
