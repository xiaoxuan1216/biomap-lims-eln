import { expect, it } from "vitest";
import { settleExecutionGraph, type ExecutionNode } from "./runExecution";
it("skips the unselected branch, propagates exclusions and releases a merged successor", () => {
  const nodes: ExecutionNode[] = [
    { nodeKey: "decision", type: "decision", status: "completed" },
    { nodeKey: "yes", type: "manual", status: "completed" },
    { nodeKey: "no", type: "manual", status: "pending" },
    { nodeKey: "no_child", type: "manual", status: "pending" },
    { nodeKey: "merge", type: "data", status: "pending" },
  ];
  const edges = [{ sourceKey: "decision", targetKey: "yes", sourceHandle: "yes" }, { sourceKey: "decision", targetKey: "no", sourceHandle: "no" }, { sourceKey: "no", targetKey: "no_child" }, { sourceKey: "yes", targetKey: "merge" }, { sourceKey: "no_child", targetKey: "merge" }];
  const settled = settleExecutionGraph(nodes, edges, { decision: "yes" });
  expect(settled.skipped).toEqual(["no", "no_child"]);
  expect(settled.started).toEqual(["merge"]);
  expect(() => settleExecutionGraph(nodes, edges, {})).toThrow(/分支结论/);
});
it("waits for all active parallel predecessors and never skips an unresolved path", () => {
  expect(settleExecutionGraph([{ nodeKey: "a", type: "manual", status: "completed" }, { nodeKey: "b", type: "manual", status: "running" }, { nodeKey: "c", type: "data", status: "pending" }], [{ sourceKey: "a", targetKey: "c" }, { sourceKey: "b", targetKey: "c" }], {}).status.get("c")).toBe("pending");
});
