import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { adminQuery, authedQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity } from "./queries/labHelpers";
import { driverReleases, equipment, equipmentDriverBindings } from "@db/schema";
import {
  BUILTIN_DRIVER_MANIFESTS,
  CUSTOM_DRIVER_TEMPLATE,
  driverDefaults,
  driverManifestSchema,
  makeDriverTemplateKey,
  validateDriverConfiguration,
  type DriverManifest,
} from "@contracts/deviceDriver";

type CatalogEntry = DriverManifest & {
  releaseId: number | null;
  releaseStatus: "draft" | "published" | "retired";
  sourceKind: "builtin" | "custom" | "imported";
  checksum: string;
  createdAt: Date | null;
  publishedAt: Date | null;
};

const manifestJsonInput = z.string().min(2).max(250_000);
const configInput = z.record(z.string(), z.unknown());
const secretRefInput = z
  .string()
  .max(255)
  .regex(/^secret:\/\/[A-Za-z0-9._/-]+$/, "凭据引用必须使用 secret:// 路径且不能包含查询参数")
  .nullable()
  .optional();

function digestManifest(manifest: DriverManifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function builtInEntries(): CatalogEntry[] {
  return BUILTIN_DRIVER_MANIFESTS.map((manifest) => ({
    ...manifest,
    releaseId: null,
    releaseStatus: "published" as const,
    sourceKind: "builtin" as const,
    checksum: digestManifest(manifest),
    createdAt: null,
    publishedAt: null,
  }));
}

function parseManifestJson(raw: string): DriverManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Manifest 不是有效 JSON" });
  }
  const result = driverManifestSchema.safeParse(parsed);
  if (!result.success) {
    const message = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("；");
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  return result.data;
}

async function customEntries(includeUnpublished: boolean): Promise<CatalogEntry[]> {
  const rows = await getDb()
    .select()
    .from(driverReleases)
    .where(includeUnpublished ? undefined : eq(driverReleases.status, "published"))
    .orderBy(asc(driverReleases.vendor), asc(driverReleases.driverKey), desc(driverReleases.createdAt));
  return rows.flatMap((row) => {
    let raw: unknown;
    try {
      raw = JSON.parse(row.manifest);
    } catch {
      return [];
    }
    const parsed = driverManifestSchema.safeParse(raw);
    if (!parsed.success) return [];
    return [
      {
        ...parsed.data,
        releaseId: row.id,
        releaseStatus: row.status,
        sourceKind: row.sourceKind,
        checksum: row.checksum,
        createdAt: row.createdAt,
        publishedAt: row.publishedAt,
      },
    ];
  });
}

async function resolvePublishedManifest(driverKey: string, version: string) {
  const builtIn = BUILTIN_DRIVER_MANIFESTS.find(
    (manifest) => manifest.driverKey === driverKey && manifest.version === version,
  );
  if (builtIn) return builtIn;
  const row = await getDb().query.driverReleases.findFirst({
    where: and(
      eq(driverReleases.driverKey, driverKey),
      eq(driverReleases.version, version),
      eq(driverReleases.status, "published"),
    ),
  });
  if (!row) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.manifest);
  } catch {
    return null;
  }
  const parsed = driverManifestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function asConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function redactBinding<T extends { connectionConfig: string; secretRef: string | null }>(binding: T) {
  return {
    ...binding,
    connectionConfig: {} as Record<string, unknown>,
    secretRef: null,
  };
}

function bindingEligibleForAction(
  entry: CatalogEntry,
  action: DriverManifest["actions"][number],
  binding: typeof equipmentDriverBindings.$inferSelect,
) {
  const expectedStatus = binding.mode === "simulation" ? "simulation_ready" : "ready";
  if (
    entry.releaseStatus !== "published" ||
    binding.status !== expectedStatus ||
    (action.executionMode === "simulation-only" && binding.mode !== "simulation")
  ) {
    return false;
  }
  const config = asConfig(binding.connectionConfig);
  if (
    entry.driverKey === "cytocontrol-v8" &&
    action.key === "set-temperature" &&
    config["device-profile"] !== "incubator"
  ) {
    return false;
  }
  if (
    entry.driverKey === "octet-da" &&
    action.key === "present" &&
    config["instrument-family"] === "htx"
  ) {
    return false;
  }
  return true;
}

