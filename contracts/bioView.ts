import { z } from "zod";

export const BIOVIEW_SCHEMA_VERSION = "biomap.view/v1" as const;
export const BIOVIEW_COMPILER = "biomap-view-compiler@1" as const;
export const BIOVIEW_RENDERER_BUNDLE = "biomap-renderers@1" as const;

export const bioViewRendererRefSchema = z.enum([
  "generic-overview@1",
  "cloning-plate-flow@1",
  "sample-plate-layout@1",
  "run-data-flow@1",
  "sample-lineage@1",
  "operation-timeline@1",
  "sample-table@1",
  "material-table@1",
  "parameter-summary@1",
]);

export type BioViewRendererRef = z.infer<typeof bioViewRendererRefSchema>;

export const bioViewViewSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    title: z.string().trim().min(1).max(120),
    rendererRef: bioViewRendererRefSchema,
    scope: z.enum(["workflow", "run", "node"]),
    binding: z.enum([
      "auto",
      "workflow",
      "resources",
      "parameters",
      "events",
      "cloning-layout",
      "sample-plates",
      "data-flow",
    ]),
  })
  .strict();

export type BioViewView = z.infer<typeof bioViewViewSchema>;

export const bioViewSemanticBindingSchema = z
  .object({
    nodeKey: z.string().trim().min(1).max(64),
    semanticRole: z.enum([
      "input",
      "process",
      "measurement",
      "decision",
      "output",
      "storage",
      "transport",
    ]),
    artifactType: z.string().trim().min(1).max(96).optional(),
  })
  .strict();

export type BioViewSemanticBinding = z.infer<
  typeof bioViewSemanticBindingSchema
>;

export const bioViewVisualizationSpecSchema = z
  .object({
    schemaVersion: z.literal(BIOVIEW_SCHEMA_VERSION),
    kind: z.literal("VisualizationBlueprint"),
    domainPack: z
      .string()
      .trim()
      .min(3)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9-]*@[0-9]+(?:\.[0-9]+){0,2}(?:-[a-z0-9.-]+)?$/),
    compiler: z.literal(BIOVIEW_COMPILER),
    rendererBundle: z.literal(BIOVIEW_RENDERER_BUNDLE),
    views: z.array(bioViewViewSchema).min(1).max(12),
    semanticBindings: z
      .array(bioViewSemanticBindingSchema)
      .max(256)
      .default([]),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const ids = new Set<string>();
    const rendererRefs = new Set<BioViewRendererRef>();
    for (const [index, view] of spec.views.entries()) {
      if (ids.has(view.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["views", index, "id"],
          message: "view id must be unique",
        });
      }
      ids.add(view.id);
      if (rendererRefs.has(view.rendererRef)) {
        ctx.addIssue({
          code: "custom",
          path: ["views", index, "rendererRef"],
          message: "rendererRef must be unique",
        });
      }
      rendererRefs.add(view.rendererRef);
      if (
        view.rendererRef === "cloning-plate-flow@1" &&
        view.binding !== "cloning-layout"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["views", index, "binding"],
          message: "cloning-plate-flow@1 requires cloning-layout binding",
        });
      }
      if (
        view.rendererRef === "sample-plate-layout@1" &&
        view.binding !== "sample-plates"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["views", index, "binding"],
          message: "sample-plate-layout@1 requires sample-plates binding",
        });
      }
      if (
        view.rendererRef === "run-data-flow@1" &&
        view.binding !== "data-flow"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["views", index, "binding"],
          message: "run-data-flow@1 requires data-flow binding",
        });
      }
    }

    const nodeKeys = new Set<string>();
    for (const [index, binding] of spec.semanticBindings.entries()) {
      if (nodeKeys.has(binding.nodeKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["semanticBindings", index, "nodeKey"],
          message: "a node can have only one semantic binding",
        });
      }
      nodeKeys.add(binding.nodeKey);
    }
  });

export type BioViewVisualizationSpec = z.infer<
  typeof bioViewVisualizationSpecSchema
>;

export function defaultBioViewVisualizationSpec(): BioViewVisualizationSpec {
  return {
    schemaVersion: BIOVIEW_SCHEMA_VERSION,
    kind: "VisualizationBlueprint",
    domainPack: "generic-lab@1.0.0",
    compiler: BIOVIEW_COMPILER,
    rendererBundle: BIOVIEW_RENDERER_BUNDLE,
    views: [
      {
        id: "overview",
        title: "实验总览",
        rendererRef: "generic-overview@1",
        scope: "run",
        binding: "workflow",
      },
      {
        id: "timeline",
        title: "执行时间线",
        rendererRef: "operation-timeline@1",
        scope: "workflow",
        binding: "events",
      },
      {
        id: "run-data-flow",
        title: "LIMS 数据与证据链",
        rendererRef: "run-data-flow@1",
        scope: "run",
        binding: "data-flow",
      },
    ],
    semanticBindings: [],
  };
}

