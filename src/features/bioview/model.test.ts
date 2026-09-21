import { describe, expect, it } from "vitest";
import {
  buildCloningPlan,
  DEFAULT_CLONING_CONFIG,
} from "@contracts/cloningLayout";
import { bioViewRendererRefSchema } from "@contracts/bioView";
import {
  BIOVIEW_RENDERER_REFS,
  controlledRendererRefs,
  normalizeBioView,
  orderedBioViewNodes,
} from "./model";

describe("BioView frontend model", () => {
  it("keeps the controlled frontend registry aligned with the backend contract", () => {
    expect(BIOVIEW_RENDERER_REFS).toEqual(bioViewRendererRefSchema.options);
  });

  it("combines the nested BioView snapshot with authoritative outer Run data", () => {
    const view = normalizeBioView({
      manifest: {
        schemaVersion: "1.0",
        workflow: { name: "Protein assay" },
        method: { id: 31, version: 4 },
        nodes: [
          {
            nodeKey: "read",
            label: "Read plate",
            type: "equipment",
            status: "pending",
          },
          {
            nodeKey: "bind",
            label: "Bind samples",
            type: "manual",
            status: "completed",
          },
        ],
        edges: [{ sourceKey: "bind", targetKey: "read" }],
        resources: [
          {
            id: 11,
            sku: "SMP-11",
            name: "Sample 11",
            role: "sample",
            plannedAmount: 10,
            unit: "uL",
          },
          {
            id: 12,
            sku: "MAT-12",
            name: "Buffer",
            role: "material",
            plannedAmount: 20,
            unit: "uL",
          },
        ],
        executionNodes: [{ nodeKey: "read", parameters: { wavelength: 450 } }],
        bioView: {
          schemaVersion: "biomap.view/v1",
          kind: "ExecutionLayoutSnapshot",
          sourceTemplate: "WF-ASSAY@3",
          domainPack: "assay@1",
          bindings: { sampleResourceIds: [11], materialResourceIds: [12] },
          readiness: { score: 92, label: "ready" },
          views: [
            { id: "overview", rendererRef: "generic-overview@1" },
            { id: "timeline", rendererRef: "operation-timeline@1" },
          ],
        },
      },
    });

    expect(view.mode).toBe("run");
    expect(view.sourceTemplate).toBe("WF-ASSAY@3");
    expect(view.methodReleaseId).toBe(31);
    expect(view.methodReleaseVersion).toBe(4);
    expect(view.nodes.map(node => node.key)).toEqual(["read", "bind"]);
    expect(view.edges).toHaveLength(1);
    expect(view.samples.map(resource => resource.id)).toEqual(["11"]);
    expect(view.materials.map(resource => resource.id)).toEqual(["12"]);
    expect(controlledRendererRefs(view)).toEqual([
      "generic-overview@1",
      "operation-timeline@1",
    ]);
  });

  it("never resolves an unregistered renderer reference", () => {
    const view = normalizeBioView({
      manifest: {
        kind: "VisualizationBlueprint",
        views: [
          { rendererRef: "generic-overview@1" },
          { rendererRef: "https://example.invalid/renderer.js" },
          { rendererRef: "eval(alert(1))" },
        ],
      },
      nodes: [{ nodeKey: "safe", label: "Safe node" }],
    });

    expect(controlledRendererRefs(view)).toEqual(["generic-overview@1"]);
    expect(view.unknownRendererRefs).toEqual([
      "https://example.invalid/renderer.js",
      "eval(alert(1))",
    ]);
  });

  it("returns a usable generic model for a missing or malformed manifest", () => {
    const live = normalizeBioView({
      nodes: [{ nodeKey: "n1", label: "Live node" }],
      edges: [],
      mode: "design",
    });
    const malformed = normalizeBioView({ manifest: "{not-json" });

    expect(live.manifestState).toBe("missing");
    expect(live.nodes[0]?.label).toBe("Live node");
    expect(malformed.manifestState).toBe("invalid");
    expect(controlledRendererRefs(malformed)).toEqual([]);
  });

  it("treats an explicit null embedded BioView as a legacy Run without a frozen manifest", () => {
    const legacyRun = normalizeBioView({
      manifest: {
        bioView: null,
        workflow: { id: 42, name: "Legacy workflow" },
      },
      nodes: [{ nodeKey: "legacy", label: "Frozen legacy node" }],
      mode: "run",
    });

    expect(legacyRun.manifestState).toBe("missing");
    expect(legacyRun.mode).toBe("run");
    expect(legacyRun.workflowId).toBe(42);
    expect(legacyRun.nodes[0]?.label).toBe("Frozen legacy node");
    expect(controlledRendererRefs(legacyRun)).toEqual([]);
  });

  it("maps Run projections back to LIMS sample and equipment objects", () => {
    const view = normalizeBioView({
      manifest: {
        bioView: {
          kind: "ExecutionLayoutSnapshot",
          provenance: { workflowId: 42 },
          views: [{ rendererRef: "generic-overview@1" }],
        },
      },
      nodes: [
        {
          nodeKey: "reader",
          label: "Read plate",
          type: "equipment",
          equipmentId: 73,
          equipmentName: "EnVision",
          driverKey: "plate-reader",
          driverVersion: "2.0.0",
          parameterSnapshot: JSON.stringify({
            effectiveValues: { wavelength: 450 },
          }),
        },
      ],
      samples: [
        {
          id: 501,
          sampleId: 101,
          sku: "SMP-101",
          sampleName: "AZ plate sample",
          sampleType: "protein",
          currentLocationName: "Automation buffer",
          currentBoxRow: 0,
          currentBoxCol: 1,
          role: "sample",
        },
      ],
      mode: "run",
    });

    expect(view.workflowId).toBe(42);
    expect(view.nodes[0]).toMatchObject({
      equipmentId: "73",
      equipmentName: "EnVision",
      driverKey: "plate-reader",
      driverVersion: "2.0.0",
    });
    expect(view.nodes[0]?.parameters).toContain("wavelength");
    expect(view.samples[0]).toMatchObject({
      id: "501",
      sampleId: "101",
      name: "AZ plate sample",
      type: "protein",
      position: "Automation buffer:A2",
    });
  });

  it("unwraps an existing frozen molecular cloning plan", () => {
    const plan = buildCloningPlan(DEFAULT_CLONING_CONFIG, "recommended");
    const view = normalizeBioView({
      manifest: {
        bioView: {
          kind: "ExecutionLayoutSnapshot",
          views: [{ rendererRef: "cloning-plate-flow@1" }],
        },
        cloningLayoutPlan: {
          plan,
          targetBindings: [
            {
              target: 1,
              sampleId: 91,
              sku: "SMP-91",
              name: "Template 91",
              type: "DNA",
            },
          ],
        },
      },
    });

    expect(view.cloningPlan).toBe(plan);
    expect(view.targetBindings[0]?.sampleId).toBe(91);
  });

  it("orders acyclic graphs and preserves all nodes when the input contains a cycle", () => {
    const graph = normalizeBioView({
      nodes: [
        { nodeKey: "third", label: "Third" },
        { nodeKey: "first", label: "First" },
        { nodeKey: "second", label: "Second" },
      ],
      edges: [
        { sourceKey: "first", targetKey: "second" },
        { sourceKey: "second", targetKey: "third" },
      ],
    });
    expect(
      orderedBioViewNodes(graph.nodes, graph.edges).map(node => node.key)
    ).toEqual(["first", "second", "third"]);

    const cyclic = orderedBioViewNodes(graph.nodes, [
      { id: "1", source: "first", target: "second" },
      { id: "2", source: "second", target: "first" },
    ]);
    expect(new Set(cyclic.map(node => node.key))).toEqual(
      new Set(["first", "second", "third"])
    );
  });
});
