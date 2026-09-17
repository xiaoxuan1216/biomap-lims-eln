import type { CloningStageKey } from "@contracts/cloningLayout";

// Preview stages for existing cloning nodes; these are planning views, not run bindings.
const STAGES: Record<string, CloningStageKey> = {
  m_primer_design: "B", m_pcr: "E", e_hamilton_pcrsetup: "E", e_trobot: "E",
  e_hamilton_cleanup: "F", m_gibson: "G", e_hamilton_gibson: "G",
  m_transform: "H", e_hamilton_transform: "H", m_pick_clone: "J", e_biomek_colony: "J",
  m_plasmid_prep: "M", e_hamilton_miniprep: "M", e_seq: "N",
  m_ab_cloning: "A", a_auto_cloning: "A",
};

export function nodePlateStage(templateKey?: string | null): CloningStageKey | undefined {
  return templateKey ? STAGES[templateKey] : undefined;
}

export function workflowPlateUrl(workflowId: number, context: { planId?: number; nodeKey?: string | null } = {}) {
  const params = new URLSearchParams({ view: "plates" });
  if (context.nodeKey) params.set("nodeKey", context.nodeKey);
  if (context.planId) params.set("planId", String(context.planId));
  return `/workflows/${workflowId}?${params}`;
}
