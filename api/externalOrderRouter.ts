import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  getCroServiceTemplate,
  validateCroRequirementData,
  type CroRequirementData,
} from "@contracts/croCatalog";
import {
  activities,
  externalDeliverables,
  externalOrderExperiments,
  externalOrderItems,
  externalOrders,
  externalOrderSamples,
  externalResults,
  externalSampleCustodyEvents,
  experiments,
  lineageEdges,
  projects,
  samples,
  serviceProviders,
  workflowNodes,
  workflows,
} from "@db/schema";
import {
  appendActivity,
  nextSampleSku,
  type DatabaseTransaction,
} from "./queries/labHelpers";
import { getDb } from "./queries/connection";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import {
  changeInventoryInTransaction,
  InventoryError,
} from "./services/inventoryService";

const PROVIDER_TYPES = [
  "cro",
  "cdmo",
  "testing_lab",
  "sequencing",
  "animal_facility",
  "academic_core",
  "other",
] as const;
const QUALIFICATION_STATUS = [
  "pending",
  "qualified",
  "restricted",
  "disqualified",
] as const;
const PRIORITY = ["low", "normal", "high", "urgent"] as const;
const COMMERCIAL_STATUS = [
  "draft",
  "quoting",
  "pending_approval",
  "approved",
  "ordered",
  "cancelled",
] as const;
const EXECUTION_STATUS = [
  "awaiting_samples",
  "in_transit",
  "received",
  "in_progress",
  "delivered",
  "on_hold",
  "cancelled",
] as const;
const QUALITY_STATUS = [
  "not_ready",
  "pending_review",
  "changes_requested",
  "accepted",
  "rejected",
] as const;
const ITEM_STATUS = [
  "pending",
  "in_progress",
  "delivered",
  "accepted",
  "rejected",
  "cancelled",
] as const;
const SHIPMENT_STATUS = [
  "planned",
  "prepared",
  "shipped",
  "received",
  "returned",
  "consumed",
  "exception",
] as const;
const DELIVERABLE_TYPES = [
  "raw_data",
  "report",
  "certificate",
  "protocol",
  "other",
] as const;
const REVIEW_STATUS = [
  "pending",
  "accepted",
  "changes_requested",
  "rejected",
] as const;
const EXPERIMENT_RELATIONS = ["source", "result_review", "reference"] as const;
const SAMPLE_TYPES = [
  "cell_line",
  "plasmid",
  "primer",
  "antibody",
  "reagent",
  "chemical",
  "protein",
  "virus",
  "tissue",
  "buffer",
  "enzyme",
  "competent_cell",
  "other",
] as const;

const requirementValueSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(255)).max(50),
]);
const requirementDataSchema = z
  .record(z.string().max(100), requirementValueSchema)
  .refine(
    value => Object.keys(value).length <= 50,
    "结构化需求字段不能超过 50 个"
  );
const plannedShipmentSchema = z.object({
  sampleId: z.number(),
  amount: z.number().positive(),
  unit: z.string().min(1).max(20),
  purpose: z.string().max(500).optional(),
});

type StructuredItemInput = {
  name?: string | null;
  category?: string | null;
  description?: string | null;
  unit?: string | null;
  acceptanceCriteria?: string | null;
  serviceTemplateKey?: string | null;
  requirementData?: CroRequirementData;
};

function resolveItemDefinition(
  provider: typeof serviceProviders.$inferSelect,
  input: StructuredItemInput
) {
  if (input.serviceTemplateKey) {
    const template = getCroServiceTemplate(
      provider.catalogKey,
      input.serviceTemplateKey
    );
    if (!template) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "所选服务模板不属于当前 CRO 或已停用",
      });
    }
    const requirementData = input.requirementData ?? {};
    const errors = validateCroRequirementData(template, requirementData);
    if (errors.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `结构化需求不完整：${errors.join("；")}`,
      });
    }
    const extraDescription = input.description?.trim();
    return {
      name: template.name,
      category: template.category,
      description: extraDescription
        ? `${template.description}\n\n补充说明：${extraDescription}`
        : template.description,
      unit: template.unit,
      acceptanceCriteria: template.acceptanceCriteria,
      serviceTemplateKey: template.key,
      serviceTemplateVersion: template.version,
      requirementData: JSON.stringify(requirementData),
    };
  }
  const name = input.name?.trim();
  if (!name)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "自定义委托必须填写服务项目名称",
    });
  return {
    name,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    unit: input.unit?.trim() || "项",
    acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
    serviceTemplateKey: null,
    serviceTemplateVersion: null,
    requirementData: null,
  };
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

