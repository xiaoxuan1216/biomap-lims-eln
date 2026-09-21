import type { CloningPlan } from "@contracts/cloningLayout";
import type { BioViewRendererRef as ContractBioViewRendererRef } from "@contracts/bioView";

export const BIOVIEW_RENDERER_REFS = [
  "generic-overview@1",
  "cloning-plate-flow@1",
  "sample-plate-layout@1",
  "run-data-flow@1",
  "sample-lineage@1",
  "operation-timeline@1",
  "sample-table@1",
  "material-table@1",
  "parameter-summary@1",
] as const satisfies readonly ContractBioViewRendererRef[];

export type BioViewRendererRef = ContractBioViewRendererRef;
export type BioViewMode = "design" | "draft" | "run";

export interface BioViewNodeInput {
  id?: string | number | null;
  key?: string | null;
  nodeKey?: string | null;
  label?: string | null;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  templateKey?: string | null;
  operation?: string | null;
  equipmentId?: string | number | null;
  equipmentName?: string | null;
  equipmentModel?: string | null;
  driverKey?: string | null;
  driverVersion?: string | null;
  parameterSnapshot?: unknown;
  config?: unknown;
  params?: unknown;
  parameters?: unknown;
}

export interface BioViewEdgeInput {
  id?: string | number | null;
  source?: string | null;
  sourceKey?: string | null;
  from?: string | null;
  target?: string | null;
  targetKey?: string | null;
  to?: string | null;
}

export interface BioViewResourceInput {
  id?: string | number | null;
  sampleId?: string | number | null;
  sku?: string | null;
  name?: string | null;
  sampleName?: string | null;
  type?: string | null;
  sampleType?: string | null;
  role?: string | null;
  nodeKey?: string | null;
  plannedAmount?: string | number | null;
  amount?: string | number | null;
  quantity?: string | number | null;
  unit?: string | null;
  status?: string | null;
  container?: string | null;
  well?: string | null;
  position?: string | null;
  currentLocationName?: string | null;
  currentBoxRow?: number | null;
  currentBoxCol?: number | null;
  frozenBoxRow?: number | null;
  frozenBoxCol?: number | null;
}

export interface BioViewTargetBinding {
  target: number;
  sampleId: number;
  sku: string;
  name: string;
  type: string;
}

export interface BioViewInput {
  /** A VisualizationBlueprint, ExecutionLayoutSnapshot, or the complete frozen Run snapshot. */
  manifest?: unknown;
  /** Immutable method release metadata when the view belongs to a saved Run. */
  method?: {
    id?: string | number | null;
    version?: string | number | null;
  } | null;
  /** Live editor graph data overrides graph data found in manifest. */
  nodes?: readonly BioViewNodeInput[] | null;
  edges?: readonly BioViewEdgeInput[] | null;
  samples?: readonly BioViewResourceInput[] | null;
  materials?: readonly BioViewResourceInput[] | null;
  parameters?: unknown;
  /** Accepts either a raw CloningPlan or the existing frozen plan wrapper. */
  cloningPlan?: unknown;
  targetBindings?: readonly BioViewTargetBinding[] | null;
  mode?: BioViewMode;
}

export interface NormalizedBioViewNode {
  key: string;
  label: string;
  type: string | null;
  status: string | null;
  templateKey: string | null;
  operation: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  equipmentModel: string | null;
  driverKey: string | null;
  driverVersion: string | null;
  parameters: unknown;
}

export interface NormalizedBioViewEdge {
  id: string;
  source: string;
  target: string;
}

export interface NormalizedBioViewResource {
  id: string;
  sampleId: string | null;
  sku: string | null;
  name: string;
  type: string | null;
  role: string | null;
  nodeKey: string | null;
  amount: string | number | null;
  unit: string | null;
  status: string | null;
  position: string | null;
  locationName: string | null;
}

export interface NormalizedBioViewDefinition {
  id: string;
  title: string | null;
  rendererRef: string;
  scope: string | null;
  binding: string | null;
}

export interface NormalizedBioViewReadiness {
  score: number | null;
  label: string | null;
  issues: string[];
}

