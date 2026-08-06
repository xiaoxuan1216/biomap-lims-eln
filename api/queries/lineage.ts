/**
 * 样本全生命周期追溯（共享实现）：自给定节点向上（祖先方向）遍历谱系 DAG。
 * 同时被 tRPC sampleRouter.lineage 与开放 REST API /api/v1/samples/:id/lineage 使用。
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { lineageEdges, samples, sequenceFeatures, sequences } from "@db/schema";

export type LineageNode = Record<string, unknown>;
export interface LineageEdgeOut {
  childKey: string;
  parentKey: string;
  relation: string;
  note: string | null;
}
export interface LineageResult {
  root: string;
  nodes: LineageNode[];
  edges: LineageEdgeOut[];
}

export async function buildLineage(
  kind: "sample" | "sequence",
  id: number,
): Promise<LineageResult | null> {
  const db = getDb();
  const key = (k: string, i: number) => `${k}:${i}`;
  const visited = new Set<string>();
  const nodeMap = new Map<string, LineageNode>();
  const edgesOut: LineageEdgeOut[] = [];

  const loadNode = async (k: "sample" | "sequence", nid: number, depth: number): Promise<void> => {
    const kk = key(k, nid);
    if (visited.has(kk) || depth > 8) return;
    visited.add(kk);
    if (k === "sample") {
      const s = await db.query.samples.findFirst({ where: eq(samples.id, nid) });
      if (!s) return;
      let seq: LineageNode | null = null;
      if (s.sequenceId) {
        const q = await db.query.sequences.findFirst({ where: eq(sequences.id, s.sequenceId) });
        if (q) {
          const feats = await db.select().from(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, q.id));
          seq = {
            id: q.id, name: q.name, type: q.type, len: q.sequence.length,
            pdbId: q.pdbId, description: q.description, text: q.sequence,
            features: feats.map((f) => ({ name: f.name, type: f.type, start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note })),
          };
        }
      }
      nodeMap.set(kk, {
        key: kk, kind: k, id: nid, depth,
        name: s.name, sampleType: s.type, sku: s.sku,
        quantity: s.quantity, unit: s.unit, expiryDate: s.expiryDate,
        sequence: seq,
      });
    } else {
      const q = await db.query.sequences.findFirst({ where: eq(sequences.id, nid) });
      if (!q) return;
      const feats = await db.select().from(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, nid));
      nodeMap.set(kk, {
        key: kk, kind: k, id: nid, depth,
        name: q.name, seqType: q.type, len: q.sequence.length,
        pdbId: q.pdbId, description: q.description, text: q.sequence,
        features: feats.map((f) => ({ name: f.name, type: f.type, start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note })),
      });
    }
    /* 继续向上 */
    const ups = await db
      .select()
      .from(lineageEdges)
      .where(and(eq(lineageEdges.childKind, k), eq(lineageEdges.childId, nid)));
    for (const e of ups) {
      edgesOut.push({ childKey: kk, parentKey: key(e.parentKind, e.parentId), relation: e.relation, note: e.note });
      await loadNode(e.parentKind as "sample" | "sequence", e.parentId, depth + 1);
    }
    /* 样本的分子定义序列也作为上游节点挂出 */
    if (k === "sample") {
      const node = nodeMap.get(kk) as { sequence?: { id: number } } | undefined;
      if (node?.sequence) {
        edgesOut.push({ childKey: kk, parentKey: key("sequence", node.sequence.id), relation: "defined_by", note: null });
        await loadNode("sequence", node.sequence.id, depth + 1);
      }
    }
  };

  await loadNode(kind, id, 0);
  if (!visited.size) return null;
  return { root: key(kind, id), nodes: [...nodeMap.values()], edges: edgesOut };
}
