import { useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { linearMethodOrder } from "@contracts/linearMethod";
import { toast } from "sonner";

type Workflow = inferRouterOutputs<AppRouter>["workflow"]["byId"];
type Node = inferRouterInputs<AppRouter>["workflow"]["saveGraph"]["nodes"][number];
export default function MethodStepListEditor({ workflow, disabled, refresh }: { workflow: Workflow; disabled: boolean; refresh: () => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const order = linearMethodOrder(workflow.nodes, workflow.edges);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [removed, setRemoved] = useState<Node[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"manual" | "equipment" | "timer">("manual");
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const save = trpc.workflow.saveGraph.useMutation({ onSuccess: async () => { setDirty(false); setOpen(false); await refresh(); toast.success(t("步骤列表已保存，请核对执行要求后提交复核")); }, onError: error => toast.error(t(error.message)) });
  if (!order) return <p className="text-xs text-muted-foreground">{t("此方法包含分支、并行或子方法，请在高级流程编辑器中调整结构。")}</p>;
  const change = (next: Node[]) => { setNodes(next); setDirty(true); };
  const shift = (index: number, direction: -1 | 1) => { const next = [...nodes]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change(next); };
  const persist = () => save.mutate({ id: workflow.id, expectedGraphHash: workflow.graphHash, nodes: nodes.map((node, index) => ({ ...node, posX: index * 260, posY: 0, label: node.label.trim() })), edges: nodes.slice(1).map((node, index) => {
    const existing = workflow.edges.find(edge => edge.sourceKey === nodes[index].nodeKey && edge.targetKey === node.nodeKey);
    return existing ?? { edgeKey: `e_${crypto.randomUUID().slice(0, 16)}`, sourceKey: nodes[index].nodeKey, targetKey: node.nodeKey };
  }) });
  return <><Button variant="outline" disabled={disabled} onClick={() => { setNodes(order.map(key => ({ ...workflow.nodes.find(node => node.nodeKey === key)! }))); setRemoved([]); setNewLabel(""); setDirty(false); setDiscard(false); setOpen(true); }}>{t("编辑步骤列表")}</Button>
    <Dialog open={open} onOpenChange={value => { if (save.isPending) return; if (!value && dirty) setDiscard(true); else setOpen(value); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("编辑步骤列表")}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{t("按实验顺序排列步骤。保存到工作副本，已发布方法和历史实验保持原版本。")}</p>
      <fieldset disabled={save.isPending} className="space-y-3">{nodes.map((node, index) => <div className="rounded-lg border p-3" key={node.nodeKey}><Label className="block leading-relaxed">{t("步骤 {n}", { n: index + 1 })}<Input className="mt-1" maxLength={255} value={node.label} onChange={e => change(nodes.map(item => item.nodeKey === node.nodeKey ? { ...item, label: e.target.value } : item))}/></Label><div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={index === 0} onClick={() => shift(index, -1)}>{t("上移")}</Button><Button size="sm" variant="ghost" disabled={index === nodes.length - 1} onClick={() => shift(index, 1)}>{t("下移")}</Button><Button size="sm" variant="ghost" disabled={nodes.length === 1} onClick={() => { setRemoved([...removed, node]); change(nodes.filter(item => item.nodeKey !== node.nodeKey)); }}>{t("移除此步骤")}</Button></div></div>)}
      {removed.length > 0 && <div className="rounded border border-amber-200 p-3 text-sm"><p>{t("本次移除的步骤")}</p>{removed.map(node => <div key={node.nodeKey} className="flex items-center justify-between gap-2"><span>{node.label}</span><Button size="sm" variant="ghost" onClick={() => { setRemoved(removed.filter(item => item.nodeKey !== node.nodeKey)); change([...nodes, node]); }}>{t("恢复到末尾")}</Button></div>)}</div>}
      <div className="space-y-3 rounded-lg bg-slate-50 p-3"><Label className="block leading-relaxed">{t("新增步骤名称")}<Input className="mt-1" maxLength={255} value={newLabel} onChange={e => setNewLabel(e.target.value)}/></Label><div className="flex flex-wrap gap-2"><select aria-label={t("新增步骤类型")} className="rounded border p-2 text-sm" value={newType} onChange={e => setNewType(e.target.value as typeof newType)}><option value="manual">{t("人工操作")}</option><option value="equipment">{t("仪器操作")}</option><option value="timer">{t("等待步骤")}</option></select><Button size="sm" variant="outline" disabled={!newLabel.trim() || nodes.length >= 100} onClick={() => { change([...nodes, { nodeKey: `step_${crypto.randomUUID().slice(0, 16)}`, label: newLabel.trim(), type: newType, posX: nodes.length * 260, posY: 0 }]); setNewLabel(""); }}>{t("添加到末尾")}</Button></div></div></fieldset>
      {discard && <div role="alert" className="rounded border p-3 text-sm"><p>{t("步骤列表尚未保存")}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => setDiscard(false)}>{t("继续编辑")}</Button><Button size="sm" variant="ghost" onClick={() => { setDirty(false); setOpen(false); setDiscard(false); }}>{t("放弃本次列表修改")}</Button></div></div>}
      <DialogFooter><Button disabled={!dirty || save.isPending || !nodes.length || nodes.some(node => !node.label.trim())} onClick={persist}>{t("保存步骤列表")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
