/**
 * 驱动平台演示数据（幂等）。
 *
 * 只创建缺失的设备和仿真绑定；已有绑定不会被脚本覆盖。
 * 所有连接参数来自内置 Manifest 默认值，不保存密码、令牌或 secret。
 */
import { eq } from "drizzle-orm";
import {
  BUILTIN_DRIVER_MANIFESTS,
  driverDefaults,
  makeDriverTemplateKey,
  validateDriverValues,
  type DriverManifest,
} from "../contracts/deviceDriver";
import { getDb } from "../api/queries/connection";
import {
  appendActivity,
  type DatabaseTransaction,
} from "../api/queries/labHelpers";
import {
  equipment,
  equipmentDriverBindings,
  workflowEdges,
  workflowNodes,
  workflows,
} from "./schema";

const db = getDb();
const DRIVER_VERSION = "1.0.0";
const SEED_ACTOR = "系统 · 驱动平台演示";

type DriverKey = "hamilton-vector" | "cytocontrol-v8" | "octet-da";

type DeviceDefinition = {
  driverKey: DriverKey;
  preferredName: string;
  /** 可复用已有的同型号演示设备，避免仅因中英文名称不同而重复创建。 */
  aliases: readonly string[];
  equipment: Omit<typeof equipment.$inferInsert, "name">;
  readyMessage: string;
};

const definitions: readonly DeviceDefinition[] = [
  {
    driverKey: "hamilton-vector",
    preferredName: "Hamilton Microlab STAR V / Vector",
    aliases: ["Hamilton 移液工作站 STAR V", "Hamilton Liquid Handler STAR V"],
    equipment: {
      category: "automation",
      model: "Microlab STAR V / Vector",
      serialNo: "DEMO-HAM-STARV-001",
      status: "available",
      room: "自动化平台 · 驱动演示",
      responsibleName: "系统演示",
      specs: "Vector Executor / Run Control COM · Mock device · 仅仿真运行",
    },
    readyMessage: "演示绑定已就绪：仅运行 Vector 仿真流程，未连接真实设备。",
  },
  {
    driverKey: "cytocontrol-v8",
    preferredName: "Thermo Fisher Cytomat 10 / CytoControl V8",
    aliases: [],
    equipment: {
      category: "automation",
      model: "Cytomat 10 / CytoControl V8",
      serialNo: "DEMO-CYTOMAT10-001",
      status: "available",
      room: "自动化平台 · 驱动演示",
      responsibleName: "系统演示",
      specs: "CytoControl V8 · RS-232 ASCII · Mock device · 仅仿真运行",
    },
    readyMessage:
      "演示绑定已就绪：仅运行 CytoControl V8 仿真流程，未连接真实设备。",
  },
  {
    driverKey: "octet-da",
    preferredName: "Sartorius Octet RED384 / Data Acquisition",
    aliases: [],
    equipment: {
      category: "analytical",
      model: "Octet RED384 / Data Acquisition",
      serialNo: "DEMO-OCTET-RED384-001",
      status: "available",
      room: "分析平台 · 驱动演示",
      responsibleName: "系统演示",
      specs:
        "Octet Data Acquisition · TCP/RS-232 ASCII · Mock device · 仅仿真运行",
    },
    readyMessage:
      "演示绑定已就绪：TCP 端口 20001 仅为可编辑 mock 值，真机连接前必须按设备实际配置。",
  },
];

function resolveManifest(driverKey: DriverKey): DriverManifest {
  const manifest = BUILTIN_DRIVER_MANIFESTS.find(
    candidate =>
      candidate.driverKey === driverKey && candidate.version === DRIVER_VERSION
  );
  if (!manifest) {
    throw new Error(
      `missing built-in driver manifest: ${driverKey}@${DRIVER_VERSION}`
    );
  }
  return manifest;
}

function makeConnectionConfig(
  manifest: DriverManifest
): Record<string, string | number | boolean> {
  const config = driverDefaults(manifest.connectionFields);

  if (manifest.driverKey === "octet-da") {
    // 厂家资料中截图端口并不一致；20001 只用于演示，不是生产默认值。
    config.port = 20001;
  }

  for (const key of Object.keys(config)) {
    if (/(?:password|passwd|secret|token|credential|api-?key)/i.test(key)) {
      throw new Error(`refusing to seed secret-like connection field: ${key}`);
    }
  }

  const issues = validateDriverValues(manifest.connectionFields, config);
  if (issues.length > 0) {
    throw new Error(
      `invalid built-in defaults for ${manifest.driverKey}: ${issues.join("; ")}`
    );
  }
  return config;
}