function nextOrderNo(): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `EXT-${day}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

const orderFields = {
  title: z.string().min(1).max(255),
  objective: z.string().max(10_000).nullish(),
  ownerName: z.string().max(255).nullish(),
  priority: z.enum(PRIORITY),
  commercialStatus: z.enum(COMMERCIAL_STATUS),
  executionStatus: z.enum(EXECUTION_STATUS),
  qualityStatus: z.enum(QUALITY_STATUS),
  currency: z.string().min(1).max(10),
  quotedAmount: z.number().min(0).nullish(),
  poNumber: z.string().max(100).nullish(),
  contractRef: z.string().max(255).nullish(),
  expectedDeliveryDate: z.string().nullish(),
  actualDeliveryDate: z.string().nullish(),
};

async function synchronizeWorkflowNodes(
  tx: DatabaseTransaction,
  orderId: number,
  statuses: {
    commercialStatus: (typeof COMMERCIAL_STATUS)[number];
    executionStatus: (typeof EXECUTION_STATUS)[number];
    qualityStatus: (typeof QUALITY_STATUS)[number];
  }
) {
  const items = await tx
    .select({ id: externalOrderItems.id })
    .from(externalOrderItems)
    .where(eq(externalOrderItems.orderId, orderId));
  const itemIds = items.map(item => item.id);
  if (!itemIds.length) return;

  const cancelled =
    statuses.commercialStatus === "cancelled" ||
    statuses.executionStatus === "cancelled";
  if (cancelled) {
    await tx
      .update(externalOrderItems)
      .set({ status: "cancelled" })
      .where(eq(externalOrderItems.orderId, orderId));
    await tx
      .update(workflowNodes)
      .set({ status: "skipped" })
      .where(
        and(
          inArray(workflowNodes.externalOrderItemId, itemIds),
          inArray(workflowNodes.status, ["pending", "in_progress"])
        )
      );
    return;
  }

  if (statuses.qualityStatus === "accepted") {
    await tx
      .update(externalOrderItems)
      .set({ status: "accepted" })
      .where(eq(externalOrderItems.orderId, orderId));
    await tx
      .update(workflowNodes)
      .set({ status: "done" })
      .where(
        and(
          inArray(workflowNodes.externalOrderItemId, itemIds),
          inArray(workflowNodes.status, ["pending", "in_progress"])
        )
      );
    return;
  }

  if (statuses.qualityStatus === "rejected") {
    await tx
      .update(externalOrderItems)
      .set({ status: "rejected" })
      .where(eq(externalOrderItems.orderId, orderId));
  } else if (statuses.executionStatus === "delivered") {
    await tx
      .update(externalOrderItems)
      .set({ status: "delivered" })
      .where(eq(externalOrderItems.orderId, orderId));
  } else if (
    ["in_transit", "received", "in_progress", "on_hold"].includes(
      statuses.executionStatus
    )
  ) {
    await tx
      .update(externalOrderItems)
      .set({ status: "in_progress" })
      .where(eq(externalOrderItems.orderId, orderId));
  }

  if (
    statuses.commercialStatus === "ordered" &&
    ["in_transit", "received", "in_progress", "delivered", "on_hold"].includes(
      statuses.executionStatus
    )
  ) {
    await tx
      .update(workflowNodes)
      .set({ status: "in_progress" })
      .where(
        and(
          inArray(workflowNodes.externalOrderItemId, itemIds),
          inArray(workflowNodes.status, ["pending", "done"])
        )
      );
  }
}

export const externalOrderRouter = createRouter({
  providers: authedQuery.query(async () => {
    return getDb()
      .select()
      .from(serviceProviders)
      .orderBy(asc(serviceProviders.name));
  }),

  createProvider: writeQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        type: z.enum(PROVIDER_TYPES).default("cro"),
        qualificationStatus: z.enum(QUALIFICATION_STATUS).default("pending"),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().max(320).optional().or(z.literal("")),
        contactPhone: z.string().max(50).optional(),
        certifications: z.string().max(2_000).optional(),
        specialties: z.string().max(2_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [{ id }] = await tx
          .insert(serviceProviders)
          .values({ ...input, contactEmail: input.contactEmail || null })
          .$returningId();
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "登记了外部服务商",
          entityType: "service_provider",
          entityId: id,
          entityName: input.name,
          after: input,
        });
        return { id };
      });
    }),

  list: authedQuery
    .input(
      z
        .object({
          projectId: z.number().optional(),
          providerId: z.number().optional(),
          search: z.string().trim().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.projectId)
        conditions.push(eq(externalOrders.projectId, input.projectId));
      if (input?.providerId)
        conditions.push(eq(externalOrders.providerId, input.providerId));
      if (input?.search) {
        conditions.push(
          or(
            like(externalOrders.orderNo, `%${input.search}%`),
            like(externalOrders.title, `%${input.search}%`),
            like(serviceProviders.name, `%${input.search}%`)
          )!
        );
      }
      const rows = await getDb()
        .select({
          order: externalOrders,
          providerName: serviceProviders.name,
          providerType: serviceProviders.type,
          providerQualification: serviceProviders.qualificationStatus,
          projectName: projects.name,
        })
        .from(externalOrders)
        .leftJoin(
          serviceProviders,
          eq(externalOrders.providerId, serviceProviders.id)
        )
        .leftJoin(projects, eq(externalOrders.projectId, projects.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(externalOrders.updatedAt));

      const orderIds = rows.map(row => row.order.id);
      const items = orderIds.length
        ? await getDb()
            .select()
            .from(externalOrderItems)
            .where(inArray(externalOrderItems.orderId, orderIds))
        : [];
      const deliverables = orderIds.length
        ? await getDb()
            .select()
            .from(externalDeliverables)
            .where(inArray(externalDeliverables.orderId, orderIds))
        : [];
      return rows.map(row => ({
        ...row.order,
        providerName: row.providerName,
        providerType: row.providerType,
        providerQualification: row.providerQualification,
        projectName: row.projectName,
        itemCount: items.filter(item => item.orderId === row.order.id).length,
        deliverableCount: deliverables.filter(
          item => item.orderId === row.order.id
        ).length,
      }));
    }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({
          order: externalOrders,
          provider: serviceProviders,
          project: projects,
        })
        .from(externalOrders)
        .leftJoin(
          serviceProviders,
          eq(externalOrders.providerId, serviceProviders.id)
        )
        .leftJoin(projects, eq(externalOrders.projectId, projects.id))
        .where(eq(externalOrders.id, input.id))
        .limit(1);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });

      const items = await db
        .select()
        .from(externalOrderItems)
        .where(eq(externalOrderItems.orderId, input.id))
        .orderBy(asc(externalOrderItems.id));
      const sampleRows = await db
        .select({ link: externalOrderSamples, sample: samples })
        .from(externalOrderSamples)
        .leftJoin(samples, eq(externalOrderSamples.sampleId, samples.id))
        .where(eq(externalOrderSamples.orderId, input.id))
        .orderBy(desc(externalOrderSamples.createdAt));
      const deliverables = await db
        .select()
        .from(externalDeliverables)
        .where(eq(externalDeliverables.orderId, input.id))
        .orderBy(desc(externalDeliverables.uploadedAt));
      const resultRows = await db
        .select({ result: externalResults, sample: samples })
        .from(externalResults)
        .leftJoin(samples, eq(externalResults.sampleId, samples.id))
        .where(eq(externalResults.orderId, input.id))
        .orderBy(asc(externalResults.metric), asc(externalResults.id));
      const experimentRows = await db
        .select({ link: externalOrderExperiments, experiment: experiments })
        .from(externalOrderExperiments)
        .innerJoin(
          experiments,
          eq(externalOrderExperiments.experimentId, experiments.id)
        )
        .where(eq(externalOrderExperiments.orderId, input.id))
        .orderBy(desc(externalOrderExperiments.createdAt));
      const shipmentIds = sampleRows.map(sampleRow => sampleRow.link.id);
      const custodyEvents = shipmentIds.length
        ? await db
            .select()
            .from(externalSampleCustodyEvents)
            .where(
              inArray(
                externalSampleCustodyEvents.externalOrderSampleId,
                shipmentIds
              )
            )
            .orderBy(desc(externalSampleCustodyEvents.createdAt))
        : [];
      const itemIds = items.map(item => item.id);
      const linkedNodes = itemIds.length
        ? await db
            .select({
              nodeId: workflowNodes.id,
              nodeLabel: workflowNodes.label,
              nodeStatus: workflowNodes.status,
              externalOrderItemId: workflowNodes.externalOrderItemId,
              workflowId: workflows.id,
              workflowName: workflows.name,
            })
            .from(workflowNodes)
            .leftJoin(workflows, eq(workflowNodes.workflowId, workflows.id))
            .where(inArray(workflowNodes.externalOrderItemId, itemIds))
        : [];
      const history = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.entityType, "external_order"),
            eq(activities.entityId, input.id)
          )
        )
        .orderBy(desc(activities.createdAt))
        .limit(100);
      return {
        ...row.order,
        provider: row.provider,
        project: row.project,
        items,
        samples: sampleRows.map(sampleRow => ({
          ...sampleRow.link,
          sample: sampleRow.sample,
          custodyEvents: custodyEvents.filter(
            event => event.externalOrderSampleId === sampleRow.link.id
          ),
        })),
        deliverables,
        results: resultRows.map(resultRow => ({
          ...resultRow.result,
          sample: resultRow.sample,
        })),
        experiments: experimentRows.map(experimentRow => ({
          ...experimentRow.link,
          experiment: experimentRow.experiment,
        })),
        linkedNodes,
        activities: history,
      };
    }),

  itemOptions: authedQuery
    .input(z.object({ projectId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({
          id: externalOrderItems.id,
          name: externalOrderItems.name,
          status: externalOrderItems.status,
          orderId: externalOrders.id,
          orderNo: externalOrders.orderNo,
          orderTitle: externalOrders.title,
          projectId: externalOrders.projectId,
          projectName: projects.name,
          providerName: serviceProviders.name,
        })
        .from(externalOrderItems)
        .innerJoin(
          externalOrders,
          eq(externalOrderItems.orderId, externalOrders.id)
        )
        .innerJoin(projects, eq(externalOrders.projectId, projects.id))
        .innerJoin(
          serviceProviders,
          eq(externalOrders.providerId, serviceProviders.id)
        )
        .where(
          input?.projectId
            ? eq(externalOrders.projectId, input.projectId)
            : undefined
        )
        .orderBy(desc(externalOrders.updatedAt), asc(externalOrderItems.id));
      return rows;
    }),

  create: writeQuery
    .input(
      z.object({
        projectId: z.number(),
        providerId: z.number(),
        title: orderFields.title,
        objective: orderFields.objective.optional(),
        ownerName: orderFields.ownerName.optional(),
        priority: orderFields.priority.default("normal"),
        currency: orderFields.currency.default("CNY"),
        quotedAmount: orderFields.quotedAmount.optional(),
        expectedDeliveryDate: orderFields.expectedDeliveryDate.optional(),
        initialItemName: z.string().trim().max(255).optional(),
        initialItemDescription: z.string().max(10_000).optional(),
        acceptanceCriteria: z.string().max(10_000).optional(),
        serviceTemplateKey: z.string().max(100).optional(),
        requirementData: requirementDataSchema.optional(),
        samples: z.array(plannedShipmentSchema).max(50).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [provider] = await tx
          .select()
          .from(serviceProviders)
          .where(eq(serviceProviders.id, input.providerId))
          .limit(1);
        const [project] = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .limit(1);
        if (!provider)
          throw new TRPCError({ code: "BAD_REQUEST", message: "服务商不存在" });
        if (!project)
          throw new TRPCError({ code: "BAD_REQUEST", message: "项目不存在" });
        const itemDefinition = resolveItemDefinition(provider, {
          name: input.initialItemName,
          description: input.initialItemDescription,
          acceptanceCriteria: input.acceptanceCriteria,
          serviceTemplateKey: input.serviceTemplateKey,
          requirementData: input.requirementData,
        });
        const requestedSampleIds = input.samples.map(sample => sample.sampleId);
        if (new Set(requestedSampleIds).size !== requestedSampleIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "同一样本不能重复添加到委托",
          });
        }
        const sampleRows = requestedSampleIds.length
          ? await tx
              .select()
              .from(samples)
              .where(
                and(
                  inArray(samples.id, requestedSampleIds),
                  isNull(samples.archivedAt)
                )
              )
          : [];
        if (sampleRows.length !== requestedSampleIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "部分所选样本不存在或已归档",
          });
        }
        const sampleById = new Map(
          sampleRows.map(sample => [sample.id, sample])
        );
        for (const requested of input.samples) {
          const sample = sampleById.get(requested.sampleId)!;
          if (sample.projectId && sample.projectId !== input.projectId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${sample.sku} 不属于当前项目`,
            });
          }
          if (sample.unit !== requested.unit) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${sample.sku} 的送样单位必须与库存单位一致（${sample.unit}）`,
            });
          }
          if (requested.amount > Number(sample.quantity)) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${sample.sku} 的计划送样量不能大于当前库存 ${sample.quantity} ${sample.unit}`,
            });
          }
        }
        const orderNo = nextOrderNo();
        const [{ id }] = await tx
          .insert(externalOrders)
          .values({
            orderNo,
            projectId: input.projectId,
            providerId: input.providerId,
            title: input.title,
            objective: input.objective ?? null,
            ownerName: input.ownerName ?? ctx.user.name ?? null,
            priority: input.priority,
            currency: input.currency,
            quotedAmount: input.quotedAmount ?? null,
            expectedDeliveryDate: input.expectedDeliveryDate ?? null,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          })
          .$returningId();
        const [{ id: itemId }] = await tx
          .insert(externalOrderItems)
          .values({
            orderId: id,
            ...itemDefinition,
            expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          })
          .$returningId();
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "创建了外部委托",
          entityType: "external_order",
          entityId: id,
          entityName: orderNo,
          detail: `${provider.name} · ${project.name}`,
          after: input,
        });
        for (const requested of input.samples) {
          const sample = sampleById.get(requested.sampleId)!;
          const [{ id: linkId }] = await tx
            .insert(externalOrderSamples)
            .values({
              orderId: id,
              orderItemId: itemId,
              sampleId: sample.id,
              amount: requested.amount,
              unit: requested.unit,
              purpose: requested.purpose?.trim() || itemDefinition.name,
              shipmentStatus: "planned",
              direction: "outbound",
            })
            .$returningId();
          await tx.insert(externalSampleCustodyEvents).values({
            externalOrderSampleId: linkId,
            orderId: id,
            sampleId: sample.id,
            eventType: "planned",
            amount: requested.amount,
            unit: requested.unit,
            idempotencyKey: `external-create:${id}:${sample.id}:planned`,
            note: requested.purpose?.trim() || itemDefinition.name,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          });
          await appendActivity(tx, {
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "关联了送样样本",
            entityType: "external_order",
            entityId: id,
            entityName: orderNo,
            detail: `${sample.sku} ${sample.name} · ${requested.amount} ${requested.unit}`,
          });
        }
        return { id, orderNo, sampleCount: input.samples.length };
      });
    }),

  update: writeQuery
    .input(
      z
        .object({ id: z.number() })
        .extend(orderFields)
        .partial()
        .required({ id: true })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [before] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, input.id))
          .limit(1)
          .for("update");
        if (!before)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        if (input.qualityStatus === "accepted") {
          const deliverables = await tx
            .select({ reviewStatus: externalDeliverables.reviewStatus })
            .from(externalDeliverables)
            .where(eq(externalDeliverables.orderId, input.id));
          const results = await tx
            .select({ reviewStatus: externalResults.reviewStatus })
            .from(externalResults)
            .where(eq(externalResults.orderId, input.id));
          const reviewables = [...deliverables, ...results];
          if (
            !reviewables.length ||
            reviewables.some(entry => entry.reviewStatus !== "accepted")
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "所有交付物和结构化结果通过内部审核后，才能完成质量验收",
            });
          }
        }
        const { id, ...changes } = input;
        await tx
          .update(externalOrders)
          .set(changes)
          .where(eq(externalOrders.id, id));
        const after = { ...before, ...changes };
        await synchronizeWorkflowNodes(tx, id, {
          commercialStatus: after.commercialStatus,
          executionStatus: after.executionStatus,
          qualityStatus: after.qualityStatus,
        });
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "更新了外部委托",
          entityType: "external_order",
          entityId: id,
          entityName: before.orderNo,
          before,
          after,
        });
        return { ok: true };
      });
    }),

  addItem: writeQuery
    .input(
      z.object({
        orderId: z.number(),
        name: z.string().trim().max(255).optional(),
        category: z.string().max(100).optional(),
        description: z.string().max(10_000).optional(),
        quantity: z.number().int().positive().default(1),
        unit: z.string().max(30).default("项"),
        protocolRef: z.string().max(255).optional(),
        acceptanceCriteria: z.string().max(10_000).optional(),
        expectedDeliveryDate: z.string().optional(),
        serviceTemplateKey: z.string().max(100).optional(),
        requirementData: requirementDataSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [orderRow] = await tx
          .select({ order: externalOrders, provider: serviceProviders })
          .from(externalOrders)
          .innerJoin(
            serviceProviders,
            eq(externalOrders.providerId, serviceProviders.id)
          )
          .where(eq(externalOrders.id, input.orderId))
          .limit(1);
        const order = orderRow?.order;
        if (!order)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        const itemDefinition = resolveItemDefinition(orderRow.provider, input);
        const [{ id }] = await tx
          .insert(externalOrderItems)
          .values({
            orderId: input.orderId,
            ...itemDefinition,
            quantity: input.quantity,
            protocolRef: input.protocolRef ?? null,
            expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          })
          .$returningId();
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "新增了委托明细",
          entityType: "external_order",
          entityId: order.id,
          entityName: order.orderNo,
          detail: itemDefinition.name,
        });
        return { id };
      });
    }),

  updateItemStatus: writeQuery
    .input(z.object({ id: z.number(), status: z.enum(ITEM_STATUS) }))
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [item] = await tx
          .select()
          .from(externalOrderItems)
          .where(eq(externalOrderItems.id, input.id))
          .limit(1);
        if (!item)
          throw new TRPCError({ code: "NOT_FOUND", message: "委托明细不存在" });
        await tx
          .update(externalOrderItems)
          .set({ status: input.status })
          .where(eq(externalOrderItems.id, input.id));
        const nodeStatus =
          input.status === "accepted"
            ? "done"
            : input.status === "cancelled"
              ? "skipped"
              : input.status === "pending"
                ? "pending"
                : "in_progress";
        await tx
          .update(workflowNodes)
          .set({ status: nodeStatus })
          .where(eq(workflowNodes.externalOrderItemId, input.id));
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, item.orderId))
          .limit(1);
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "更新了委托明细状态",
          entityType: "external_order",
          entityId: item.orderId,
          entityName: order?.orderNo,
          detail: `${item.name} → ${input.status}`,
        });
        return { ok: true };
      });
    }),

  linkExperiment: writeQuery
    .input(
      z.object({
        orderId: z.number(),
        orderItemId: z.number().nullish(),
        experimentId: z.number(),
        relation: z.enum(EXPERIMENT_RELATIONS).default("source"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, input.orderId))
          .limit(1);
        const [experiment] = await tx
          .select()
          .from(experiments)
          .where(eq(experiments.id, input.experimentId))
          .limit(1);
        if (!order)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        if (!experiment)
          throw new TRPCError({ code: "BAD_REQUEST", message: "实验不存在" });
        if (experiment.projectId !== order.projectId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "只能关联同一项目下的内部实验",
          });
        }
        if (experiment.status === "signed" && input.relation !== "reference") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "已签署实验只能作为只读参考关联",
          });
        }
        if (input.orderItemId) {
          const [item] = await tx
            .select({ id: externalOrderItems.id })
            .from(externalOrderItems)
            .where(
              and(
                eq(externalOrderItems.id, input.orderItemId),
                eq(externalOrderItems.orderId, input.orderId)
              )
            )
            .limit(1);
          if (!item)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "委托明细不属于当前委托",
            });
        }
        const duplicateConditions = [
          eq(externalOrderExperiments.orderId, input.orderId),
          eq(externalOrderExperiments.experimentId, input.experimentId),
          input.orderItemId
            ? eq(externalOrderExperiments.orderItemId, input.orderItemId)
            : isNull(externalOrderExperiments.orderItemId),
        ];
        const [existing] = await tx
          .select({ id: externalOrderExperiments.id })
          .from(externalOrderExperiments)
          .where(and(...duplicateConditions))
          .limit(1);
        if (existing) return { id: existing.id, replayed: true };
        const [{ id }] = await tx
          .insert(externalOrderExperiments)
          .values({
            ...input,
            orderItemId: input.orderItemId ?? null,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          })
          .$returningId();
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "关联了内部实验",
          entityType: "external_order",
          entityId: order.id,
          entityName: order.orderNo,
          detail: `${experiment.code} ${experiment.title}`,
        });
        return { id, replayed: false };
      });
    }),

  attachSample: writeQuery
    .input(
      z.object({
        orderId: z.number(),
        orderItemId: z.number().nullish(),
        sampleId: z.number(),
        amount: z.number().positive(),
        unit: z.string().min(1).max(20),
        purpose: z.string().max(500).optional(),
        shipmentStatus: z.enum(SHIPMENT_STATUS).default("planned"),
        carrier: z.string().max(100).optional(),
        trackingNo: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        if (
          input.shipmentStatus !== "planned" &&
          input.shipmentStatus !== "prepared"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "关联样本时只能登记为计划送样或已备样",
          });
        }
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, input.orderId))
          .limit(1);
        const [sample] = await tx
          .select()
          .from(samples)
          .where(
            and(eq(samples.id, input.sampleId), isNull(samples.archivedAt))
          )
          .limit(1);
        if (!order)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        if (!sample)
          throw new TRPCError({ code: "BAD_REQUEST", message: "样本不存在" });
        if (sample.projectId && sample.projectId !== order.projectId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "只能关联当前项目或公共样本",
          });
        }
        if (sample.unit !== input.unit) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `送样单位必须与库存单位一致（${sample.unit}）`,
          });
        }
        if (input.amount > Number(sample.quantity)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `${sample.sku} 的计划送样量不能大于当前库存 ${sample.quantity} ${sample.unit}`,
          });
        }
        if (input.orderItemId) {
          const [item] = await tx
            .select({ id: externalOrderItems.id })
            .from(externalOrderItems)
            .where(
              and(
                eq(externalOrderItems.id, input.orderItemId),
                eq(externalOrderItems.orderId, input.orderId)
              )
            )
            .limit(1);
          if (!item)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "委托明细不属于当前委托",
            });
        }
        const [{ id }] = await tx
          .insert(externalOrderSamples)
          .values({
            ...input,
            orderItemId: input.orderItemId ?? null,
            direction: "outbound",
          })
          .$returningId();
        await tx.insert(externalSampleCustodyEvents).values({
          externalOrderSampleId: id,
          orderId: order.id,
          sampleId: sample.id,
          eventType: input.shipmentStatus,
          amount: input.amount,
          unit: input.unit,
          carrier: input.carrier ?? null,
          trackingNo: input.trackingNo ?? null,
          idempotencyKey: `external-sample:${id}:${input.shipmentStatus}`,
          note: input.purpose ?? null,
          createdById: ctx.user.id,
          createdByName: ctx.user.name,
        });
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "关联了送样样本",
          entityType: "external_order",
          entityId: order.id,
          entityName: order.orderNo,
          detail: `${sample.sku} ${sample.name} · ${input.amount} ${input.unit}`,
        });
        return { id };
      });
    }),

  updateShipment: writeQuery
    .input(
      z.object({
        id: z.number(),
        shipmentStatus: z.enum(SHIPMENT_STATUS),
        carrier: z.string().max(100).nullish(),
        trackingNo: z.string().max(100).nullish(),
        returnAmount: z.number().positive().optional(),
        note: z.string().max(500).optional(),
        idempotencyKey: z.string().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await getDb().transaction(async tx => {
          const [link] = await tx
            .select()
            .from(externalOrderSamples)
            .where(eq(externalOrderSamples.id, input.id))
            .limit(1)
            .for("update");
          if (!link)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "送样记录不存在",
            });
          if (link.direction !== "outbound") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "CRO 产出样本不能执行送样操作",
            });
          }
          if (
            ["returned", "consumed"].includes(link.shipmentStatus) &&
            input.shipmentStatus !== link.shipmentStatus
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "已退回或已消耗的送样记录不能再变更状态",
            });
          }
          const [sample] = await tx
            .select()
            .from(samples)
            .where(
              and(eq(samples.id, link.sampleId), isNull(samples.archivedAt))
            )
            .limit(1);
          if (!sample)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "样本不存在或已归档",
            });
          const [order] = await tx
            .select()
            .from(externalOrders)
            .where(eq(externalOrders.id, link.orderId))
            .limit(1);
          if (!order)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "外部委托不存在",
            });
          const allowedTransitions: Record<
            (typeof SHIPMENT_STATUS)[number],
            Array<(typeof SHIPMENT_STATUS)[number]>
          > = {
            planned: ["prepared", "shipped", "exception"],
            prepared: ["shipped", "exception"],
            shipped: ["received", "returned", "consumed", "exception"],
            received: ["returned", "consumed", "exception"],
            returned: [],
            consumed: [],
            exception: [
              "planned",
              "prepared",
              "shipped",
              "received",
              "returned",
              "consumed",
            ],
          };
          if (
            input.shipmentStatus !== link.shipmentStatus &&
            !allowedTransitions[link.shipmentStatus].includes(
              input.shipmentStatus
            )
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `不允许从 ${link.shipmentStatus} 直接变更为 ${input.shipmentStatus}`,
            });
          }
          if (
            input.shipmentStatus === "shipped" &&
            order.commercialStatus !== "ordered"
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "委托完成审批和下单后才能确认发货",
            });
          }

          const eventKey =
            input.idempotencyKey ??
            `external-custody:${link.id}:${input.shipmentStatus}`;
          const [existingEvent] = await tx
            .select({ id: externalSampleCustodyEvents.id })
            .from(externalSampleCustodyEvents)
            .where(eq(externalSampleCustodyEvents.idempotencyKey, eventKey))
            .limit(1);
          if (existingEvent)
            return { ok: true, replayed: true, newQuantity: sample.quantity };

          let stockTransactionId: number | null = null;
          let eventAmount = Number(link.amount);
          if (input.shipmentStatus === "shipped") {
            const inventory = await changeInventoryInTransaction(tx, {
              sampleId: link.sampleId,
              delta: -Number(link.amount),
              reason: "transfer_out",
              note: `外部委托 ${order.orderNo} 送样至 ${input.carrier || "CRO"}`,
              actorId: ctx.user.id,
              actorName: ctx.user.name,
              source: "web",
              idempotencyKey: `external-shipment:${link.id}:outbound`,
            });
            stockTransactionId = inventory.transactionId;
          }
          if (input.shipmentStatus === "returned") {
            if (!link.outboundTransactionId) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "样本尚未确认发货，不能登记退回",
              });
            }
            eventAmount = input.returnAmount ?? Number(link.amount);
            if (eventAmount > Number(link.amount)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "退回数量不能大于原送样量",
              });
            }
            const inventory = await changeInventoryInTransaction(tx, {
              sampleId: link.sampleId,
              delta: eventAmount,
              reason: "transfer_in",
              note: `外部委托 ${order.orderNo} 样本退回`,
              actorId: ctx.user.id,
              actorName: ctx.user.name,
              source: "web",
              idempotencyKey: `external-shipment:${link.id}:return`,
            });
            stockTransactionId = inventory.transactionId;
          }

          const now = new Date();
          await tx
            .update(externalOrderSamples)
            .set({
              shipmentStatus: input.shipmentStatus,
              carrier: input.carrier ?? link.carrier,
              trackingNo: input.trackingNo ?? link.trackingNo,
              outboundTransactionId:
                input.shipmentStatus === "shipped"
                  ? stockTransactionId
                  : link.outboundTransactionId,
              returnTransactionId:
                input.shipmentStatus === "returned"
                  ? stockTransactionId
                  : link.returnTransactionId,
              returnedAmount:
                input.shipmentStatus === "returned"
                  ? eventAmount
                  : link.returnedAmount,
              shippedAt:
                input.shipmentStatus === "shipped" ? now : link.shippedAt,
              receivedAt:
                input.shipmentStatus === "received" ? now : link.receivedAt,
              returnedAt:
                input.shipmentStatus === "returned" ? now : link.returnedAt,
              consumedAt:
                input.shipmentStatus === "consumed" ? now : link.consumedAt,
            })
            .where(eq(externalOrderSamples.id, link.id));
          await tx.insert(externalSampleCustodyEvents).values({
            externalOrderSampleId: link.id,
            orderId: link.orderId,
            sampleId: link.sampleId,
            eventType: input.shipmentStatus,
            amount: eventAmount,
            unit: link.unit,
            carrier: input.carrier ?? link.carrier,
            trackingNo: input.trackingNo ?? link.trackingNo,
            stockTransactionId,
            idempotencyKey: eventKey,
            note: input.note ?? null,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          });

          const executionStatus =
            input.shipmentStatus === "shipped"
              ? "in_transit"
              : input.shipmentStatus === "received"
                ? "received"
                : input.shipmentStatus === "consumed"
                  ? "in_progress"
                  : order.executionStatus;
          if (executionStatus !== order.executionStatus) {
            await tx
              .update(externalOrders)
              .set({ executionStatus })
              .where(eq(externalOrders.id, order.id));
            await synchronizeWorkflowNodes(tx, order.id, {
              commercialStatus: order.commercialStatus,
              executionStatus,
              qualityStatus: order.qualityStatus,
            });
          }
          await appendActivity(tx, {
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "更新了样本交接状态",
            entityType: "external_order",
            entityId: link.orderId,
            entityName: order.orderNo,
            detail: `${sample.sku} · ${input.shipmentStatus} · ${eventAmount} ${link.unit}`,
          });
          return {
            ok: true,
            replayed: false,
            newQuantity:
              input.shipmentStatus === "shipped"
                ? Number(sample.quantity) - Number(link.amount)
                : input.shipmentStatus === "returned"
                  ? Number(sample.quantity) + eventAmount
                  : Number(sample.quantity),
          };
        });
      } catch (error) {
        return throwInventoryError(error);
      }
    }),

  addDeliverable: writeQuery
    .input(
      z.object({
        orderId: z.number(),
        orderItemId: z.number().nullish(),
        name: z.string().trim().min(1).max(255),
        type: z.enum(DELIVERABLE_TYPES).default("report"),
        fileUrl: z.string().url().optional().or(z.literal("")),
        version: z.string().max(30).default("v1"),
        checksum: z.string().max(128).optional(),
        notes: z.string().max(10_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, input.orderId))
          .limit(1);
        if (!order)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        const [{ id }] = await tx
          .insert(externalDeliverables)
          .values({ ...input, fileUrl: input.fileUrl || null })
          .$returningId();
        await tx
          .update(externalOrders)
          .set({ qualityStatus: "pending_review" })
          .where(eq(externalOrders.id, order.id));
        await synchronizeWorkflowNodes(tx, order.id, {
          commercialStatus: order.commercialStatus,
          executionStatus: order.executionStatus,
          qualityStatus: "pending_review",
        });
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "登记了 CRO 交付物",
          entityType: "external_order",
          entityId: order.id,
          entityName: order.orderNo,
          detail: `${input.name} · ${input.version}`,
        });
        return { id };
      });
    }),

  reviewDeliverable: writeQuery
    .input(
      z.object({
        id: z.number(),
        reviewStatus: z.enum(REVIEW_STATUS),
        notes: z.string().max(10_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [deliverable] = await tx
          .select()
          .from(externalDeliverables)
          .where(eq(externalDeliverables.id, input.id))
          .limit(1);
        if (!deliverable)
          throw new TRPCError({ code: "NOT_FOUND", message: "交付物不存在" });
        await tx
          .update(externalDeliverables)
          .set({
            reviewStatus: input.reviewStatus,
            notes: input.notes ?? deliverable.notes,
            reviewedAt: new Date(),
            reviewedByName: ctx.user.name,
          })
          .where(eq(externalDeliverables.id, input.id));
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, deliverable.orderId))
          .limit(1);
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "审核了 CRO 交付物",
          entityType: "external_order",
          entityId: deliverable.orderId,
          entityName: order?.orderNo,
          detail: `${deliverable.name} → ${input.reviewStatus}`,
        });
        return { ok: true };
      });
    }),

  addResult: writeQuery
    .input(
      z.object({
        orderId: z.number(),
        orderItemId: z.number().nullish(),
        externalOrderSampleId: z.number().nullish(),
        sourceDeliverableId: z.number().nullish(),
        idempotencyKey: z.string().min(8).max(128).optional(),
        metric: z.string().trim().min(1).max(255),
        valueText: z.string().trim().min(1).max(500),
        numericValue: z.number().nullish(),
        unit: z.string().max(50).optional(),
        referenceRange: z.string().max(255).optional(),
        method: z.string().max(255).optional(),
        replicate: z.string().max(50).optional(),
        notes: z.string().max(10_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, input.orderId))
          .limit(1);
        if (!order)
          throw new TRPCError({ code: "NOT_FOUND", message: "外部委托不存在" });
        if (input.idempotencyKey) {
          const [existing] = await tx
            .select({ id: externalResults.id })
            .from(externalResults)
            .where(eq(externalResults.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) return { id: existing.id, replayed: true };
        }
        let sampleId: number | null = null;
        if (input.externalOrderSampleId) {
          const [shipment] = await tx
            .select()
            .from(externalOrderSamples)
            .where(
              and(
                eq(externalOrderSamples.id, input.externalOrderSampleId),
                eq(externalOrderSamples.orderId, input.orderId)
              )
            )
            .limit(1);
          if (!shipment)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "样本不属于当前委托",
            });
          sampleId = shipment.sampleId;
        }
        if (input.orderItemId) {
          const [item] = await tx
            .select({ id: externalOrderItems.id })
            .from(externalOrderItems)
            .where(
              and(
                eq(externalOrderItems.id, input.orderItemId),
                eq(externalOrderItems.orderId, input.orderId)
              )
            )
            .limit(1);
          if (!item)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "委托明细不属于当前委托",
            });
        }
        if (input.sourceDeliverableId) {
          const [deliverable] = await tx
            .select({ id: externalDeliverables.id })
            .from(externalDeliverables)
            .where(
              and(
                eq(externalDeliverables.id, input.sourceDeliverableId),
                eq(externalDeliverables.orderId, input.orderId)
              )
            )
            .limit(1);
          if (!deliverable)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "交付物不属于当前委托",
            });
        }
        const [{ id }] = await tx
          .insert(externalResults)
          .values({
            ...input,
            orderItemId: input.orderItemId ?? null,
            externalOrderSampleId: input.externalOrderSampleId ?? null,
            sourceDeliverableId: input.sourceDeliverableId ?? null,
            sampleId,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          })
          .$returningId();
        await tx
          .update(externalOrders)
          .set({ qualityStatus: "pending_review" })
          .where(eq(externalOrders.id, order.id));
        await synchronizeWorkflowNodes(tx, order.id, {
          commercialStatus: order.commercialStatus,
          executionStatus: order.executionStatus,
          qualityStatus: "pending_review",
        });
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "登记了 CRO 结构化结果",
          entityType: "external_order",
          entityId: order.id,
          entityName: order.orderNo,
          detail: `${input.metric} = ${input.valueText}${input.unit ? ` ${input.unit}` : ""}`,
        });
        return { id, replayed: false };
      });
    }),

  reviewResult: writeQuery
    .input(
      z.object({
        id: z.number(),
        reviewStatus: z.enum(REVIEW_STATUS),
        notes: z.string().max(10_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async tx => {
        const [result] = await tx
          .select()
          .from(externalResults)
          .where(eq(externalResults.id, input.id))
          .limit(1);
        if (!result)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "结构化结果不存在",
          });
        await tx
          .update(externalResults)
          .set({
            reviewStatus: input.reviewStatus,
            notes: input.notes ?? result.notes,
            reviewedAt: new Date(),
            reviewedByName: ctx.user.name,
          })
          .where(eq(externalResults.id, input.id));
        const [order] = await tx
          .select()
          .from(externalOrders)
          .where(eq(externalOrders.id, result.orderId))
          .limit(1);
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "审核了 CRO 结构化结果",
          entityType: "external_order",
          entityId: result.orderId,
          entityName: order?.orderNo,
          detail: `${result.metric} → ${input.reviewStatus}`,
        });
        return { ok: true };
      });
    }),

  registerDerivedSample: writeQuery
    .input(
      z.object({
        sourceExternalOrderSampleId: z.number(),
        orderItemId: z.number().nullish(),
        name: z.string().trim().min(1).max(255),
        type: z.enum(SAMPLE_TYPES).optional(),
        quantity: z.number().positive(),
        unit: z.string().trim().min(1).max(20),
        notes: z.string().max(10_000).optional(),
        idempotencyKey: z.string().min(8).max(96).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await getDb().transaction(async tx => {
          const [sourceLink] = await tx
            .select()
            .from(externalOrderSamples)
            .where(
              eq(externalOrderSamples.id, input.sourceExternalOrderSampleId)
            )
            .limit(1)
            .for("update");
          if (!sourceLink || sourceLink.direction !== "outbound") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "来源送样记录不存在",
            });
          }
          const operationKey = input.idempotencyKey ?? randomUUID();
          const custodyKey = `external-produced:${operationKey}`;
          const [existingEvent] = await tx
            .select({
              sampleId: externalSampleCustodyEvents.sampleId,
              externalOrderSampleId:
                externalSampleCustodyEvents.externalOrderSampleId,
            })
            .from(externalSampleCustodyEvents)
            .where(eq(externalSampleCustodyEvents.idempotencyKey, custodyKey))
            .limit(1);
          if (existingEvent) {
            const [existingSample] = await tx
              .select({ sku: samples.sku })
              .from(samples)
              .where(eq(samples.id, existingEvent.sampleId))
              .limit(1);
            return {
              id: existingEvent.sampleId,
              sku: existingSample?.sku ?? "",
              shipmentId: existingEvent.externalOrderSampleId,
              replayed: true,
            };
          }
          const [sourceSample] = await tx
            .select()
            .from(samples)
            .where(eq(samples.id, sourceLink.sampleId))
            .limit(1);
          const [order] = await tx
            .select()
            .from(externalOrders)
            .where(eq(externalOrders.id, sourceLink.orderId))
            .limit(1);
          if (!sourceSample || !order)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "来源样本或委托不存在",
            });
          if (input.orderItemId) {
            const [item] = await tx
              .select({ id: externalOrderItems.id })
              .from(externalOrderItems)
              .where(
                and(
                  eq(externalOrderItems.id, input.orderItemId),
                  eq(externalOrderItems.orderId, order.id)
                )
              )
              .limit(1);
            if (!item)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "委托明细不属于当前委托",
              });
          }
          const sku = await nextSampleSku(tx);
          const [{ id: sampleId }] = await tx
            .insert(samples)
            .values({
              sku,
              name: input.name,
              type: input.type ?? sourceSample.type,
              quantity: 0,
              unit: input.unit,
              projectId: order.projectId,
              notes: input.notes ?? `由外部委托 ${order.orderNo} 产生`,
              createdById: ctx.user.id,
              createdByName: ctx.user.name,
            })
            .$returningId();
          const inventory = await changeInventoryInTransaction(tx, {
            sampleId,
            delta: input.quantity,
            reason: "transfer_in",
            note: `外部委托 ${order.orderNo} 产出样本入库`,
            actorId: ctx.user.id,
            actorName: ctx.user.name,
            source: "web",
            idempotencyKey: `external-produced:${operationKey}:inventory`,
          });
          await tx.insert(lineageEdges).values({
            childKind: "sample",
            childId: sampleId,
            parentKind: "sample",
            parentId: sourceSample.id,
            relation: "derived_by_external_service",
            note: `${order.orderNo} · ${input.notes ?? input.name}`,
          });
          const [{ id: linkId }] = await tx
            .insert(externalOrderSamples)
            .values({
              orderId: order.id,
              orderItemId: input.orderItemId ?? sourceLink.orderItemId,
              sampleId,
              amount: input.quantity,
              unit: input.unit,
              purpose: input.notes ?? "CRO 产出样本",
              shipmentStatus: "returned",
              direction: "inbound",
              sourceExternalOrderSampleId: sourceLink.id,
              returnTransactionId: inventory.transactionId,
              returnedAmount: input.quantity,
              returnedAt: new Date(),
            })
            .$returningId();
          await tx.insert(externalSampleCustodyEvents).values({
            externalOrderSampleId: linkId,
            orderId: order.id,
            sampleId,
            eventType: "produced",
            amount: input.quantity,
            unit: input.unit,
            stockTransactionId: inventory.transactionId,
            idempotencyKey: custodyKey,
            note: input.notes ?? null,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          });
          await appendActivity(tx, {
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "登记了 CRO 产出样本",
            entityType: "external_order",
            entityId: order.id,
            entityName: order.orderNo,
            detail: `${sku} ${input.name} · ${input.quantity} ${input.unit}`,
          });
          return { id: sampleId, sku, shipmentId: linkId, replayed: false };
        });
      } catch (error) {
        return throwInventoryError(error);
      }
    }),
});
