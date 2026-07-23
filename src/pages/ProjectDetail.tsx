import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, NotebookPen, TestTubes, Plus } from "lucide-react";
import { EXP_STATUS, PROJECT_COLORS, PROJECT_STATUS, SAMPLE_TYPES, fmtDate, fmtDateTime } from "@/lib/labels";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const { data: project, isLoading } = trpc.project.byId.useQuery({ id: projectId });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", objective: "" });
  const createMut = trpc.experiment.create.useMutation({
    onSuccess: (r) => {
      toast.success(`实验 ${r.code} 已创建`);
      setCreateOpen(false);
      navigate(`/experiments/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-20 text-muted-foreground">项目不存在</div>;
  }

  const color = PROJECT_COLORS[project.color] ?? PROJECT_COLORS.teal;
  const status = PROJECT_STATUS[project.status];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> 返回项目列表
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${color.dot}`} />
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <Badge variant="outline" className={status.cls}>{status.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
              {project.description || "暂无描述"}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 hover:bg-teal-500 shrink-0">
            <Plus className="h-4 w-4 mr-1" /> 新建实验
          </Button>
        </div>
      </div>

      <Tabs defaultValue="experiments">
        <TabsList>
          <TabsTrigger value="experiments" className="gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" /> 实验记录 ({project.experiments.length})
          </TabsTrigger>
          <TabsTrigger value="samples" className="gap-1.5">
            <TestTubes className="h-3.5 w-3.5" /> 关联样本 ({project.samples.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="experiments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {project.experiments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">编号</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead className="w-28">状态</TableHead>
                      <TableHead className="w-32">创建人</TableHead>
                      <TableHead className="w-36">更新时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.experiments.map((e) => {
                      const st = EXP_STATUS[e.status];
                      return (
                        <TableRow
                          key={e.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/experiments/${e.id}`)}
                        >
                          <TableCell className="font-mono text-xs text-teal-700">{e.code}</TableCell>
                          <TableCell className="font-medium">{e.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.createdByName ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fmtDateTime(e.updatedAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">
                  该项目下还没有实验记录
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {project.samples.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">编号</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead className="w-28">类型</TableHead>
                      <TableHead className="w-32">余量</TableHead>
                      <TableHead className="w-32">效期</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.samples.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/samples/${s.id}`)}
                      >
                        <TableCell className="font-mono text-xs text-teal-700">{s.sku}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={SAMPLE_TYPES[s.type]?.cls}>
                            {SAMPLE_TYPES[s.type]?.label ?? s.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.quantity} {s.unit}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(s.expiryDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">暂无关联样本</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 新建实验 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>在「{project.name}」下新建实验</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>实验标题</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：CD19-CAR 慢病毒转导效率优化"
              />
            </div>
            <div className="space-y-2">
              <Label>实验目标（可选）</Label>
              <Textarea
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                rows={3}
                placeholder="本实验希望回答的问题或达成的指标…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.title.trim()}
              onClick={() =>
                createMut.mutate({ projectId, title: form.title.trim(), objective: form.objective || undefined })
              }
            >
              创建并打开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