async function findEquipment(
  tx: DatabaseTransaction,
  definition: DeviceDefinition
): Promise<typeof equipment.$inferSelect | undefined> {
  if (definition.equipment.serialNo) {
    const bySeedSerial = await tx.query.equipment.findFirst({
      where: eq(equipment.serialNo, definition.equipment.serialNo),
    });
    if (bySeedSerial) return bySeedSerial;
  }

  for (const name of [definition.preferredName, ...definition.aliases]) {
    const existing = await tx.query.equipment.findFirst({
      where: eq(equipment.name, name),
    });
    if (existing) return existing;
  }
  return undefined;
}

async function seedDevice(definition: DeviceDefinition) {
  const manifest = resolveManifest(definition.driverKey);
  const connectionConfig = makeConnectionConfig(manifest);

  return db.transaction(async tx => {
    let device = await findEquipment(tx, definition);
    let equipmentCreated = false;

    if (!device) {
      const [{ id }] = await tx
        .insert(equipment)
        .values({ name: definition.preferredName, ...definition.equipment })
        .$returningId();
      device = await tx.query.equipment.findFirst({
        where: eq(equipment.id, id),
      });
      equipmentCreated = true;
    }
    if (!device) {
      throw new Error(`equipment seed failed: ${definition.preferredName}`);
    }

    const existingBinding = await tx.query.equipmentDriverBindings.findFirst({
      where: eq(equipmentDriverBindings.equipmentId, device.id),
    });
    if (existingBinding) {
      const expectedBinding =
        existingBinding.driverKey === definition.driverKey &&
        existingBinding.driverVersion === DRIVER_VERSION &&
        existingBinding.mode === "simulation";
      if (!expectedBinding) {
        throw new Error(
          `equipment ${device.name} already has a non-demo binding; refusing to overwrite it`
        );
      }
      return {
        equipmentId: device.id,
        equipmentName: device.name,
        driver: `${definition.driverKey}@${DRIVER_VERSION}`,
        equipment: equipmentCreated ? "created" : "reused",
        binding: "skipped",
      } as const;
    }

    const testedAt = new Date();
    const [{ id: bindingId }] = await tx
      .insert(equipmentDriverBindings)
      .values({
        equipmentId: device.id,
        driverKey: definition.driverKey,
        driverVersion: DRIVER_VERSION,
        mode: "simulation",
        connectionConfig: JSON.stringify(connectionConfig),
        secretRef: null,
        status: "simulation_ready",
        lastTestAt: testedAt,
        lastMessage: definition.readyMessage,
        createdByName: SEED_ACTOR,
        enabled: true,
      })
      .$returningId();

    await appendActivity(tx, {
      userName: SEED_ACTOR,
      source: "seed",
      action: "初始化了设备驱动演示绑定",
      entityType: "equipment_driver",
      entityId: device.id,
      entityName: device.name,
      detail: definition.readyMessage,
      after: {
        bindingId,
        driverKey: definition.driverKey,
        driverVersion: DRIVER_VERSION,
        mode: "simulation",
        status: "simulation_ready",
        connectionConfig: "[non-secret mock defaults]",
        secretRef: null,
      },
    });

    return {
      equipmentId: device.id,
      equipmentName: device.name,
      driver: `${definition.driverKey}@${DRIVER_VERSION}`,
      equipment: equipmentCreated ? "created" : "reused",
      binding: "created",
    } as const;
  });
}

const results = [];
for (const definition of definitions) {
  results.push(await seedDevice(definition));
}

const deviceIds = Object.fromEntries(
  results.map((result) => [result.driver.split("@")[0], result.equipmentId]),
) as Record<DriverKey, number>;

