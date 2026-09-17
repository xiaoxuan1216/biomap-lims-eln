import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  SAMPLE_REQUEST_PRIORITIES,
  canCancelSampleRequest,
  canClaimFulfillmentTask,
  canCompleteFulfillmentTask,
  getAvailableQuantity,
  roundRequestQuantity,
} from "@contracts/sampleRequest";
import {
  fulfillmentTasks,
  inventoryReservations,
  labRuns,
  projects,
  sampleRequestItems,
  sampleRequests,
  samples,
} from "@db/schema";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity } from "./queries/labHelpers";
import {
  changeInventoryInTransaction,
  InventoryError,
} from "./services/inventoryService";

const createItemSchema = z.object({
  sampleId: z.number().int().positive(),
  amount: z.number().positive().max(1_000_000_000),
  targetFormat: z.string().trim().max(255).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const createRequestSchema = z.object({
  title: z.string().trim().min(1, "请求标题不能为空").max(255),
  purpose: z.string().trim().max(10_000).nullish(),
  projectId: z.number().int().positive().nullish(),
  priority: z.enum(SAMPLE_REQUEST_PRIORITIES).default("normal"),
  neededBy: z.string().date().nullish(),
  items: z.array(createItemSchema).min(1, "至少添加一个样品").max(100),
});

function nextRequestNo(): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `REQ-${day}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function throwInventoryError(error: unknown): never {
  if (error instanceof InventoryError) {
    throw new TRPCError({
      code: error.kind === "not_found" ? "NOT_FOUND" : "PRECONDITION_FAILED",
      message: error.message,
    });
  }
  throw error;
}

export const sampleRequestRouter = createRouter({
  list: authedQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ request: sampleRequests, projectName: projects.name })
      .from(sampleRequests)
      .leftJoin(projects, eq(sampleRequests.projectId, projects.id))
      .orderBy(desc(sampleRequests.createdAt));
    if (!rows.length) return [];

    const requestIds = rows.map(({ request }) => request.id);
    const [items, tasks] = await Promise.all([
      db
        .select({ requestId: sampleRequestItems.requestId, status: sampleRequestItems.status })
        .from(sampleRequestItems)
        .where(inArray(sampleRequestItems.requestId, requestIds)),
      db
        .select({ requestId: fulfillmentTasks.requestId, status: fulfillmentTasks.status })
        .from(fulfillmentTasks)
        .where(inArray(fulfillmentTasks.requestId, requestIds)),
    ]);

    return rows.map(({ request, projectName }) => {
      const requestItems = items.filter((item) => item.requestId === request.id);
      const requestTasks = tasks.filter((task) => task.requestId === request.id);
      return {
        ...request,
        projectName,
        itemCount: requestItems.length,
        fulfilledItemCount: requestItems.filter((item) => item.status === "fulfilled").length,
        readyTaskCount: requestTasks.filter((task) => task.status === "ready").length,
      };
    });
  }),

  availableSamples: authedQuery.query(async () => {
    const db = getDb();
    const [sampleRows, reservations] = await Promise.all([
      db
        .select({
          id: samples.id,
          sku: samples.sku,
          name: samples.name,
          quantity: samples.quantity,
          unit: samples.unit,
          projectId: samples.projectId,
        })
        .from(samples)
        .where(isNull(samples.archivedAt))
        .orderBy(samples.name),
      db
        .select({ sampleId: inventoryReservations.sampleId, amount: inventoryReservations.amount })
        .from(inventoryReservations)
        .where(eq(inventoryReservations.status, "active")),
    ]);
    return sampleRows.map((sample) => {
      const activeReserved = roundRequestQuantity(
        reservations
          .filter((reservation) => reservation.sampleId === sample.id)
          .reduce((sum, reservation) => sum + Number(reservation.amount), 0),
      );
      return {
        ...sample,
        activeReserved,
        availableQuantity: getAvailableQuantity(Number(sample.quantity), activeReserved),
      };
    });
  }),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({ request: sampleRequests, projectName: projects.name })
        .from(sampleRequests)
        .leftJoin(projects, eq(sampleRequests.projectId, projects.id))
        .where(eq(sampleRequests.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "样品请求不存在" });

      const [items, reservations, tasks] = await Promise.all([
        db
          .select({
            item: sampleRequestItems,
            sampleSku: samples.sku,
            sampleName: samples.name,
            onHandQuantity: samples.quantity,
          })
          .from(sampleRequestItems)
          .innerJoin(samples, eq(sampleRequestItems.sampleId, samples.id))
          .where(eq(sampleRequestItems.requestId, input.id))
          .orderBy(sampleRequestItems.id),
        db
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.requestId, input.id)),
        db
          .select()
          .from(fulfillmentTasks)
          .where(eq(fulfillmentTasks.requestId, input.id))
          .orderBy(fulfillmentTasks.id),
      ]);
      const sampleIds = [...new Set(items.map(({ item }) => item.sampleId))];
      const activeReservations = sampleIds.length
        ? await db
            .select({ sampleId: inventoryReservations.sampleId, amount: inventoryReservations.amount })
            .from(inventoryReservations)
            .where(
              and(
                inArray(inventoryReservations.sampleId, sampleIds),
                eq(inventoryReservations.status, "active"),
              ),
            )
        : [];

      return {
        ...row.request,
        projectName: row.projectName,
        items: items.map(({ item, sampleSku, sampleName, onHandQuantity }) => {
          const activeReserved = activeReservations
            .filter((reservation) => reservation.sampleId === item.sampleId)
            .reduce((sum, reservation) => sum + Number(reservation.amount), 0);
          return {
            ...item,
            sampleSku,
            sampleName,
            onHandQuantity: Number(onHandQuantity),
            availableQuantity: getAvailableQuantity(Number(onHandQuantity), activeReserved),
          };
        }),
        reservations,
        tasks,
      };
    }),

  create: writeQuery.input(createRequestSchema).mutation(async ({ ctx, input }) => {
    const duplicateSample = input.items.find(
      (item, index) => input.items.findIndex((candidate) => candidate.sampleId === item.sampleId) !== index,
    );
    if (duplicateSample) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "同一样品不能重复添加，请合并数量" });
    }

    const db = getDb();
    return db.transaction(async (tx) => {
      if (input.projectId) {
        const [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .limit(1);
        if (!project) throw new TRPCError({ code: "BAD_REQUEST", message: "所选项目不存在" });
      }

      const sampleIds = input.items.map((item) => item.sampleId);
      const sampleRows = await tx
        .select()
        .from(samples)
        .where(and(inArray(samples.id, sampleIds), isNull(samples.archivedAt)));
      if (sampleRows.length !== sampleIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "部分样品不存在或已归档" });
      }

      const requestNo = nextRequestNo();
      const [{ id }] = await tx
        .insert(sampleRequests)
        .values({
          requestNo,
          title: input.title,
          purpose: input.purpose || null,
          projectId: input.projectId || null,
          requesterId: ctx.user.id,
          requesterName: ctx.user.name,
          priority: input.priority,
          neededBy: input.neededBy || null,
        })
        .$returningId();

      await tx.insert(sampleRequestItems).values(
        input.items.map((item) => {
          const sample = sampleRows.find((row) => row.id === item.sampleId)!;
          return {
            requestId: id,
            sampleId: item.sampleId,
            requestedAmount: roundRequestQuantity(item.amount),
            unit: sample.unit,
            targetFormat: item.targetFormat || null,
            note: item.note || null,
          };
        }),
      );

      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        action: "创建了样品请求",
        entityType: "sample_request",
        entityId: id,
        entityName: requestNo,
        after: { title: input.title, itemCount: input.items.length, status: "draft" },
      });
      return { id, requestNo };
    });
  }),

  submit: writeQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(sampleRequests)
          .where(eq(sampleRequests.id, input.id))
          .limit(1)
          .for("update");
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "样品请求不存在" });
        if (request.status !== "draft") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "只有草稿请求可以提交并预占库存" });
        }

        const items = await tx
          .select()
          .from(sampleRequestItems)
          .where(eq(sampleRequestItems.requestId, request.id));
        if (!items.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "请求中没有样品明细" });
        }

        const sampleIds = [...new Set(items.map((item) => item.sampleId))].sort((a, b) => a - b);
        const sampleRows = await tx
          .select()
          .from(samples)
          .where(and(inArray(samples.id, sampleIds), isNull(samples.archivedAt)))
          .for("update");
        const activeReservations = await tx
          .select()
          .from(inventoryReservations)
          .where(
            and(
              inArray(inventoryReservations.sampleId, sampleIds),
              eq(inventoryReservations.status, "active"),
            ),
          )
          .for("update");

        for (const item of items) {
          const sample = sampleRows.find((row) => row.id === item.sampleId);
          if (!sample) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "请求中的样品已归档或不存在" });
          }
          if (sample.unit !== item.unit) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${sample.sku} 的库存单位已变化，请重建请求` });
          }
          const alreadyReserved = activeReservations
            .filter((reservation) => reservation.sampleId === item.sampleId)
            .reduce((sum, reservation) => sum + Number(reservation.amount), 0);
          const available = getAvailableQuantity(Number(sample.quantity), alreadyReserved);
          if (available < Number(item.requestedAmount)) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${sample.sku} 可用量不足：可用 ${available} ${sample.unit}，请求 ${item.requestedAmount} ${item.unit}`,
            });
          }
        }

        const now = new Date();
        await tx.insert(inventoryReservations).values(
          items.map((item) => ({
            requestId: request.id,
            requestItemId: item.id,
            sampleId: item.sampleId,
            amount: item.requestedAmount,
            idempotencyKey: `sample-request:${request.id}:item:${item.id}:reserve`,
          })),
        );
        await tx.insert(fulfillmentTasks).values(
          items.map((item) => {
            const sample = sampleRows.find((row) => row.id === item.sampleId)!;
            return {
              requestId: request.id,
              requestItemId: item.id,
              type: "issue" as const,
              instruction: `核对并发放 ${sample.sku} ${item.requestedAmount} ${item.unit}`,
            };
          }),
        );
        await tx
          .update(sampleRequestItems)
          .set({
            status: "reserved",
            reservedAmount: sql`${sampleRequestItems.requestedAmount}`,
          })
          .where(eq(sampleRequestItems.requestId, request.id));
        await tx
          .update(sampleRequests)
          .set({ status: "reserved", submittedAt: now, reservedAt: now })
          .where(eq(sampleRequests.id, request.id));

        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "提交并预占了样品请求",
          entityType: "sample_request",
          entityId: request.id,
          entityName: request.requestNo,
          before: { status: request.status },
          after: { status: "reserved", itemCount: items.length },
        });
        return { ok: true, status: "reserved" as const };
      });
    }),

  claimTask: writeQuery
    .input(z.object({ taskId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [taskPointer] = await db
        .select({ requestId: fulfillmentTasks.requestId })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.id, input.taskId))
        .limit(1);
      if (!taskPointer) throw new TRPCError({ code: "NOT_FOUND", message: "履约任务不存在" });

      return db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(sampleRequests)
          .where(eq(sampleRequests.id, taskPointer.requestId))
          .limit(1)
          .for("update");
        const [task] = await tx
          .select()
          .from(fulfillmentTasks)
          .where(eq(fulfillmentTasks.id, input.taskId))
          .limit(1)
          .for("update");
        if (!request || !task) throw new TRPCError({ code: "NOT_FOUND", message: "履约任务不存在" });
        if (!canClaimFulfillmentTask(task.status)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "任务不是待领取状态" });
        }

        const now = new Date();
        await tx
          .update(fulfillmentTasks)
          .set({
            status: "claimed",
            assignedToId: ctx.user.id,
            assignedToName: ctx.user.name,
            startedAt: now,
          })
          .where(eq(fulfillmentTasks.id, task.id));
        await tx
          .update(sampleRequestItems)
          .set({ status: "in_progress" })
          .where(eq(sampleRequestItems.id, task.requestItemId));
        await tx
          .update(sampleRequests)
          .set({ status: "in_fulfillment" })
          .where(eq(sampleRequests.id, request.id));

        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "领取了样品履约任务",
          entityType: "sample_request",
          entityId: request.id,
          entityName: request.requestNo,
          detail: `任务 #${task.id}`,
        });
        return { ok: true };
      });
    }),

  completeTask: writeQuery
    .input(z.object({ taskId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [taskPointer] = await db
        .select({ requestId: fulfillmentTasks.requestId })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.id, input.taskId))
        .limit(1);
      if (!taskPointer) throw new TRPCError({ code: "NOT_FOUND", message: "履约任务不存在" });

      try {
        return await db.transaction(async (tx) => {
          const [request] = await tx
            .select()
            .from(sampleRequests)
            .where(eq(sampleRequests.id, taskPointer.requestId))
            .limit(1)
            .for("update");
          const [task] = await tx
            .select()
            .from(fulfillmentTasks)
            .where(eq(fulfillmentTasks.id, input.taskId))
            .limit(1)
            .for("update");
          if (!request || !task) throw new TRPCError({ code: "NOT_FOUND", message: "履约任务不存在" });
          if (task.status === "succeeded") return { ok: true, replayed: true };
          if (!canCompleteFulfillmentTask(task.status)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "请先领取任务再确认发放" });
          }
          if (task.assignedToId !== ctx.user.id && ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN", message: "只有任务领取人或管理员可以确认发放" });
          }

          const [item] = await tx
            .select()
            .from(sampleRequestItems)
            .where(eq(sampleRequestItems.id, task.requestItemId))
            .limit(1);
          if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "请求明细不存在" });

          const [reservation] = await tx
            .select()
            .from(inventoryReservations)
            .where(eq(inventoryReservations.requestItemId, item.id))
            .limit(1);
          if (!reservation || reservation.status !== "active") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "库存预占已失效，不能确认发放" });
          }

          await changeInventoryInTransaction(tx, {
            sampleId: item.sampleId,
            delta: -Number(item.requestedAmount),
            reason: "consume",
            note: `样品请求 ${request.requestNo} 发放`,
            actorId: ctx.user.id,
            actorName: ctx.user.name,
            source: "web",
            idempotencyKey: `sample-request:${request.id}:task:${task.id}:fulfill`,
            reservationId: reservation.id,
          });

          const now = new Date();
          await tx
            .update(inventoryReservations)
            .set({ status: "consumed", consumedAt: now })
            .where(eq(inventoryReservations.id, reservation.id));
          await tx
            .update(sampleRequestItems)
            .set({
              status: "fulfilled",
              reservedAmount: 0,
              fulfilledAmount: item.requestedAmount,
            })
            .where(eq(sampleRequestItems.id, item.id));
          await tx
            .update(fulfillmentTasks)
            .set({ status: "succeeded", completedAt: now })
            .where(eq(fulfillmentTasks.id, task.id));

          const allItems = await tx
            .select({ id: sampleRequestItems.id, status: sampleRequestItems.status })
            .from(sampleRequestItems)
            .where(eq(sampleRequestItems.requestId, request.id));
          const fulfilled = allItems.every((candidate) =>
            candidate.id === item.id ? true : candidate.status === "fulfilled",
          );
          await tx
            .update(sampleRequests)
            .set(fulfilled ? { status: "fulfilled", completedAt: now } : { status: "in_fulfillment" })
            .where(eq(sampleRequests.id, request.id));

          await appendActivity(tx, {
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "完成了样品发放",
            entityType: "sample_request",
            entityId: request.id,
            entityName: request.requestNo,
            detail: `任务 #${task.id}，${item.requestedAmount} ${item.unit}`,
            after: { status: fulfilled ? "fulfilled" : "in_fulfillment" },
          });
          return { ok: true, replayed: false };
        });
      } catch (error) {
        throwInventoryError(error);
      }
    }),

  cancel: writeQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().trim().min(1, "请填写取消原因").max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(sampleRequests)
          .where(eq(sampleRequests.id, input.id))
          .limit(1)
          .for("update");
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "样品请求不存在" });
        const [linkedRun] = await tx
          .select({ id: labRuns.id, runNo: labRuns.runNo, status: labRuns.status })
          .from(labRuns)
          .where(eq(labRuns.sampleRequestId, request.id))
          .limit(1);
        if (linkedRun && linkedRun.status !== "cancelled") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `该请求由实验运行 ${linkedRun.runNo} 管理，请从运行详情取消`,
          });
        }
        if (!canCancelSampleRequest(request.status)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "该请求已完成或已取消" });
        }

        const tasks = await tx
          .select()
          .from(fulfillmentTasks)
          .where(eq(fulfillmentTasks.requestId, request.id))
          .for("update");
        if (tasks.some((task) => task.status === "succeeded")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "已有样品完成发放，不能整单取消" });
        }

        const now = new Date();
        await tx
          .update(inventoryReservations)
          .set({ status: "released", releasedAt: now })
          .where(
            and(
              eq(inventoryReservations.requestId, request.id),
              eq(inventoryReservations.status, "active"),
            ),
          );
        await tx
          .update(fulfillmentTasks)
          .set({ status: "cancelled", completedAt: now })
          .where(eq(fulfillmentTasks.requestId, request.id));
        await tx
          .update(sampleRequestItems)
          .set({ status: "cancelled", reservedAmount: 0 })
          .where(eq(sampleRequestItems.requestId, request.id));
        await tx
          .update(sampleRequests)
          .set({
            status: "cancelled",
            cancellationReason: input.reason,
            cancelledAt: now,
          })
          .where(eq(sampleRequests.id, request.id));

        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "取消了样品请求",
          entityType: "sample_request",
          entityId: request.id,
          entityName: request.requestNo,
          before: { status: request.status },
          after: { status: "cancelled" },
          reason: input.reason,
        });
        return { ok: true };
      });
    }),
});