export interface NormalizedBioView {
  mode: BioViewMode;
  kind: string | null;
  schemaVersion: string | null;
  sourceTemplate: string | null;
  workflowId: number | null;
  methodReleaseId: number | null;
  methodReleaseVersion: number | null;
  domainPack: string | null;
  snapshotHash: string | null;
  readiness: NormalizedBioViewReadiness;
  views: NormalizedBioViewDefinition[];
  nodes: NormalizedBioViewNode[];
  edges: NormalizedBioViewEdge[];
  samples: NormalizedBioViewResource[];
  materials: NormalizedBioViewResource[];
  executionNodes: Record<string, unknown>[];
  parameters: unknown;
  cloningPlan: CloningPlan | null;
  targetBindings: BioViewTargetBinding[];
  manifestState: "missing" | "valid" | "invalid";
  unknownRendererRefs: string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function parseRecord(value: unknown): {
  record: UnknownRecord | null;
  invalid: boolean;
} {
  if (typeof value !== "string")
    return {
      record: asRecord(value),
      invalid: value != null && !asRecord(value),
    };
  try {
    return { record: asRecord(JSON.parse(value) as unknown), invalid: false };
  } catch {
    return { record: null, invalid: true };
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]): string | null {
  const value = values.find(
    candidate => typeof candidate === "string" && candidate.trim().length > 0
  );
  return typeof value === "string" ? value.trim() : null;
}

function resourceId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return firstString(value);
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeNodes(value: unknown): NormalizedBioViewNode[] {
  const seen = new Set<string>();
  return asArray(value).flatMap((entry, index) => {
    const node = asRecord(entry);
    if (!node) return [];
    const baseKey =
      firstString(node.nodeKey, node.key, node.id) ?? `node-${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (seen.has(key)) key = `${baseKey}-${suffix++}`;
    seen.add(key);
    return [
      {
        key,
        label: firstString(node.label, node.name) ?? key,
        type: firstString(node.type),
        status: firstString(node.status),
        templateKey: firstString(node.templateKey),
        operation: firstString(node.operation),
        equipmentId: resourceId(node.equipmentId),
        equipmentName: firstString(node.equipmentName),
        equipmentModel: firstString(node.equipmentModel),
        driverKey: firstString(node.driverKey),
        driverVersion: firstString(node.driverVersion),
        parameters:
          node.parameterSnapshot ??
          node.parameters ??
          node.params ??
          node.config ??
          null,
      },
    ];
  });
}

function normalizeEdges(value: unknown): NormalizedBioViewEdge[] {
  return asArray(value).flatMap((entry, index) => {
    const edge = asRecord(entry);
    if (!edge) return [];
    const source = firstString(edge.sourceKey, edge.source, edge.from);
    const target = firstString(edge.targetKey, edge.target, edge.to);
    if (!source || !target) return [];
    return [
      {
        id: firstString(edge.id) ?? `${source}->${target}-${index + 1}`,
        source,
        target,
      },
    ];
  });
}

function normalizeResources(value: unknown): NormalizedBioViewResource[] {
  return asArray(value).flatMap((entry, index) => {
    const resource = asRecord(entry);
    if (!resource) return [];
    const id =
      resourceId(resource.id) ??
      firstString(resource.sku) ??
      `resource-${index + 1}`;
    const container = firstString(resource.container);
    const well = firstString(resource.well);
    const locationName = firstString(resource.currentLocationName);
    const boxRow =
      typeof resource.currentBoxRow === "number"
        ? resource.currentBoxRow
        : typeof resource.frozenBoxRow === "number"
          ? resource.frozenBoxRow
          : null;
    const boxCol =
      typeof resource.currentBoxCol === "number"
        ? resource.currentBoxCol
        : typeof resource.frozenBoxCol === "number"
          ? resource.frozenBoxCol
          : null;
    const boxPosition =
      boxRow !== null && boxCol !== null
        ? `${String.fromCharCode(65 + boxRow)}${boxCol + 1}`
        : null;
    return [
      {
        id,
        sampleId: resourceId(resource.sampleId) ?? resourceId(resource.id),
        sku: firstString(resource.sku),
        name:
          firstString(
            resource.name,
            resource.sampleName,
            resource.label,
            resource.sku
          ) ?? id,
        type: firstString(resource.type, resource.sampleType),
        role: firstString(resource.role),
        nodeKey: firstString(resource.nodeKey),
        amount:
          typeof resource.plannedAmount === "number" ||
          typeof resource.plannedAmount === "string"
            ? resource.plannedAmount
            : typeof resource.amount === "number" ||
                typeof resource.amount === "string"
              ? resource.amount
              : typeof resource.quantity === "number" ||
                  typeof resource.quantity === "string"
                ? resource.quantity
                : null,
        unit: firstString(resource.unit),
        status: firstString(resource.status),
        position:
          firstString(resource.position) ??
          (container ? `${container}${well ? `:${well}` : ""}` : null) ??
          (locationName
            ? `${locationName}${boxPosition ? `:${boxPosition}` : ""}`
            : boxPosition),
        locationName,
      },
    ];
  });
}

function normalizeViews(value: unknown): NormalizedBioViewDefinition[] {
  return asArray(value).flatMap((entry, index) => {
    const view = asRecord(entry);
    if (!view) return [];
    const rendererRef = firstString(view.rendererRef, view.rendererKey);
    if (!rendererRef) return [];
    return [
      {
        id: firstString(view.id) ?? `view-${index + 1}`,
        title: firstString(view.title),
        rendererRef,
        scope: firstString(view.scope),
        binding: firstString(view.binding),
      },
    ];
  });
}

function normalizeReadiness(value: unknown): NormalizedBioViewReadiness {
  const readiness = asRecord(value);
  const rawScore = readiness?.score;
  const score =
    typeof rawScore === "number" && Number.isFinite(rawScore)
      ? Math.min(100, Math.max(0, rawScore))
      : null;
  return {
    score,
    label: firstString(readiness?.label, readiness?.level),
    issues: asArray(readiness?.issues).flatMap(issue => {
      if (typeof issue === "string") return [issue];
      const record = asRecord(issue);
      const code = firstString(record?.code);
      return code ? [code] : [];
    }),
  };
}

function isBioViewRendererRef(value: string): value is BioViewRendererRef {
  return (BIOVIEW_RENDERER_REFS as readonly string[]).includes(value);
}

function isTargetBinding(value: unknown): value is BioViewTargetBinding {
  const binding = asRecord(value);
  return (
    !!binding &&
    Number.isInteger(binding.target) &&
    Number(binding.target) > 0 &&
    Number.isInteger(binding.sampleId) &&
    Number(binding.sampleId) > 0 &&
    typeof binding.sku === "string" &&
    typeof binding.name === "string" &&
    typeof binding.type === "string"
  );
}

/**
 * This guard is intentionally stricter than the UI needs. An incomplete or user-crafted
 * object must fall back to the generic renderer instead of crashing the domain renderer.
 */
export function isCloningPlan(value: unknown): value is CloningPlan {
  const plan = asRecord(value);
  const config = asRecord(plan?.config);
  const summary = asRecord(plan?.summary);
  const stages = asArray(plan?.stages);
  const requiredStageKeys = [
    "A",
    "B",
    "C",
    "E",
    "F",
    "G",
    "H",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
  ];
  if (!plan || plan.planningOnly !== true || !config || !summary) return false;
  if (!Number.isInteger(config.samples) || Number(config.samples) < 1)
    return false;
  if (!Array.isArray(plan.materials) || !Array.isArray(plan.dishes))
    return false;
  if (
    !requiredStageKeys.every(key =>
      stages.some(stage => asRecord(stage)?.key === key)
    )
  )
    return false;
  return stages.every(stageValue => {
    const stage = asRecord(stageValue);
    if (
      !stage ||
      typeof stage.key !== "string" ||
      typeof stage.name !== "string"
    )
      return false;
    return asArray(stage.plates).every(plateValue => {
      const plate = asRecord(plateValue);
      return (
        !!plate &&
        typeof plate.id === "string" &&
        Array.isArray(plate.samples) &&
        Array.isArray(plate.controls) &&
        Array.isArray(plate.blocked)
      );
    });
  });
}

function resolveCloningPlan(value: unknown): {
  plan: CloningPlan | null;
  targetBindings: BioViewTargetBinding[];
} {
  if (isCloningPlan(value)) return { plan: value, targetBindings: [] };
  const wrapper = asRecord(value);
  const targetBindings = asArray(wrapper?.targetBindings).filter(
    isTargetBinding
  );
  return {
    plan: isCloningPlan(wrapper?.plan) ? wrapper.plan : null,
    targetBindings,
  };
}

function modeFromManifest(kind: string | null): BioViewMode {
  return kind && /execution|run/i.test(kind) ? "run" : "design";
}

/**
 * Converts live BioFlow data, a BioView manifest, or an entire frozen Run snapshot into
 * one safe presentation model. No renderer name is ever interpreted as executable code.
 */
export function normalizeBioView(input: BioViewInput): NormalizedBioView {
  const parsed = parseRecord(input.manifest);
  const root = parsed.record;
  const hasEmbeddedBioView =
    !!root && Object.prototype.hasOwnProperty.call(root, "bioView");
  const embeddedBioViewMissing =
    hasEmbeddedBioView && (root?.bioView == null || root?.bioView === "");
  const nested = hasEmbeddedBioView
    ? asRecord(root?.bioView)
    : (asRecord(root?.viewManifest) ?? root);
  const workflow = asRecord(root?.workflow);
  const nestedWorkflow = asRecord(nested?.workflow);
  const method = asRecord(input.method ?? root?.method ?? nested?.method);
  const bindings = asRecord(nested?.bindings);
  const provenance = asRecord(nested?.provenance);

  const rootResources = normalizeResources(root?.resources);
  const explicitSamples = input.samples
    ? normalizeResources(input.samples)
    : [];
  const explicitMaterials = input.materials
    ? normalizeResources(input.materials)
    : [];
  const sampleIds = new Set(
    asArray(bindings?.sampleResourceIds)
      .map(resourceId)
      .filter((id): id is string => !!id)
  );
  const materialIds = new Set(
    asArray(bindings?.materialResourceIds)
      .map(resourceId)
      .filter((id): id is string => !!id)
  );
  const samples =
    explicitSamples.length > 0
      ? explicitSamples
      : rootResources.filter(resource =>
          sampleIds.size > 0
            ? sampleIds.has(resource.id)
            : resource.role !== "material"
        );
  const materials =
    explicitMaterials.length > 0
      ? explicitMaterials
      : rootResources.filter(resource =>
          materialIds.size > 0
            ? materialIds.has(resource.id)
            : resource.role === "material"
        );

  const frozenCloning = resolveCloningPlan(
    input.cloningPlan ?? root?.cloningLayoutPlan ?? nested?.cloningLayoutPlan
  );
  const explicitBindings = input.targetBindings?.filter(isTargetBinding) ?? [];
  const views = normalizeViews(nested?.views);
  const unknownRendererRefs = Array.from(
    new Set(
      views
        .map(view => view.rendererRef)
        .filter(rendererRef => !isBioViewRendererRef(rendererRef))
    )
  );
  const kind = firstString(nested?.kind);

  return {
    mode: input.mode ?? modeFromManifest(kind),
    kind,
    schemaVersion: firstString(nested?.schemaVersion),
    sourceTemplate: firstString(
      nested?.sourceTemplate,
      workflow?.name,
      nestedWorkflow?.name
    ),
    workflowId: positiveInteger(
      provenance?.workflowId ?? workflow?.id ?? nestedWorkflow?.id
    ),
    methodReleaseId: positiveInteger(method?.id),
    methodReleaseVersion: positiveInteger(method?.version),
    domainPack: firstString(nested?.domainPack),
    snapshotHash: firstString(nested?.snapshotHash),
    readiness: normalizeReadiness(nested?.readiness),
    views,
    nodes: normalizeNodes(
      input.nodes ?? root?.nodes ?? nested?.nodes ?? nestedWorkflow?.nodes
    ),
    edges: normalizeEdges(
      input.edges ?? root?.edges ?? nested?.edges ?? nestedWorkflow?.edges
    ),
    samples,
    materials,
    executionNodes: asArray(
      root?.executionNodes ?? nested?.executionNodes
    ).flatMap(entry => {
      const record = asRecord(entry);
      return record ? [record] : [];
    }),
    parameters:
      input.parameters ?? nested?.parameters ?? root?.parameters ?? null,
    cloningPlan: frozenCloning.plan,
    targetBindings:
      explicitBindings.length > 0
        ? [...explicitBindings]
        : frozenCloning.targetBindings,
    manifestState:
      input.manifest == null || embeddedBioViewMissing
        ? "missing"
        : parsed.invalid || !nested
          ? "invalid"
          : "valid",
    unknownRendererRefs,
  };
}

export function controlledRendererRefs(
  view: NormalizedBioView
): BioViewRendererRef[] {
  const resolved = view.views.flatMap(definition =>
    isBioViewRendererRef(definition.rendererRef) ? [definition.rendererRef] : []
  );
  return Array.from(new Set(resolved));
}

export function orderedBioViewNodes(
  nodes: readonly NormalizedBioViewNode[],
  edges: readonly NormalizedBioViewEdge[]
): NormalizedBioViewNode[] {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const indegree = new Map(nodes.map(node => [node.key, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!byKey.has(edge.source) || !byKey.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ]);
  }
  const queue = nodes
    .filter(node => indegree.get(node.key) === 0)
    .map(node => node.key);
  const ordered: NormalizedBioViewNode[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    const node = byKey.get(key);
    if (!node) continue;
    ordered.push(node);
    for (const target of outgoing.get(key) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  const included = new Set(ordered.map(node => node.key));
  return [...ordered, ...nodes.filter(node => !included.has(node.key))];
}
