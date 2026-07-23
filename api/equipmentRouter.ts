import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { equipment, equipmentBookings, equipmentMaintenance } from "@db/schema";
import { logActivity } from "./queries/labHelpers";

const CATEGORIES = ["analytical", "execution", "automation", "support"] as const;
const STATUSES = ["available", "in_use", "maintenance", "fault"] as const;

const equipmentInput = z.object({
  name: z.string().min(1, "设备名称不能为空").max(255),
  category: z.enum(CATEGORIES),
  model: z.string().max(255).optional(),
  serialNo: z.string().max(100).optional(),
  room: z.string().max(100).optional(),
  responsibleName: z.string().max(255).optional(),
  specs: z.string().optional(),
  nextCalibrationDate: z.string().nullable().optional(),
});

export const equipmentRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          category: z.enum(CATEGORIES).optional(),
          status: z.enum(STATUSES).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [];
      if (input?.category) conditions.push(eq(equipment.category, input.category));
      if (input?.status) conditions.push(eq(equipment.status, input.status));
      const rows = await db
        .select()
        .from(equipment)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(equipment.category), asc(equipment.name));
      // 今日预约数
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      const todayBookings = await db
        .select()
        .from(equipmentBookings)
        .where(
          and(
            eq(equipmentBookings.status, "active"),
            lt(equipmentBookings.startTime, todayEnd),
            gte(equipmentBookings.endTime, todayStart),
          ),
        );
      return rows.map((e) => ({
        ...e,
        todayBookingCount: todayBookings.filter((b) => b.equipmentId === e.id).length,
      }));
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const eqp = await db.query.equipment.findFirst({
      where: eq(equipment.id, input.id),
    });
    if (!eqp) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
    const bookings = await db
      .select()
      .from(equipmentBookings)
      .where(eq(equipmentBookings.equipmentId, input.id))
      .orderBy(desc(equipmentBookings.startTime))
      .limit(50);
    const maintenance = await db
      .select()
      .from(equipmentMaintenance)
      .where(eq(equipmentMaintenance.equipmentId, input.id))
      .orderBy(desc(equipmentMaintenance.performedAt))
      .limit(30);
    return { ...eqp, bookings, maintenance };
  }),

  create: authedQuery.input(equipmentInput).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb()
      .insert(equipment)
      .values({ ...input, nextCalibrationDate: input.nextCalibrationDate ?? null })
      .$returningId();
    await logActivity({
      userName: ctx.user.name,
      action: "登记了设备",
      entityType: "equipment",
      entityId: id,
      entityName: input.name,
    });
    return { id };
  }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        status: z.enum(STATUSES).optional(),
        room: z.string().max(100).optional(),
        responsibleName: z.string().max(255).optional(),
        specs: z.string().optional(),
        nextCalibrationDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().update(equipment).set(data).where(eq(equipment.id, id));
      if (data.status) {
        const names: Record<string, string> = {
          available: "设为可用",
          in_use: "标记为使用中",
          maintenance: "转入维护",
          fault: "标记故障",
        };
        const eqp = await getDb().query.equipment.findFirst({ where: eq(equipment.id, id) });
        await logActivity({
          userName: ctx.user.name,
          action: `将设备${names[data.status]}`,
          entityType: "equipment",
          entityId: id,
          entityName: eqp?.name,
        });
      }
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const eqp = await db.query.equipment.findFirst({ where: eq(equipment.id, input.id) });
    await db.delete(equipmentBookings).where(eq(equipmentBookings.equipmentId, input.id));
    await db.delete(equipmentMaintenance).where(eq(equipmentMaintenance.equipmentId, input.id));
    await db.delete(equipment).where(eq(equipment.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了设备",
      entityType: "equipment",
      entityId: input.id,
      entityName: eqp?.name,
    });
    return { ok: true };
  }),

  /** 预约设备（冲突检测） */
  book: authedQuery
    .input(
      z.object({
        equipmentId: z.number(),
        purpose: z.string().max(500).optional(),
        startTime: z.date(),
        endTime: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const eqp = await db.query.equipment.findFirst({
        where: eq(equipment.id, input.equipmentId),
      });
      if (!eqp) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
      if (eqp.status === "maintenance" || eqp.status === "fault") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `设备当前${eqp.status === "fault" ? "故障" : "维护中"}，不可预约`,
        });
      }
      if (input.endTime <= input.startTime) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "结束时间必须晚于开始时间" });
      }
      // 冲突检测：已有 active 预约时间段重叠
      const conflicts = await db
        .select()
        .from(equipmentBookings)
        .where(
          and(
            eq(equipmentBookings.equipmentId, input.equipmentId),
            eq(equipmentBookings.status, "active"),
            lt(equipmentBookings.startTime, input.endTime),
            gte(equipmentBookings.endTime, input.startTime),
          ),
        );
      if (conflicts.length > 0) {
        const c = conflicts[0];
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `时段冲突：${c.userName} 已预约 ${c.startTime.toLocaleString("zh-CN")} — ${c.endTime.toLocaleString("zh-CN")}`,
        });
      }
      const [{ id }] = await db
        .insert(equipmentBookings)
        .values({
          equipmentId: input.equipmentId,
          userName: ctx.user.name ?? "未知用户",
          purpose: input.purpose ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
        })
        .$returningId();
      await logActivity({
        userName: ctx.user.name,
        action: "预约了设备",
        entityType: "equipment",
        entityId: input.equipmentId,
        entityName: eqp.name,
        detail: `${input.startTime.toLocaleString("zh-CN")} — ${input.endTime.toLocaleString("zh-CN")}`,
      });
      return { id };
    }),

  cancelBooking: authedQuery
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const booking = await db.query.equipmentBookings.findFirst({
        where: eq(equipmentBookings.id, input.bookingId),
      });
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在" });
      if (booking.userName !== ctx.user.name && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "仅预约人或管理员可以取消预约",
        });
      }
      await db
        .update(equipmentBookings)
        .set({ status: "cancelled" })
        .where(eq(equipmentBookings.id, input.bookingId));
      return { ok: true };
    }),

  /** 登记维护/校准记录 */
  addMaintenance: authedQuery
    .input(
      z.object({
        equipmentId: z.number(),
        type: z.enum(["calibration", "maintenance", "repair"]),
        description: z.string().max(500).optional(),
        nextDueDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const eqp = await db.query.equipment.findFirst({
        where: eq(equipment.id, input.equipmentId),
      });
      if (!eqp) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
      const [{ id }] = await db
        .insert(equipmentMaintenance)
        .values({
          equipmentId: input.equipmentId,
          type: input.type,
          description: input.description ?? null,
          performedBy: ctx.user.name ?? null,
          performedAt: new Date(),
          nextDueDate: input.nextDueDate ?? null,
        })
        .$returningId();
      // 更新设备校准到期日，并恢复可用状态
      await db
        .update(equipment)
        .set({
          nextCalibrationDate: input.nextDueDate ?? eqp.nextCalibrationDate,
          status: eqp.status === "maintenance" || eqp.status === "fault" ? "available" : eqp.status,
        })
        .where(eq(equipment.id, input.equipmentId));
      const typeNames = { calibration: "校准", maintenance: "维护", repair: "维修" };
      await logActivity({
        userName: ctx.user.name,
        action: `登记了设备${typeNames[input.type]}记录`,
        entityType: "equipment",
        entityId: input.equipmentId,
        entityName: eqp.name,
      });
      return { id };
    }),

  /** 今日全部预约（工作台视图） */
  todayBookings: authedQuery.query(async () => {
    const db = getDb();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 2); // 今明两天
    const rows = await db
      .select({
        booking: equipmentBookings,
        equipmentName: equipment.name,
        category: equipment.category,
      })
      .from(equipmentBookings)
      .leftJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
      .where(
        and(
          eq(equipmentBookings.status, "active"),
          lt(equipmentBookings.startTime, end),
          gte(equipmentBookings.endTime, start),
        ),
      )
      .orderBy(asc(equipmentBookings.startTime))
      .limit(30);
    return rows.map((r) => ({
      ...r.booking,
      equipmentName: r.equipmentName,
      category: r.category,
    }));
  }),
});
