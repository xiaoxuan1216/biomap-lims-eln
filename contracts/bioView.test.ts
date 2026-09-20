import { describe, expect, it } from "vitest";
import {
  bioViewExecutionSnapshotSchema,
  bioViewVisualizationSpecSchema,
  compileBioViewExecutionSnapshot,
  defaultBioViewVisualizationSpec,
  freezeBioViewExecutionSnapshot,
} from "./bioView";

const baseInput = {
  spec: defaultBioViewVisualizationSpec(),
  specState: "valid" as const,
  sourceTemplate: "17@2026-09-17T01:00:00.000Z",
  workflowId: 17,
  workflowUpdatedAt: "2026-09-17T01:00:00.000Z",
  nodes: [
    { nodeKey: "prepare", type: "manual" },
    { nodeKey: "read", type: "equipment" },
  ],
  edgeCount: 1,
  resources: [
    { id: 101, role: "sample" },
    { id: 102, role: "material" },
    { id: 103, role: "control" },
  ],
  cloningLayoutPlan: null,
  generatedAt: "2026-09-17T02:00:00.000Z",
  visualizationSpecHash: `sha256:${"a".repeat(64)}`,
};

describe("BioView contract", () => {
  it("accepts only governed renderer references and unique view ids", () => {
    const spec = defaultBioViewVisualizationSpec();
    expect(bioViewVisualizationSpecSchema.safeParse(spec).success).toBe(true);
    expect(
      bioViewVisualizationSpecSchema.safeParse({
        ...spec,
        views: [
          { ...spec.views[0], rendererRef: "https://example.test/plugin.js" },
        ],
      }).success
    ).toBe(false);
    expect(
      bioViewVisualizationSpecSchema.safeParse({
        ...spec,
        views: [spec.views[0], { ...spec.views[0] }],
      }).success
    ).toBe(false);
    expect(
      bioViewVisualizationSpecSchema.safeParse({
        ...spec,
        views: [
          spec.views[0],
          { ...spec.views[0], id: "another-overview" },
        ],
      }).success
    ).toBe(false);
    expect(
      bioViewVisualizationSpecSchema.safeParse({
        ...spec,
        views: [
          {
            id: "plates",
            title: "孔板",
            rendererRef: "sample-plate-layout@1",
            scope: "run",
            binding: "resources",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      bioViewVisualizationSpecSchema.safeParse({
        ...spec,
        views: [
          {
            id: "evidence",
            title: "证据链",
            rendererRef: "run-data-flow@1",
            scope: "run",
            binding: "events",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("compiles a generic immutable run view from workflow and resource facts", () => {
    const content = compileBioViewExecutionSnapshot(baseInput);
    expect(content.readiness).toEqual({
      level: "complete",
      score: 100,
      issues: [],
    });
    expect(content.inputContract).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      resourceCount: 3,
      sampleCount: 2,
      materialCount: 1,
      equipmentNodeCount: 1,
    });
    expect(content.bindings).toEqual({
      sampleResourceIds: [101, 103],
      materialResourceIds: [102],
      equipmentNodeKeys: ["read"],
      cloningLayoutPlanId: null,
    });
    const frozen = freezeBioViewExecutionSnapshot(content, "b".repeat(64));
    expect(bioViewExecutionSnapshotSchema.safeParse(frozen).success).toBe(true);
  });

  it("binds generic sample plate snapshots without copying mutable plate content", () => {
    const content = compileBioViewExecutionSnapshot({
      ...baseInput,
      samplePlatePlans: [
        { id: 201, snapshotHash: "c".repeat(64) },
        { id: 202, snapshotHash: "d".repeat(64) },
      ],
    });

    expect(content.views[0]).toMatchObject({
      rendererRef: "sample-plate-layout@1",
      binding: "sample-plates",
    });
    expect(content.inputContract.samplePlatePlanCount).toBe(2);
    expect(content.bindings.samplePlatePlanIds).toEqual([201, 202]);
    expect(content.provenance.samplePlateSnapshotHashes).toEqual([
      "c".repeat(64),
      "d".repeat(64),
    ]);
  });

  it("preserves every unique governed renderer in a Blueprint", () => {
    const uniqueViewSpec = {
      ...defaultBioViewVisualizationSpec(),
      views: [
        ...defaultBioViewVisualizationSpec().views,
        { id: "cloning", title: "克隆孔板", rendererRef: "cloning-plate-flow@1" as const, scope: "run" as const, binding: "cloning-layout" as const },
        { id: "plates", title: "通用孔板", rendererRef: "sample-plate-layout@1" as const, scope: "run" as const, binding: "sample-plates" as const },
        { id: "lineage", title: "谱系", rendererRef: "sample-lineage@1" as const, scope: "run" as const, binding: "resources" as const },
        { id: "samples", title: "样本", rendererRef: "sample-table@1" as const, scope: "run" as const, binding: "resources" as const },
        { id: "materials", title: "物料", rendererRef: "material-table@1" as const, scope: "run" as const, binding: "resources" as const },
        { id: "parameters", title: "参数", rendererRef: "parameter-summary@1" as const, scope: "run" as const, binding: "parameters" as const },
      ],
    };
    expect(
      bioViewVisualizationSpecSchema.safeParse(uniqueViewSpec).success
    ).toBe(true);

    const content = compileBioViewExecutionSnapshot({
      ...baseInput,
      spec: uniqueViewSpec,
      cloningLayoutPlan: { id: 44, snapshotHash: "b".repeat(64) },
      samplePlatePlans: [{ id: 201, snapshotHash: "c".repeat(64) }],
    });
    expect(content.views).toHaveLength(9);
    expect(
      content.views.some(view => view.rendererRef === "sample-plate-layout@1")
    ).toBe(true);
    expect(
      content.views.some(view => view.rendererRef === "run-data-flow@1")
    ).toBe(true);

    const frozen = freezeBioViewExecutionSnapshot(content, "e".repeat(64));
    expect(bioViewExecutionSnapshotSchema.safeParse(frozen).success).toBe(true);
  });

  it("assigns collision-safe ids to system-managed Run overlays", () => {
    const baseView = defaultBioViewVisualizationSpec().views[0];
    const timelineView = defaultBioViewVisualizationSpec().views.find(
      view => view.rendererRef === "operation-timeline@1"
    )!;
    const content = compileBioViewExecutionSnapshot({
      ...baseInput,
      spec: {
        ...defaultBioViewVisualizationSpec(),
        views: [
          { ...baseView, id: "sample-plates" },
          { ...timelineView, id: "run-data-flow" },
        ],
      },
      samplePlatePlans: [{ id: 201, snapshotHash: "c".repeat(64) }],
    });

    const ids = content.views.map(view => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "sample-plates",
        "sample-plates-2",
        "run-data-flow",
        "run-data-flow-2",
      ])
    );
  });

  it("automatically adds the cloning plate renderer for legacy workflows", () => {
    const content = compileBioViewExecutionSnapshot({
      ...baseInput,
      spec: null,
      specState: "missing",
      cloningLayoutPlan: { id: 44, snapshotHash: "c".repeat(64) },
    });
    expect(content.domainPack).toBe("molecular-cloning@1.0.0");
    expect(content.views[0]).toMatchObject({
      rendererRef: "cloning-plate-flow@1",
      binding: "cloning-layout",
    });
    expect(
      content.views.some(view => view.rendererRef === "generic-overview@1")
    ).toBe(true);
    expect(content.bindings.cloningLayoutPlanId).toBe(44);
    expect(content.readiness.level).toBe("fallback");
  });

  it("drops an unavailable specialized view and never produces a blank layout", () => {
    const cloningOnly = {
      ...defaultBioViewVisualizationSpec(),
      domainPack: "molecular-cloning@1.0.0",
      views: [
        {
          id: "plates",
          title: "孔板",
          rendererRef: "cloning-plate-flow@1" as const,
          scope: "run" as const,
          binding: "cloning-layout" as const,
        },
      ],
    };
    const content = compileBioViewExecutionSnapshot({
      ...baseInput,
      spec: cloningOnly,
    });
    expect(content.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rendererRef: "generic-overview@1" }),
        expect.objectContaining({ rendererRef: "run-data-flow@1" }),
      ])
    );
    expect(content.readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "cloning-layout-missing" }),
        expect.objectContaining({ code: "renderer-fallback-applied" }),
      ])
    );
  });
});
