import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { isNextMethodStage } from "@contracts/methodOutputs";
import { toast } from "sonner";

type Outputs = inferRouterOutputs<AppRouter>;
type Props = { run: Outputs["labRun"]["byId"]; data: Outputs["runExecution"]["details"]; owns: boolean; canPrepare: boolean; refresh: () => Promise<unknown>; uploadFile: (nodeKey: string, file?: File) => void; uploadDisabled: boolean };
export type OutputSnapshot = { sku: string; name: string; type: string; unit: string; locationName: string; sequenceId: number | null };
export function outputSnapshot(raw: string): OutputSnapshot { return JSON.parse(raw) as OutputSnapshot; }
const selectClass = "mt-1 block w-full rounded border bg-white p-2 text-sm";
export default function RunOutputs({ run, data, owns, canPrepare, refresh, uploadFile, uploadDisabled }: Props) {
 const { t, lang } = useI18n(), navigate = useNavigate();
 const locations = trpc.storage.tree.useQuery();
 const sequences = trpc.sequence.list.useQuery();
 const methods = trpc.workflow.list.useQuery();
 const [nodeKey, setNodeKey] = useState("");
 const [name, setName] = useState("");
 const [quantity, setQuantity] = useState("");
 const [antibodyId, setAntibodyId] = useState("");
 const [chain, setChain] = useState<"HC" | "LC" | "single" | "paired">("single");
 const [parents, setParents] = useState<number[]>([]);
 const [metadata, setMetadata] = useState<Record<string, string>>({});
 const [locationId, setLocationId] = useState("");
 const [boxRow, setBoxRow] = useState("");
 const [boxCol, setBoxCol] = useState("");
 const [sequenceId, setSequenceId] = useState("");
 const [evidenceId, setEvidenceId] = useState("");
 const [note, setNote] = useState("");
 const [nextMethod, setNextMethod] = useState("");
 const [amounts, setAmounts] = useState<Record<number, string>>({});
 const [handoffNote, setHandoffNote] = useState("");
 const register = trpc.runExecution.recordOutput.useMutation({ onSuccess: async () => { setName(""); setQuantity(""); setMetadata({}); setNote(""); await refresh(); toast.success(t("产物已登记，等待结果复核")); }, onError: error => toast.error(error.message) });
 const voidOutput = trpc.runExecution.voidOutput.useMutation({ onSuccess: async () => { setNote(""); await refresh(); }, onError: error => toast.error(error.message) });
 const next = trpc.runExecution.prepareNextStage.useMutation({ onSuccess: result => navigate(`/runs/new?workflowId=${result.workflowId}&draftId=${result.draftId}`), onError: error => toast.error(error.message) });
 const steps = run.nodes.filter(node => node.status === "completed" && run.method?.spec.nodes[node.nodeKey]?.produces);
 const selectedNode = steps.some(node => node.nodeKey === nodeKey) ? nodeKey : steps.at(-1)?.nodeKey ?? "";
 const rule = run.method?.spec.nodes[selectedNode]?.produces;
 const editable = owns && !data.execution?.paused && ["running", "completed"].includes(run.status) && !["review", "approved"].includes(data.execution?.resultState ?? "");
 const box = locations.data?.find(location => location.id === Number(locationId))?.type === "box";
 const candidates = methods.data?.filter(method => method.publishedRelease && !method.parentWorkflowId && isNextMethodStage(run.method?.spec.stage, method.publishedRelease.stage)) ?? [];
 const released = data.outputs.filter(output => output.status === "released");
 const selections = released.filter(output => Number(amounts[output.sampleId]) > 0).map(output => ({ sampleId: output.sampleId, amount: Number(amounts[output.sampleId]) }));
 const ready = rule && name.trim() && antibodyId.trim() && Number(quantity) > 0 && parents.length > 0 && locationId && evidenceId && note.trim() && (!rule.requiresSequence || sequenceId) && (!box || (Number(boxRow) > 0 && Number(boxCol) > 0)) && rule.requiredMetadata.every(field => metadata[field.key]?.trim());
 if (!steps.length && !data.outputs.length) return null;
 return <Card><CardHeader><CardTitle className="text-base">{t("本阶段产物与交接")}</CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-sm text-muted-foreground">{t("登记实际获得的产物并关联原始文件。复核通过后入库，可用于下一阶段。")}</p>
   {editable && rule && <details open={!data.outputs.some(output => output.status !== "voided")}><summary className="cursor-pointer font-medium">{t("登记本次获得的产物")}</summary><div className="mt-3 space-y-3 rounded-xl border bg-slate-50 p-4">
     <div className="grid gap-3 md:grid-cols-2">
       <Label>{t("产出步骤")}<select className={selectClass} value={selectedNode} onChange={e => { setNodeKey(e.target.value); setEvidenceId(""); setMetadata({}); }}>{steps.map(node => <option key={node.nodeKey} value={node.nodeKey}>{node.label}</option>)}</select></Label>
       <Label>{t("产物名称")}<Input value={name} onChange={e => setName(e.target.value)} placeholder={lang === "en" ? rule.labelEn || rule.label : rule.label}/></Label>
       <Label>{t("抗体或构建体编号")}<Input value={antibodyId} onChange={e => setAntibodyId(e.target.value)}/></Label>
       <Label>{t("链别")}<select className={selectClass} value={chain} onChange={e => setChain(e.target.value as typeof chain)}><option value="single">{t("单链或其他构型")}</option><option value="HC">{t("重链 HC")}</option><option value="LC">{t("轻链 LC")}</option><option value="paired">{t("重轻链配对")}</option></select></Label>
       <Label>{t("实际获得量")} · {rule.unit}<Input type="number" min="0.001" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)}/></Label>
       <Label>{t("实际储位")}<select className={selectClass} value={locationId} onChange={e => { setLocationId(e.target.value); setBoxRow(""); setBoxCol(""); }}><option value="">{t("选择储位")}</option>{locations.data?.map(location => <option key={location.id} value={location.id}>{location.name} {location.temperature}</option>)}</select></Label>
       {box && <><Label>{t("盒内行号")}<Input type="number" min="1" value={boxRow} onChange={e => setBoxRow(e.target.value)}/></Label><Label>{t("盒内列号")}<Input type="number" min="1" value={boxCol} onChange={e => setBoxCol(e.target.value)}/></Label></>}
       {(rule.requiresSequence || rule.type === "plasmid") && <Label>{t("构建体序列")}<select className={selectClass} value={sequenceId} onChange={e => setSequenceId(e.target.value)}><option value="">{t("选择已登记的序列")}</option>{sequences.data?.filter(sequence => sequence.type === "dna").map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></Label>}
       {rule.requiredMetadata.map(field => <Label key={field.key}>{lang === "en" ? field.labelEn || field.label : field.label}<Input value={metadata[field.key] ?? ""} onChange={e => setMetadata({ ...metadata, [field.key]: e.target.value })}/></Label>)}
       <Label>{t("产物原始文件")}<select className={selectClass} value={evidenceId} onChange={e => setEvidenceId(e.target.value)}><option value="">{t("选择原始文件")}</option>{data.evidence.filter(file => file.nodeKey === selectedNode).map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></Label>
     </div>
     <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("选择实际来源样本")}</legend>{run.resources.filter(resource => resource.role === "sample").map(resource => <label className="flex items-center gap-2 text-sm" key={resource.sampleId}><input type="checkbox" checked={parents.includes(resource.sampleId)} onChange={e => setParents(e.target.checked ? [...parents, resource.sampleId] : parents.filter(id => id !== resource.sampleId))}/>{resource.sku} · {resource.sampleName}</label>)}</fieldset>
     <Label className="block">{t("补充此步骤的原始文件")}<Input type="file" disabled={uploadDisabled} onChange={e => { uploadFile(selectedNode, e.target.files?.[0]); e.target.value = ""; }}/></Label>
     <Label className="block">{t("产物登记或作废说明")}<Textarea value={note} onChange={e => setNote(e.target.value)}/></Label>
     <Button disabled={!ready || register.isPending || voidOutput.isPending} onClick={() => register.mutate({ runId: run.id, expectedRevision: run.revision, idempotencyKey: crypto.randomUUID(), nodeKey: selectedNode, name, quantity: Number(quantity), antibodyId, chain, parentSampleIds: parents, metadata, locationId: Number(locationId), boxRow: box ? Number(boxRow) : undefined, boxCol: box ? Number(boxCol) : undefined, sequenceId: Number(sequenceId) || undefined, evidenceId: Number(evidenceId), note })}>{t("保存产物登记")}</Button>
   </div></details>}
   <div className="space-y-3">{data.outputs.map(output => { const snapshot = outputSnapshot(output.sampleSnapshot); return <div className="rounded-lg border p-3 text-sm" key={output.id}><div className="flex flex-wrap items-center gap-2"><Link className="text-teal-700 underline" to={`/samples/${output.sampleId}`}>{snapshot.sku} · {snapshot.name}</Link><Badge variant="outline">{t(output.status === "released" ? "已复核入库" : output.status === "voided" ? "登记已作废" : "待复核，未入可用库存")}</Badge></div><p className="mt-2">{output.antibodyId} · {output.chain} · {output.quantity} {output.unit} · {snapshot.locationName}</p><p className="mt-1 text-muted-foreground">{t("来源样本")}：{(JSON.parse(output.parentSampleIds) as number[]).map(id => run.resources.find(resource => resource.sampleId === id)?.sku ?? id).join(", ")}</p><a className="mt-1 inline-block text-teal-700 underline" href={`/api/run-files/${output.evidenceId}`}>{t("查看产物原始文件")}</a>{editable && output.status === "pending_review" && <Button className="ml-3" size="sm" variant="outline" disabled={!note.trim() || voidOutput.isPending || register.isPending} onClick={() => voidOutput.mutate({ runId: run.id, expectedRevision: run.revision, outputId: output.id, idempotencyKey: crypto.randomUUID(), note })}>{t("作废此登记")}</Button>}</div>; })}</div>
   {released.length > 0 && canPrepare && <div className="space-y-3 border-t pt-4"><h3 className="font-medium">{t("用已放行产物准备下一阶段")}</h3><p className="text-sm text-muted-foreground">{t("填写本次需要的用量。下一阶段仍需核对库存、物料、设备和预约时间。")}</p>{released.map(output => <Label className="flex flex-wrap items-center gap-3" key={output.id}><span>{outputSnapshot(output.sampleSnapshot).name}</span><Input className="w-32" type="number" min="0" step="0.001" value={amounts[output.sampleId] ?? ""} onChange={e => setAmounts({ ...amounts, [output.sampleId]: e.target.value })}/>{output.unit}</Label>)}<Label className="block">{t("下一阶段方法")}<select className={selectClass} value={nextMethod} onChange={e => setNextMethod(e.target.value)}><option value="">{t("选择已发布的下一阶段方法")}</option>{candidates.map(method => <option key={method.id} value={method.id}>{method.name} · V{method.publishedRelease?.version}</option>)}</select></Label>{!candidates.length && <p className="text-sm text-amber-700">{t("尚无下一阶段的已发布方法，请联系方法负责人。")}</p>}<Label className="block">{t("阶段交接说明")}<Textarea value={handoffNote} onChange={e => setHandoffNote(e.target.value)}/></Label><Button disabled={!nextMethod || !selections.length || !handoffNote.trim() || next.isPending} onClick={() => next.mutate({ runId: run.id, workflowId: Number(nextMethod), outputs: selections, note: handoffNote, idempotencyKey: crypto.randomUUID() })}>{t("准备下一阶段实验")}</Button></div>}
 </CardContent></Card>;
}
