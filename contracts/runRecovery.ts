import { z } from "zod";
export const reworkSourceSchema = z.object({ runId: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) });
export function approvedEquipmentOverrides(events: { action: string; payload: string }[]) {
  const overrides: Record<string, { equipmentId: number; name: string; approvedBy: string }> = {};
  for (const event of events) if (event.action === "approve_equipment") {
    const payload = JSON.parse(event.payload) as { approvedEquipment?: { nodeKey: string; equipmentId: number; name: string; approvedBy: string } };
    if (payload.approvedEquipment) overrides[payload.approvedEquipment.nodeKey] = payload.approvedEquipment;
  }
  return overrides;
}
