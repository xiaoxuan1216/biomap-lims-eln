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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Network, Users, GitBranch } from "lucide-react";
import { WORKFLOW_STATUS } from "@contracts/workflow";
import { toast } from "sonner";

export default function Workflows() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: wfs, isLoading } = trpc.workflow.list.useQuery();
  const { data: templates } = trpc.workflow.templates.useQuery();
  const { data: projects } = trpc.project.options.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", templateKey: "blank", projectId: "none", description: "" });

  const createMut = trpc.workflow.create.useMutation({
    onSuccess: (r) => {
      toast.success("流程已创建");
      setCreateOpen(false);
      utils.workflow.list.invalidate();
      navigate(`/workflows/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedTpl = form.templateKey !== "blank" ? templates?.find((t) => t.key === form.templateKey) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SynFlow 合成流</h1>
          <p className="text-sm text-muted-foreground mt-1">
            合成生物学流程编排平台 · 手工 / 设备 / 判断 / 数据处理节点 · 负责人分配 · 合成 Pipeline 即开即用
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新建流程
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">加载中…</div>
      ) : !wfs?.length ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
            还没有流程，点击右上角「新建流程」，可从预置 Pipeline 模板一键生成
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {wfs.map((w) => {
            const st = WORKFLOW_STATUS[w.status] ?? WORKFLOW_STATUS.draft;
            const pct = w.activeCount ? Math.round((w.doneCount / w.activeCount) * 100) : 0;
            return (
              <Card
                key={w.id}
                className="cursor-pointer hover:border-teal-300 hover:shadow-sm transition-all"
                onClick={() => navigate(`/workflows/${w.id}`)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-snug">{w.name}</div>
                    <Badge
                      variant="outline"
                      style={{ color: st.color, borderColor: st.color + "55", background: st.color + "11" }}
                    >
                      {st.label}
                    </Badge>
                  </div>
                  {w.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{w.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {w.nodeCount} 节点
                    </Badge>
                    <Badge variant="secondary" className="text-[11px]">合成生物学</Badge>
                    {w.owners.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {w.owners.slice(0, 3).join("、")}
                        {w.owners.length > 3 ? ` 等 ${w.owners.length} 人` : ""}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                      <span>{w.doneCount}/{w.activeCount} 节点完成</span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新建对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建流程</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：CAR-T 杀伤评估自动化业务流"
              />
            </div>
            <div className="space-y-1.5">
              <Label>初始模板</Label>
              <Select value={form.templateKey} onValueChange={(v) => setForm({ ...form, templateKey: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">空白画布</SelectItem>
                  <SelectGroup>
                    <SelectLabel>合成生物学 Pipeline</SelectLabel>
                    {templates
                      ?.filter((t) => t.group === "pipeline")
                      .map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.name}（{t.nodeCount} 节点）
                        </SelectItem>
                      ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>通用业务流</SelectLabel>
                    {templates
                      ?.filter((t) => t.group === "flow")
                      .map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.name}（{t.nodeCount} 节点）
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedTpl && (
                <p className="text-xs text-muted-foreground">{selectedTpl.description}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>关联项目（可选）</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>描述（可选）</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={!form.name.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  name: form.name.trim(),
                  description: form.description || undefined,
                  projectId: form.projectId === "none" ? null : Number(form.projectId),
                  templateKey: form.templateKey === "blank" ? null : form.templateKey,
                })
              }
            >
              创建并编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
