import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Workflow, Repeat } from "lucide-react";
import { PIPELINE_STATUS, PIPELINE_TYPES, PROJECT_COLORS } from "@/lib/labels";
import { toast } from "sonner";

export default function Pipelines() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: pipelines, isLoading } = trpc.pipeline.list.useQuery();
  const { data: templates } = trpc.pipeline.templates.useQuery();
  const { data: projects } = trpc.project.options.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "gibson_assembly", projectId: "none", description: "" });

  const createMut = trpc.pipeline.create.useMutation({
    onSuccess: (r) => {
      toast.success("Pipeline 已启动");
      setCreateOpen(false);
      utils.pipeline.list.invalidate();
      navigate(`/pipelines/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedTemplate = templates?.find((t) => t.key === form.type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">合成生物学 Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            标准化的载体构建 / 菌株编辑 / 蛋白表达 / DBTL 工程流程
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 启动 Pipeline
        </Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Card key={i} className="h-44 animate-pulse bg-slate-100" />)}
        </div>
      ) : pipelines?.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {pipelines.map((p) => {
            const type = PIPELINE_TYPES[p.type];
            const status = PIPELINE_STATUS[p.status];
            const pct = p.totalStages ? Math.round((p.doneStages / p.totalStages) * 100) : 0;
            const pc = PROJECT_COLORS[p.projectColor ?? "teal"] ?? PROJECT_COLORS.teal;
            return (
              <Card
                key={p.id}
                className="cursor-pointer hover:shadow-md hover:border-teal-200 transition-all"
                onClick={() => navigate(`/pipelines/${p.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold flex items-center gap-2 min-w-0">
                      {p.type === "dbtl_cycle" && (
                        <span className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 shrink-0">
                          <Repeat className="h-3 w-3" /> 第 {p.iteration} 轮
                        </span>
                      )}
                      <span className="truncate">{p.name}</span>
                    </h3>
                    <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1">
                    {p.description || "—"}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className={type.cls}>{type.label}</Badge>
                    {p.projectName && (
                      <span className={`text-xs px-2 py-1 rounded-md ${pc.soft}`}>{p.projectName}</span>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>
                        {p.doneStages}/{p.totalStages} 阶段完成
                        {p.currentStage && <span className="text-blue-600"> · 当前：{p.currentStage}</span>}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Workflow className="h-10 w-10 opacity-40" />
            <p>还没有 Pipeline，点击「启动 Pipeline」选择一套标准化流程</p>
          </div>
        </Card>
      )}

      {/* 创建 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>启动合成生物学 Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pipeline 类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}（{t.stageCount} 阶段）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground">
                  {PIPELINE_TYPES[form.type]?.label} · 含 {selectedTemplate.stageCount} 个标准阶段
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：CD19-CAR-4G 慢病毒载体构建"
              />
            </div>
            <div className="space-y-2">
              <Label>关联项目</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">（不关联）</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>目标描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="本流程的工程目标与验收标准…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.name.trim()}
              onClick={() =>
                createMut.mutate({
                  name: form.name.trim(),
                  type: form.type as "gibson_assembly",
                  projectId: form.projectId === "none" ? null : Number(form.projectId),
                  description: form.description || undefined,
                })
              }
            >
              启动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