const demoWorkflow = await db.transaction(async tx => {
  const workflowName = "多厂商设备驱动联调演示";
  const existing = await tx.query.workflows.findFirst({
    where: eq(workflows.name, workflowName),
  });
  if (existing) return { id: existing.id, state: "reused" } as const;

  const [{ id: workflowId }] = await tx
    .insert(workflows)
    .values({
      name: workflowName,
      description:
        "Mock 演示：Cytomat 出库、人工转运、Hamilton 前处理、人工转运、Octet 呈板/关门/检测。所有设备绑定均为 simulation，不会下发物理命令。",
      scenario: "device-driver-demo",
      status: "draft",
      createdByName: SEED_ACTOR,
    })
    .$returningId();

  await tx.insert(workflowNodes).values([
    {
      workflowId,
      nodeKey: "cytomat-retrieve",
      type: "equipment",
      templateKey: makeDriverTemplateKey("cytocontrol-v8", DRIVER_VERSION, "move-to-transfer"),
      label: "Cytomat 库位取板",
      equipmentId: deviceIds["cytocontrol-v8"],
      params: JSON.stringify({
        "storage-position": "0025",
        "transfer-station": "a",
        "expected-barcode": "DEMO-PLATE-001",
      }),
      posX: 80,
      posY: 160,
    },
    {
      workflowId,
      nodeKey: "handoff-hamilton",
      type: "manual",
      label: "扫码并转运至 Hamilton",
      config: "核对 DEMO-PLATE-001，确认夹具和板位后转运。",
      posX: 390,
      posY: 160,
    },
    {
      workflowId,
      nodeKey: "hamilton-prep",
      type: "equipment",
      templateKey: makeDriverTemplateKey("hamilton-vector", DRIVER_VERSION, "run-method"),
      label: "Hamilton 前处理方法",
      equipmentId: deviceIds["hamilton-vector"],
      params: JSON.stringify({
        "method-ref": "demo://hamilton/octet-prep-v1.med",
        "run-name": "DEMO-PLATE-001-Prep",
        simulation: true,
      }),
      posX: 700,
      posY: 160,
    },
    {
      workflowId,
      nodeKey: "handoff-octet",
      type: "manual",
      label: "扫码并转运至 Octet",
      config: "核对样品板与传感器板，确认 Octet 384 已呈板。",
      posX: 1010,
      posY: 160,
    },
    {
      workflowId,
      nodeKey: "octet-present",
      type: "equipment",
      templateKey: makeDriverTemplateKey("octet-da", DRIVER_VERSION, "present"),
      label: "Octet 开门呈板",
      equipmentId: deviceIds["octet-da"],
      params: JSON.stringify({}),
      posX: 1320,
      posY: 80,
    },
    {
      workflowId,
      nodeKey: "octet-close",
      type: "equipment",
      templateKey: makeDriverTemplateKey("octet-da", DRIVER_VERSION, "close"),
      label: "Octet 关门归位",
      equipmentId: deviceIds["octet-da"],
      params: JSON.stringify({}),
      posX: 1630,
      posY: 80,
    },
    {
      workflowId,
      nodeKey: "octet-run",
      type: "equipment",
      templateKey: makeDriverTemplateKey("octet-da", DRIVER_VERSION, "run-method"),
      label: "Octet 动力学检测",
      equipmentId: deviceIds["octet-da"],
      params: JSON.stringify({
        "experiment-name": "DEMO-PLATE-001-Kinetics",
        "method-file": "demo://octet/kinetics-v1.fmf",
        "experiment-folder": "demo://results/octet/DEMO-PLATE-001",
        repetitions: 1,
      }),
      posX: 1940,
      posY: 80,
    },
  ]);

  const chain = [
    "cytomat-retrieve",
    "handoff-hamilton",
    "hamilton-prep",
    "handoff-octet",
    "octet-present",
    "octet-close",
    "octet-run",
  ];
  await tx.insert(workflowEdges).values(
    chain.slice(0, -1).map((sourceKey, index) => ({
      workflowId,
      edgeKey: `driver-demo-edge-${index + 1}`,
      sourceKey,
      targetKey: chain[index + 1],
    })),
  );

  await appendActivity(tx, {
    userName: SEED_ACTOR,
    source: "seed",
    action: "初始化了多厂商设备驱动演示流程",
    entityType: "workflow",
    entityId: workflowId,
    entityName: workflowName,
    detail: "仅仿真执行；Cytomat、Hamilton 与 Octet 节点已绑定演示设备。",
    after: { nodeCount: 7, edgeCount: 6, simulationOnly: true },
  });
  return { id: workflowId, state: "created" } as const;
});

console.table(results);
console.log(`Demo BioFlow: /workflows/${demoWorkflow.id} (${demoWorkflow.state})`);
console.log(
  "Driver platform demo seed complete. All bindings are simulation-only and contain no secrets."
);
process.exit(0);