export const driverRouter = createRouter({
  catalog: authedQuery.query(async () => [
    ...builtInEntries(),
    ...(await customEntries(false)),
  ]),

  releases: authedQuery.query(async ({ ctx }) => [
    ...builtInEntries(),
    ...(await customEntries(ctx.user.role === "admin")),
  ]),

  customTemplate: authedQuery.query(() => JSON.stringify(CUSTOM_DRIVER_TEMPLATE, null, 2)),

  validateManifest: authedQuery
    .input(z.object({ manifestJson: manifestJsonInput }))
    .mutation(({ input }) => {
      const manifest = parseManifestJson(input.manifestJson);
      return {
        ok: true,
        driverKey: manifest.driverKey,
        version: manifest.version,
        actionCount: manifest.actions.length,
        nodeActionCount: manifest.actions.filter((action) => action.exposeAsNode).length,
        checksum: digestManifest(manifest),
      };
    }),

  saveDraft: adminQuery
    .input(z.object({ manifestJson: manifestJsonInput, sourceKind: z.enum(["custom", "imported"]).default("custom") }))
    .mutation(async ({ ctx, input }) => {
      const manifest = parseManifestJson(input.manifestJson);
      if (BUILTIN_DRIVER_MANIFESTS.some((item) => item.driverKey === manifest.driverKey)) {
        throw new TRPCError({ code: "CONFLICT", message: "内置驱动 key 不允许被覆盖" });
      }
      const db = getDb();
      const existing = await db.query.driverReleases.findFirst({
        where: and(
          eq(driverReleases.driverKey, manifest.driverKey),
          eq(driverReleases.version, manifest.version),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "同一驱动版本已存在；发布版本不可原地覆盖" });
      }
      const checksum = digestManifest(manifest);
      return db.transaction(async (tx) => {
        const [{ id }] = await tx
          .insert(driverReleases)
          .values({
            driverKey: manifest.driverKey,
            version: manifest.version,
            name: manifest.name,
            vendor: manifest.vendor,
            manifest: JSON.stringify(manifest),
            checksum,
            sourceKind: input.sourceKind,
            createdByName: ctx.user.name,
          })
          .$returningId();
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "创建了设备驱动草稿",
          entityType: "driver_release",
          entityId: id,
          entityName: `${manifest.name} ${manifest.version}`,
          after: { driverKey: manifest.driverKey, version: manifest.version, checksum },
        });
        return { id, checksum };
      });
    }),

  publish: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const release = await db.query.driverReleases.findFirst({
      where: eq(driverReleases.id, input.id),
    });
    if (!release) throw new TRPCError({ code: "NOT_FOUND", message: "驱动版本不存在" });
    if (release.status !== "draft") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "只有草稿版本可以发布" });
    }
    parseManifestJson(release.manifest);
    return db.transaction(async (tx) => {
      const publishedAt = new Date();
      await tx
        .update(driverReleases)
        .set({ status: "published", publishedAt })
        .where(eq(driverReleases.id, input.id));
      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        action: "发布了设备驱动",
        entityType: "driver_release",
        entityId: release.id,
        entityName: `${release.name} ${release.version}`,
        before: { status: release.status },
        after: { status: "published", checksum: release.checksum },
      });
      return { ok: true, publishedAt };
    });
  }),

  retire: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const release = await db.query.driverReleases.findFirst({
      where: eq(driverReleases.id, input.id),
    });
    if (!release) throw new TRPCError({ code: "NOT_FOUND", message: "驱动版本不存在" });
    return db.transaction(async (tx) => {
      await tx.update(driverReleases).set({ status: "retired" }).where(eq(driverReleases.id, input.id));
      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        action: "停用了设备驱动版本",
        entityType: "driver_release",
        entityId: release.id,
        entityName: `${release.name} ${release.version}`,
        before: { status: release.status },
        after: { status: "retired" },
      });
      return { ok: true };
    });
  }),

  bindings: authedQuery.query(async () => {
    const rows = await getDb()
      .select({ binding: equipmentDriverBindings, equipmentName: equipment.name, model: equipment.model })
      .from(equipmentDriverBindings)
      .leftJoin(equipment, eq(equipmentDriverBindings.equipmentId, equipment.id))
      .orderBy(asc(equipment.name));
    return rows.map((row) => ({
      ...redactBinding(row.binding),
      equipmentName: row.equipmentName,
      model: row.model,
    }));
  }),

  bindingByEquipment: authedQuery
    .input(z.object({ equipmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const binding = await getDb().query.equipmentDriverBindings.findFirst({
        where: eq(equipmentDriverBindings.equipmentId, input.equipmentId),
      });
      if (!binding) return null;
      return ctx.user.role === "admin"
        ? { ...binding, connectionConfig: asConfig(binding.connectionConfig) }
        : redactBinding(binding);
    }),

  bindEquipment: adminQuery
    .input(
      z.object({
        equipmentId: z.number(),
        driverKey: z.string().min(2).max(20),
        driverVersion: z.string().min(1).max(12),
        mode: z.enum(["simulation", "edge"]),
        connectionConfig: configInput,
        secretRef: secretRefInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [eqp, manifest] = await Promise.all([
        db.query.equipment.findFirst({ where: eq(equipment.id, input.equipmentId) }),
        resolvePublishedManifest(input.driverKey, input.driverVersion),
      ]);
      if (!eqp) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
      if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: "已发布驱动版本不存在" });
      const issues = validateDriverConfiguration(manifest, input.connectionConfig);
      if (issues.length) throw new TRPCError({ code: "BAD_REQUEST", message: issues.join("；") });
      const before = await db.query.equipmentDriverBindings.findFirst({
        where: eq(equipmentDriverBindings.equipmentId, input.equipmentId),
      });
      return db.transaction(async (tx) => {
        await tx
          .insert(equipmentDriverBindings)
          .values({
            equipmentId: input.equipmentId,
            driverKey: input.driverKey,
            driverVersion: input.driverVersion,
            mode: input.mode,
            connectionConfig: JSON.stringify(input.connectionConfig),
            secretRef: input.secretRef ?? null,
            status: "unconfigured",
            lastTestAt: null,
            lastMessage: null,
            createdByName: ctx.user.name,
            enabled: true,
          })
          .onDuplicateKeyUpdate({
            set: {
              driverKey: input.driverKey,
              driverVersion: input.driverVersion,
              mode: input.mode,
              connectionConfig: JSON.stringify(input.connectionConfig),
              secretRef: input.secretRef ?? null,
              status: "unconfigured",
              lastTestAt: null,
              lastMessage: null,
              enabled: true,
            },
          });
        const after = await tx.query.equipmentDriverBindings.findFirst({
          where: eq(equipmentDriverBindings.equipmentId, input.equipmentId),
        });
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "绑定了设备驱动",
          entityType: "equipment_driver",
          entityId: input.equipmentId,
          entityName: eqp.name,
          before: before && {
            ...before,
            connectionConfig: "[redacted]",
            secretRef: before.secretRef ? "[secret-ref]" : null,
          },
          after: after && { ...after, connectionConfig: "[redacted]", secretRef: after.secretRef ? "[secret-ref]" : null },
        });
        return { ok: true, bindingId: after?.id };
      });
    }),

  testBinding: adminQuery
    .input(z.object({ equipmentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const binding = await db.query.equipmentDriverBindings.findFirst({
        where: eq(equipmentDriverBindings.equipmentId, input.equipmentId),
      });
      if (!binding) throw new TRPCError({ code: "NOT_FOUND", message: "该设备尚未绑定驱动" });
      const manifest = await resolvePublishedManifest(binding.driverKey, binding.driverVersion);
      if (!manifest) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "绑定的驱动版本不可用" });
      const config = asConfig(binding.connectionConfig);
      const issues = validateDriverConfiguration(manifest, config);
      const simulated = binding.mode === "simulation";
      const status = issues.length ? "fault" : simulated ? "simulation_ready" : "offline";
      const message = issues.length
        ? issues.join("；")
        : simulated
          ? `模拟器配置通过；已加载 ${manifest.actions.length} 个动作`
          : "连接参数通过；尚未收到本地 Edge Agent 心跳，未向物理设备发送命令";
      const testedAt = new Date();
      return db.transaction(async (tx) => {
        await tx
          .update(equipmentDriverBindings)
          .set({ status, lastTestAt: testedAt, lastMessage: message })
          .where(eq(equipmentDriverBindings.id, binding.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: simulated ? "验证了设备驱动模拟器" : "检查了设备 Edge Agent 配置",
          entityType: "equipment_driver",
          entityId: input.equipmentId,
          detail: message,
          after: { status, testedAt, simulated },
        });
        return { ok: status === "simulation_ready", status, message, testedAt, simulated };
      });
    }),

  nodeCatalog: authedQuery.query(async () => {
    const [customCatalog, bindings] = await Promise.all([
      customEntries(true).then((entries) =>
        entries.filter((entry) => entry.releaseStatus !== "draft"),
      ),
      getDb()
        .select()
        .from(equipmentDriverBindings)
        .where(eq(equipmentDriverBindings.enabled, true)),
    ]);
    const catalog = [...builtInEntries(), ...customCatalog];
    return catalog.flatMap((entry) =>
      entry.actions
        .filter((action) => action.exposeAsNode)
        .map((action) => ({
          templateKey: makeDriverTemplateKey(entry.driverKey, entry.version, action.key),
          driverKey: entry.driverKey,
          driverVersion: entry.version,
          driverName: entry.name,
          driverNameEn: entry.nameEn,
          vendor: entry.vendor,
          maturity: entry.maturity,
          releaseStatus: entry.releaseStatus,
          action,
          defaults: driverDefaults(action.fields),
          compatibleEquipmentIds: bindings
            .filter(
              (binding) =>
                binding.driverKey === entry.driverKey &&
                binding.driverVersion === entry.version &&
                bindingEligibleForAction(entry, action, binding),
            )
            .map((binding) => binding.equipmentId),
          simulationEquipmentIds: bindings
            .filter(
              (binding) =>
                binding.driverKey === entry.driverKey &&
                binding.driverVersion === entry.version &&
                binding.mode === "simulation" &&
                bindingEligibleForAction(entry, action, binding),
            )
            .map((binding) => binding.equipmentId),
        })),
    );
  }),
});
