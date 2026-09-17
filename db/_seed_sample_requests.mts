/**
 * Mosaic-style 样品请求演示数据（幂等）。
 *
 * 覆盖：草稿、库存不足草稿、已预占、履约中、已完成、已取消。
 * 已完成请求通过库存服务扣减库存，确保数量、流水和活动审计同事务一致。
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getAvailableQuantity } from "../contracts/sampleRequest";
import { getDb } from "../api/queries/connection";
import { appendActivity, type DatabaseTransaction } from "../api/queries/labHelpers";
import { changeInventoryInTransaction } from "../api/services/inventoryService";
import {
  fulfillmentTasks,
  inventoryReservations,
  projects,
  sampleRequestItems,
  sampleRequests,
  samples,
  users,
} from "./schema";

type RequestStatus = NonNullable<typeof sampleRequests.$inferInsert.status>;
type RequestPriority = NonNullable<typeof sampleRequests.$inferInsert.priority>;

type SeedItem = {
  sku: string;
  amount: number;
  targetFormat: string;
  note: string;
};

type SeedRequest = {
  requestNo: string;
  title: string;
  purpose: string;
  projectName: string;
  priority: RequestPriority;
  status: RequestStatus;
  ageHours: number;
  neededInDays: number;
  cancellationReason?: string;
  items: SeedItem[];
};

const db = getDb();

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function dateFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const definitions: SeedRequest[] = [
  {
    requestNo: "DEMO-MOSAIC-001",
    title: "AAV 转染培养基补货后发起",
    purpose: "演示提交前的库存校验：当前库存不足，等待补货后再提交并预占。",
    projectName: "AAV 载体规模化生产",
    priority: "urgent",
    status: "draft",
    ageHours: 1,
    neededInDays: 1,
    items: [
      {
        sku: "SMP-0009",
        amount: 9,
        targetFormat: "原包装整瓶发放",
        note: "需求量高于当前可用量，用于演示库存不足提示。",
      },
    ],
  },
  {
    requestNo: "DEMO-MOSAIC-002",
    title: "HER2 scFv 表达批次备料",
    purpose: "为下一批 HER2 scFv 小试表达准备表达质粒和感受态细胞。",
    projectName: "重组抗体表达与表征",
    priority: "high",
    status: "draft",
    ageHours: 3,
    neededInDays: 3,
    items: [
      {
        sku: "SMP-0033",
        amount: 2,
        targetFormat: "2 管，单管独立标签",
        note: "发放前复核序列版本与质粒批次。",
      },
      {
        sku: "CC-BL21",
        amount: 2,
        targetFormat: "2 管冻存管",
        note: "全程保持干冰转运。",
      },
    ],
  },
  {
    requestNo: "DEMO-MOSAIC-003",
    title: "EGFR 激酶活性实验样品领用",
    purpose: "为激酶活性验证准备纯化蛋白和对应表达质粒，库存已锁定。",
    projectName: "重组抗体表达与表征",
    priority: "urgent",
    status: "reserved",
    ageHours: 6,
    neededInDays: 1,
    items: [
      {
        sku: "SMP-0028",
        amount: 1,
        targetFormat: "预冷低吸附管",
        note: "冰上交接，避免反复冻融。",
      },
      {
        sku: "SMP-0034",
        amount: 1,
        targetFormat: "原冻存管",
        note: "核对 EGFR-KD 构建编号。",
      },
    ],
  },
  {
    requestNo: "DEMO-MOSAIC-004",
    title: "蛋白表征分装与跨仪器交接",
    purpose: "演示从库存预占到人工领取履约任务，再交接至板读与稳定性分析环节。",
    projectName: "重组抗体表达与表征",
    priority: "high",
    status: "in_fulfillment",
    ageHours: 12,
    neededInDays: 0,
    items: [
      {
        sku: "SMP-0029",
        amount: 1,
        targetFormat: "低吸附管，二维码标签",
        note: "已由 BioMap 管理员领取拣取任务。",
      },
      {
        sku: "SMP-0035",
        amount: 1,
        targetFormat: "原冻存管，二维码标签",
        note: "等待下一位履约人员领取。",
      },
    ],
  },
  {
    requestNo: "DEMO-MOSAIC-005",
    title: "CAR-T 流式检测对照试剂发放",
    purpose: "演示完成发放后库存自动扣减，并保留库存流水与审计记录。",
    projectName: "CAR-T 细胞疗法开发",
    priority: "normal",
    status: "fulfilled",
    ageHours: 30,
    neededInDays: -1,
    items: [
      {
        sku: "SMP-0007",
        amount: 5,
        targetFormat: "避光低吸附管",
        note: "4°C 避光交接至流式检测工位。",
      },
      {
        sku: "SMP-0002",
        amount: 2,
        targetFormat: "无菌低吸附管",
        note: "作为转染对照批次留样。",
      },
    ],
  },
  {
    requestNo: "DEMO-MOSAIC-006",
    title: "抗体扩增批次计划变更（已释放预占）",
    purpose: "演示需求取消后自动释放库存预占，且不产生实际出库。",
    projectName: "重组抗体表达与表征",
    priority: "normal",
    status: "cancelled",
    ageHours: 54,
    neededInDays: -1,
    cancellationReason: "上游构建复核未通过，本批次延期，已释放全部预占。",
    items: [
      {
        sku: "CC-DH5A",
        amount: 2,
        targetFormat: "2 管冻存管",
        note: "取消后保持原库存不变。",
      },
      {
        sku: "SMP-0033",
        amount: 1,
        targetFormat: "原冻存管",
        note: "取消后释放预占。",
      },
    ],
  },
];

const actor = await db.query.users.findFirst({ where: eq(users.unionId, "local:admin") });
if (!actor) throw new Error("sample request seed requires the local:admin user");
const actorId = actor.id;
const actorName = actor.name;

const projectNames = [...new Set(definitions.map((definition) => definition.projectName))];
const projectRows = await db.select().from(projects).where(inArray(projects.name, projectNames));
const projectByName = new Map(projectRows.map((project) => [project.name, project]));
for (const projectName of projectNames) {
  if (!projectByName.has(projectName)) throw new Error(`missing seed project: ${projectName}`);
}

const seedSkus = [...new Set(definitions.flatMap((definition) => definition.items.map((item) => item.sku)))];
const initialSampleRows = await db
  .select()
  .from(samples)
  .where(and(inArray(samples.sku, seedSkus), isNull(samples.archivedAt)));
const missingSkus = seedSkus.filter((sku) => !initialSampleRows.some((sample) => sample.sku === sku));
if (missingSkus.length) throw new Error(`missing seed samples: ${missingSkus.join(", ")}`);

async function assertAvailable(
  tx: DatabaseTransaction,
  rows: typeof initialSampleRows,
  items: SeedItem[],
): Promise<void> {
  const sampleIds = rows.map((sample) => sample.id).sort((a, b) => a - b);
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
    const sample = rows.find((row) => row.sku === item.sku)!;
    const reserved = activeReservations
      .filter((reservation) => reservation.sampleId === sample.id)
      .reduce((total, reservation) => total + Number(reservation.amount), 0);
    const available = getAvailableQuantity(Number(sample.quantity), reserved);
    if (available < item.amount) {
      throw new Error(
        `${item.sku} has insufficient available inventory for seed: ${available} ${sample.unit} available, ${item.amount} requested`,
      );
    }
  }
}

function activityAction(status: RequestStatus): string {
  switch (status) {
    case "draft":
      return "创建了样品请求演示数据";
    case "reserved":
      return "提交并预占了样品请求演示数据";
    case "in_fulfillment":
      return "领取了样品履约演示任务";
    case "fulfilled":
      return "完成了样品发放演示数据";
    case "cancelled":
      return "取消了样品请求演示数据";
  }
}

async function seedRequest(definition: SeedRequest): Promise<"created" | "skipped"> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sampleRequests.id })
      .from(sampleRequests)
      .where(eq(sampleRequests.requestNo, definition.requestNo))
      .limit(1);
    if (existing) return "skipped";

    const skus = definition.items.map((item) => item.sku);
    const sampleRows = await tx
      .select()
      .from(samples)
      .where(and(inArray(samples.sku, skus), isNull(samples.archivedAt)))
      .for("update");
    if (sampleRows.length !== skus.length) {
      throw new Error(`some samples for ${definition.requestNo} are missing or archived`);
    }

    if (
      definition.status === "reserved" ||
      definition.status === "in_fulfillment" ||
      definition.status === "fulfilled"
    ) {
      await assertAvailable(tx, sampleRows, definition.items);
    }

    const createdAt = hoursAgo(definition.ageHours);
    const submittedAt = definition.status === "draft" ? null : addHours(createdAt, 0.5);
    const reservedAt = definition.status === "draft" ? null : addHours(createdAt, 0.75);
    const terminalAt = addHours(createdAt, 2);
    const project = projectByName.get(definition.projectName)!;
    const [{ id: requestId }] = await tx
      .insert(sampleRequests)
      .values({
        requestNo: definition.requestNo,
        title: definition.title,
        purpose: definition.purpose,
        projectId: project.id,
        requesterId: actorId,
        requesterName: actorName,
        priority: definition.priority,
        status: definition.status,
        neededBy: dateFromNow(definition.neededInDays),
        cancellationReason: definition.cancellationReason ?? null,
        submittedAt,
        reservedAt,
        completedAt: definition.status === "fulfilled" ? terminalAt : null,
        cancelledAt: definition.status === "cancelled" ? terminalAt : null,
        createdAt,
        updatedAt: definition.status === "draft" ? createdAt : terminalAt,
      })
      .$returningId();

    for (const [index, item] of definition.items.entries()) {
      const sample = sampleRows.find((row) => row.sku === item.sku)!;
      const itemStatus =
        definition.status === "draft"
          ? "pending"
          : definition.status === "reserved"
            ? "reserved"
            : definition.status === "in_fulfillment"
              ? index === 0
                ? "in_progress"
                : "reserved"
              : definition.status === "fulfilled"
                ? "fulfilled"
                : "cancelled";
      const [{ id: requestItemId }] = await tx
        .insert(sampleRequestItems)
        .values({
          requestId,
          sampleId: sample.id,
          requestedAmount: item.amount,
          reservedAmount:
            definition.status === "reserved" || definition.status === "in_fulfillment"
              ? item.amount
              : 0,
          fulfilledAmount: definition.status === "fulfilled" ? item.amount : 0,
          unit: sample.unit,
          targetFormat: item.targetFormat,
          note: item.note,
          status: itemStatus,
          createdAt,
          updatedAt: definition.status === "draft" ? createdAt : terminalAt,
        })
        .$returningId();

      if (definition.status === "draft") continue;

      const reservationStatus =
        definition.status === "fulfilled"
          ? "active"
          : definition.status === "cancelled"
            ? "released"
            : "active";
      const [{ id: reservationId }] = await tx
        .insert(inventoryReservations)
        .values({
          requestId,
          requestItemId,
          sampleId: sample.id,
          amount: item.amount,
          status: reservationStatus,
          idempotencyKey: `seed:${definition.requestNo}:item:${index + 1}:reserve`,
          consumedAt: null,
          releasedAt: definition.status === "cancelled" ? terminalAt : null,
          createdAt: reservedAt ?? createdAt,
          updatedAt: definition.status === "reserved" ? reservedAt ?? createdAt : terminalAt,
        })
        .$returningId();

      const taskStatus =
        definition.status === "reserved"
          ? "ready"
          : definition.status === "in_fulfillment"
            ? index === 0
              ? "claimed"
              : "ready"
            : definition.status === "fulfilled"
              ? "succeeded"
              : "cancelled";
      await tx.insert(fulfillmentTasks).values({
        requestId,
        requestItemId,
        type: "issue",
        status: taskStatus,
        instruction: `核对并发放 ${sample.sku} ${item.amount} ${sample.unit}；${item.targetFormat}`,
        assignedToId:
          taskStatus === "claimed" || taskStatus === "succeeded" ? actorId : null,
        assignedToName:
          taskStatus === "claimed" || taskStatus === "succeeded" ? actorName : null,
        startedAt:
          taskStatus === "claimed" || taskStatus === "succeeded"
            ? addHours(reservedAt ?? createdAt, 0.5)
            : null,
        completedAt:
          taskStatus === "succeeded" || taskStatus === "cancelled" ? terminalAt : null,
        createdAt: reservedAt ?? createdAt,
        updatedAt: taskStatus === "ready" ? reservedAt ?? createdAt : terminalAt,
      });

      if (definition.status === "fulfilled") {
        await changeInventoryInTransaction(tx, {
          sampleId: sample.id,
          delta: -item.amount,
          reason: "consume",
          note: `样品请求 ${definition.requestNo} 发放（Mosaic 演示数据）`,
          actorId,
          actorName,
          source: "system",
          idempotencyKey: `seed:${definition.requestNo}:item:${index + 1}:fulfill`,
          reservationId,
        });
        await tx
          .update(inventoryReservations)
          .set({ status: "consumed", consumedAt: terminalAt, updatedAt: terminalAt })
          .where(eq(inventoryReservations.id, reservationId));
      }
    }

    await appendActivity(tx, {
      userId: actorId,
      userName: actorName,
      source: "system",
      action: activityAction(definition.status),
      entityType: "sample_request",
      entityId: requestId,
      entityName: definition.requestNo,
      detail: definition.title,
      after: {
        status: definition.status,
        itemCount: definition.items.length,
        mockData: true,
      },
      reason: definition.cancellationReason ?? null,
    });
    return "created";
  });
}

const results: Array<{ requestNo: string; result: "created" | "skipped" }> = [];
for (const definition of definitions) {
  const result = await seedRequest(definition);
  results.push({ requestNo: definition.requestNo, result });
  console.log(`${result}: ${definition.requestNo} ${definition.title}`);
}

const seededRows = await db
  .select({ requestNo: sampleRequests.requestNo, status: sampleRequests.status })
  .from(sampleRequests)
  .where(inArray(sampleRequests.requestNo, definitions.map((definition) => definition.requestNo)));
const createdCount = results.filter((result) => result.result === "created").length;
console.log(`Done: ${seededRows.length} mock requests present, ${createdCount} created this run.`);
process.exit(0);