export function parseBioViewVisualizationSpec(
  raw: unknown
): BioViewVisualizationSpec | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = bioViewVisualizationSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const bioViewReadinessIssueSchema = z
  .object({
    code: z.enum([
      "visualization-spec-missing",
      "visualization-spec-invalid",
      "semantic-node-missing",
      "cloning-layout-missing",
      "sample-plate-layout-missing",
      "renderer-fallback-applied",
    ]),
    viewId: z.string().max(64).optional(),
    nodeKey: z.string().max(64).optional(),
  })
  .strict();

const bioViewExecutionSnapshotCoreSchema = z
  .object({
    schemaVersion: z.literal(BIOVIEW_SCHEMA_VERSION),
    kind: z.literal("ExecutionLayoutSnapshot"),
    sourceTemplate: z.string().trim().min(1).max(255),
    domainPack: z.string().trim().min(3).max(128),
    compiler: z.literal(BIOVIEW_COMPILER),
    rendererBundle: z.literal(BIOVIEW_RENDERER_BUNDLE),
    readiness: z
      .object({
        level: z.enum(["complete", "partial", "fallback"]),
        score: z.number().int().min(0).max(100),
        issues: z.array(bioViewReadinessIssueSchema).max(256),
      })
      .strict(),
    inputContract: z
      .object({
        nodeCount: z.number().int().nonnegative(),
        edgeCount: z.number().int().nonnegative(),
        resourceCount: z.number().int().nonnegative(),
        sampleCount: z.number().int().nonnegative(),
        materialCount: z.number().int().nonnegative(),
        equipmentNodeCount: z.number().int().nonnegative(),
        samplePlatePlanCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    // A Blueprint may define 12 views; Run compilation can add the two governed
    // LIMS overlays (sample plates and evidence flow) without dropping user views.
    views: z.array(bioViewViewSchema).min(1).max(14),
    semanticBindings: z.array(bioViewSemanticBindingSchema).max(256),
    bindings: z
      .object({
        sampleResourceIds: z.array(z.number().int().positive()).max(10_000),
        materialResourceIds: z.array(z.number().int().positive()).max(10_000),
        equipmentNodeKeys: z.array(z.string().min(1).max(64)).max(1_000),
        cloningLayoutPlanId: z.number().int().positive().nullable(),
        samplePlatePlanIds: z
          .array(z.number().int().positive())
          .max(1_000)
          .optional(),
      })
      .strict(),
    provenance: z
      .object({
        generatedAt: z.string().datetime({ offset: true }),
        workflowId: z.number().int().positive(),
        workflowUpdatedAt: z.string().datetime({ offset: true }),
        visualizationSpecHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        cloningLayoutSnapshotHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        samplePlateSnapshotHashes: z
          .array(z.string().regex(/^[a-f0-9]{64}$/))
          .max(1_000)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const bioViewExecutionSnapshotSchema =
  bioViewExecutionSnapshotCoreSchema.extend({
    snapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  });

export type BioViewExecutionSnapshotContent = z.infer<
  typeof bioViewExecutionSnapshotCoreSchema
>;
export type BioViewExecutionSnapshot = z.infer<
  typeof bioViewExecutionSnapshotSchema
>;

export type BioViewCompilerInput = {
  /** null means a legacy workflow without a saved Blueprint; the compiler uses the governed generic fallback. */
  spec: BioViewVisualizationSpec | null;
  /** Lets the compiler distinguish a missing legacy spec from a damaged stored value. */
  specState: "valid" | "missing" | "invalid";
  sourceTemplate: string;
  workflowId: number;
  workflowUpdatedAt: string;
  nodes: ReadonlyArray<{ nodeKey: string; type: string }>;
  edgeCount: number;
  resources: ReadonlyArray<{ id: number; role: string }>;
  cloningLayoutPlan: { id: number; snapshotHash: string } | null;
  samplePlatePlans?: ReadonlyArray<{ id: number; snapshotHash: string }>;
  generatedAt: string;
  visualizationSpecHash: string;
};

/**
 * Compile a saved Blueprint into the governed portion of an immutable Run view.
 * It only resolves allow-listed renderer references; no executable code or user
 * supplied renderer options are accepted by the contract.
 */
export function compileBioViewExecutionSnapshot(
  input: BioViewCompilerInput
): BioViewExecutionSnapshotContent {
  const fallbackSpec = defaultBioViewVisualizationSpec();
  const requestedSpec = input.spec ?? fallbackSpec;
  const samplePlatePlans = input.samplePlatePlans ?? [];
  const nodeKeys = new Set(input.nodes.map(node => node.nodeKey));
  const issues: Array<z.infer<typeof bioViewReadinessIssueSchema>> = [];

  if (input.specState === "missing")
    issues.push({ code: "visualization-spec-missing" });
  if (input.specState === "invalid")
    issues.push({ code: "visualization-spec-invalid" });

  const semanticBindings = requestedSpec.semanticBindings.filter(binding => {
    if (nodeKeys.has(binding.nodeKey)) return true;
    issues.push({ code: "semantic-node-missing", nodeKey: binding.nodeKey });
    return false;
  });

  const views = requestedSpec.views.filter(view => {
    if (
      view.rendererRef === "cloning-plate-flow@1" &&
      !input.cloningLayoutPlan
    ) {
      issues.push({ code: "cloning-layout-missing", viewId: view.id });
      return false;
    }
    if (
      view.rendererRef === "sample-plate-layout@1" &&
      samplePlatePlans.length === 0
    ) {
      issues.push({ code: "sample-plate-layout-missing", viewId: view.id });
      return false;
    }
    return true;
  });
  const nextSystemViewId = (preferred: string) => {
    if (!views.some(view => view.id === preferred)) return preferred;
    let suffix = 2;
    while (views.some(view => view.id === `${preferred}-${suffix}`))
      suffix += 1;
    return `${preferred}-${suffix}`;
  };

  if (
    samplePlatePlans.length > 0 &&
    !views.some(view => view.rendererRef === "sample-plate-layout@1")
  ) {
    views.unshift({
      id: nextSystemViewId("sample-plates"),
      title: "通用孔板与样本布局",
      rendererRef: "sample-plate-layout@1",
      scope: "run",
      binding: "sample-plates",
    });
  }

  if (!input.spec && input.cloningLayoutPlan) {
    views.unshift({
      id: "cloning-layout",
      title: "流程与孔板",
      rendererRef: "cloning-plate-flow@1",
      scope: "run",
      binding: "cloning-layout",
    });
  }

  if (views.length === 0) {
    views.push({
      id: "overview",
      title: "实验总览",
      rendererRef: "generic-overview@1",
      scope: "run",
      binding: "workflow",
    });
    issues.push({ code: "renderer-fallback-applied" });
  }

  if (!views.some(view => view.rendererRef === "run-data-flow@1")) {
    views.push({
      id: nextSystemViewId("run-data-flow"),
      title: "LIMS 数据与证据链",
      rendererRef: "run-data-flow@1",
      scope: "run",
      binding: "data-flow",
    });
  }

  const usedFallback =
    input.specState !== "valid" ||
    issues.some(
      issue =>
        issue.code === "cloning-layout-missing" ||
        issue.code === "sample-plate-layout-missing" ||
        issue.code === "renderer-fallback-applied"
    );
  const isPartial = !usedFallback && issues.length > 0;
  const sampleResourceIds = input.resources
    // Controls are LIMS sample-like resources: they occupy wells, keep sample
    // identity/lineage and must never be counted as consumable materials.
    .filter(resource => resource.role !== "material")
    .map(resource => resource.id);
  const materialResourceIds = input.resources
    .filter(resource => resource.role === "material")
    .map(resource => resource.id);
  const equipmentNodeKeys = input.nodes
    .filter(node => node.type === "equipment")
    .map(node => node.nodeKey);

  return {
    schemaVersion: BIOVIEW_SCHEMA_VERSION,
    kind: "ExecutionLayoutSnapshot",
    sourceTemplate: input.sourceTemplate,
    domainPack:
      !input.spec && input.cloningLayoutPlan
        ? "molecular-cloning@1.0.0"
        : requestedSpec.domainPack,
    compiler: BIOVIEW_COMPILER,
    rendererBundle: BIOVIEW_RENDERER_BUNDLE,
    readiness: {
      level: usedFallback ? "fallback" : isPartial ? "partial" : "complete",
      score: usedFallback ? 60 : isPartial ? 85 : 100,
      issues,
    },
    inputContract: {
      nodeCount: input.nodes.length,
      edgeCount: input.edgeCount,
      resourceCount: input.resources.length,
      sampleCount: sampleResourceIds.length,
      materialCount: materialResourceIds.length,
      equipmentNodeCount: equipmentNodeKeys.length,
      ...(input.samplePlatePlans
        ? { samplePlatePlanCount: samplePlatePlans.length }
        : {}),
    },
    views,
    semanticBindings,
    bindings: {
      sampleResourceIds,
      materialResourceIds,
      equipmentNodeKeys,
      cloningLayoutPlanId: input.cloningLayoutPlan?.id ?? null,
      ...(input.samplePlatePlans
        ? { samplePlatePlanIds: samplePlatePlans.map(plan => plan.id) }
        : {}),
    },
    provenance: {
      generatedAt: input.generatedAt,
      workflowId: input.workflowId,
      workflowUpdatedAt: input.workflowUpdatedAt,
      visualizationSpecHash: input.visualizationSpecHash,
      cloningLayoutSnapshotHash: input.cloningLayoutPlan?.snapshotHash ?? null,
      ...(input.samplePlatePlans
        ? {
            samplePlateSnapshotHashes: samplePlatePlans.map(
              plan => plan.snapshotHash
            ),
          }
        : {}),
    },
  };
}

export function freezeBioViewExecutionSnapshot(
  content: BioViewExecutionSnapshotContent,
  sha256Digest: string
): BioViewExecutionSnapshot {
  return bioViewExecutionSnapshotSchema.parse({
    ...content,
    snapshotHash: `sha256:${sha256Digest}`,
  });
}

export function bioViewSnapshotContent(
  snapshot: BioViewExecutionSnapshot
): BioViewExecutionSnapshotContent {
  const content: Record<string, unknown> = { ...snapshot };
  delete content.snapshotHash;
  return bioViewExecutionSnapshotCoreSchema.parse(content);
}
