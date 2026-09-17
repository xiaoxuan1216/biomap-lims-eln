import { describe, expect, it } from "vitest";
import {
  buildLabRunDataFlow,
  createLabRunInputSchema,
  readinessSummary,
  suggestedResourceRole,
  terminalRunStatus,
  validateRunGraph,
  type LabRunDataFlowInput,
} from "./labRun";
import { frozenCloningTargetBindingsAreValid } from "../api/labRunRouter";

const valid = {
  workflowId: 21,
  name: "BLI batch 01",
  executionMode: "simulation" as const,
  scheduledStart: new Date("2026-09-10T01:00:00Z"),
  scheduledEnd: new Date("2026-09-10T03:00:00Z"),
  resources: [{ sampleId: 1, role: "sample" as const, amount: 1 }],
  nodeBindings: [{ nodeKey: "read", equipmentId: 38, params: { cycles: 3, simulation: true } }],
  idempotencyKey: "lab-run:test:01",
};

describe("lab run contract", () => {
  it("accepts a complete run setup", () => {
    expect(createLabRunInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an optional cloning layout plan reference and rejects invalid ids", () => {
    expect(createLabRunInputSchema.safeParse({ ...valid, cloningLayoutPlanId: 3 }).success).toBe(true);
    expect(createLabRunInputSchema.safeParse({ ...valid, cloningLayoutPlanId: null }).success).toBe(true);
    expect(createLabRunInputSchema.safeParse({ ...valid, cloningLayoutPlanId: 0 }).success).toBe(false);
    expect(createLabRunInputSchema.safeParse({ ...valid, cloningLayoutPlanId: 1.5 }).success).toBe(false);
  });

  it("validates ordered cloning target bindings against frozen sample identities", () => {
    const resources = [
      { id: 11, role: "sample", sku: "SMP-011", name: "Target A", type: "plasmid" },
      { id: 99, role: "material", sku: "MAT-099", name: "PCR Mix", type: "reagent" },
      { id: 12, role: "sample", sku: "SMP-012", name: "Target B", type: "plasmid" },
    ];
    const bindings = [
      { target: 1, sampleId: 11, sku: "SMP-011", name: "Target A", type: "plasmid" },
      { target: 2, sampleId: 12, sku: "SMP-012", name: "Target B", type: "plasmid" },
    ];

    expect(frozenCloningTargetBindingsAreValid(2, bindings, resources)).toBe(true);
    expect(frozenCloningTargetBindingsAreValid(2, undefined, resources.slice(0, 1))).toBe(true);
    expect(frozenCloningTargetBindingsAreValid(2, bindings.slice(0, 1), resources)).toBe(false);
    expect(frozenCloningTargetBindingsAreValid(2, [bindings[0], { ...bindings[1], target: 1 }], resources)).toBe(false);
    expect(frozenCloningTargetBindingsAreValid(2, [bindings[1], bindings[0]], resources)).toBe(false);
    expect(frozenCloningTargetBindingsAreValid(2, [bindings[0], { ...bindings[1], sampleId: 11 }], resources)).toBe(false);
    expect(frozenCloningTargetBindingsAreValid(2, [bindings[0], { ...bindings[1], sku: "SMP-WRONG" }], resources)).toBe(false);
  });

  it("requires an input sample and a valid schedule", () => {
    const parsed = createLabRunInputSchema.safeParse({
      ...valid,
      scheduledEnd: valid.scheduledStart,
      resources: [{ sampleId: 1, role: "material", amount: 1 }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain("结束时间必须晚于开始时间");
      expect(parsed.error.issues.map((issue) => issue.message)).toContain("至少选择一个实验样本");
    }
  });

  it("prevents duplicate resource and node bindings", () => {
    const parsed = createLabRunInputSchema.safeParse({
      ...valid,
      resources: [...valid.resources, ...valid.resources],
      nodeBindings: [...valid.nodeBindings, ...valid.nodeBindings],
    });
    expect(parsed.success).toBe(false);
  });

  it("suggests inventory roles without changing the user's final choice", () => {
    expect(suggestedResourceRole("enzyme")).toBe("material");
    expect(suggestedResourceRole("antibody")).toBe("sample");
  });

  it("summarizes readiness blockers and warnings", () => {
    expect(
      readinessSummary([
        { code: "sample_request", level: "blocking", label: "待领料" },
        { code: "schedule", level: "warning", label: "计划时间已过" },
      ]),
    ).toEqual({ ready: false, blocking: 1, warnings: 1 });
  });

  it("validates the frozen graph and returns a stable topological order", () => {
    const validGraph = validateRunGraph(
      [{ nodeKey: "a" }, { nodeKey: "b" }, { nodeKey: "c" }, { nodeKey: "d" }],
      [
        { sourceKey: "a", targetKey: "c" },
        { sourceKey: "b", targetKey: "c" },
        { sourceKey: "c", targetKey: "d" },
      ],
    );
    expect(validGraph).toEqual({ valid: true, order: ["a", "b", "c", "d"], error: null });

    expect(validateRunGraph([], [])).toMatchObject({ valid: false, order: [] });
    expect(validateRunGraph([{ nodeKey: "a" }, { nodeKey: "a" }], [])).toMatchObject({ valid: false, order: [] });
    expect(
      validateRunGraph([{ nodeKey: "a" }], [{ sourceKey: "missing", targetKey: "a" }]),
    ).toMatchObject({ valid: false, order: [] });
    expect(
      validateRunGraph(
        [{ nodeKey: "a" }, { nodeKey: "b" }],
        [{ sourceKey: "a", targetKey: "b" }, { sourceKey: "b", targetKey: "a" }],
      ),
    ).toMatchObject({ valid: false, order: [] });
  });

  it("gives failed nodes precedence over completion", () => {
    expect(terminalRunStatus([])).toBeNull();
    expect(terminalRunStatus(["pending", "completed"])).toBeNull();
    expect(terminalRunStatus(["running", "completed"])).toBeNull();
    expect(terminalRunStatus(["completed", "skipped"])).toBe("completed");
    expect(terminalRunStatus(["failed", "completed"])).toBe("failed");
    expect(terminalRunStatus(["failed", "running"])).toBe("failed");
    expect(terminalRunStatus(["failed", "pending"])).toBe("failed");
  });

  it("projects persisted Run facts into a Mosaic data flow without inventing results", () => {
    const input: LabRunDataFlowInput = {
      run: {
        id: 7,
        runNo: "RUN-007",
        name: "BLI batch 01",
        status: "running",
        executionMode: "edge",
        workflowId: 21,
        workflowName: "BLI workflow",
        snapshotHash: "abc123",
        sampleRequestId: 31,
        requestNo: "REQ-031",
        requestStatus: "in_fulfillment",
      },
      integrityValid: true,
      workflowEdges: [{ sourceKey: "prepare", targetKey: "read" }],
      resources: [{
        id: 71,
        sampleId: 101,
        role: "sample",
        nodeKey: "prepare",
        amount: 1,
        unit: "管",
        sku: "SMP-0101",
        name: "HER2 sample",
        type: "protein",
        frozenLocationId: 9,
        frozenBoxRow: 1,
        frozenBoxCol: 2,
        currentLocationId: 10,
        currentLocationName: "BLI 上样架",
        currentLocationType: "rack",
        currentBoxRow: null,
        currentBoxCol: null,
        sampleRequestItemId: 41,
        requestItemStatus: "in_progress",
        inventoryReservationId: 51,
        reservationStatus: "active",
        fulfillmentTaskId: 61,
        fulfillmentStatus: "running",
      }],
      nodes: [
        { id: 81, nodeKey: "prepare", type: "manual", label: "配样", status: "completed", equipmentId: null, equipmentName: null, driverKey: null, driverVersion: null },
        { id: 82, nodeKey: "read", type: "equipment", label: "BLI 读取", status: "running", equipmentId: 38, equipmentName: "Octet RH96", driverKey: "octet", driverVersion: "1.0.0" },
      ],
      bookings: [{ id: 91, equipmentId: 38, status: "active", startTime: new Date("2026-09-10T01:00:00Z"), endTime: new Date("2026-09-10T03:00:00Z") }],
      lineageNodes: [{ kind: "sample", id: 100, title: "HER2 parent", subtitle: "SMP-0100 · protein" }],
      lineageEdges: [{ id: 111, childKind: "sample", childId: 101, parentKind: "sample", parentId: 100, relation: "aliquoted_from" }],
    };
    const projection = buildLabRunDataFlow(input);
    expect(projection.phases.map((phase) => [phase.id, phase.status])).toEqual([
      ["plan", "locked"],
      ["materials", "in_fulfillment"],
      ["execution", "running"],
      ["results", "not_recorded"],
    ]);
    expect(projection.nodes.find((node) => node.id === "resource:71")).toMatchObject({
      phase: "materials",
      status: "running",
      source: "lab_run_resource",
    });
    expect(projection.nodes.find((node) => node.id === "run-node:read")?.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "equipment_booking", ref: "equipment-booking:91", status: "active" })]),
    );
    expect(projection.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "lineage:sample:100", target: "resource:71", relation: "aliquoted_from", sourceType: "sample_lineage" }),
      expect.objectContaining({ source: "run-node:prepare", target: "run-node:read", relation: "precedes", sourceType: "run_plan_snapshot" }),
    ]));
    expect(projection.resultState).toEqual({ status: "not_recorded", source: "none", evidence: [] });
    expect(projection.nodes.some((node) => node.phase === "results")).toBe(false);

    const conservativeProjection = buildLabRunDataFlow({
      ...input,
      workflowEdges: [...input.workflowEdges, { sourceKey: "read", targetKey: "missing" }],
      resources: [{
        ...input.resources[0],
        nodeKey: null,
        currentLocationId: null,
        currentLocationName: null,
        currentLocationType: null,
      }],
      lineageEdges: [
        ...input.lineageEdges,
        { id: 112, childKind: "sample", childId: 101, parentKind: "sequence", parentId: 999, relation: "derived_from" },
      ],
    });
    const projectedIds = new Set(conservativeProjection.nodes.map((node) => node.id));
    expect(conservativeProjection.edges.some((edge) => edge.relation === "feeds")).toBe(false);
    expect(conservativeProjection.edges.every((edge) => projectedIds.has(edge.source) && projectedIds.has(edge.target))).toBe(true);
    expect(
      conservativeProjection.nodes
        .find((node) => node.id === "resource:71")
        ?.evidence.some((item) => item.source === "storage_location"),
    ).toBe(false);
  });
});
