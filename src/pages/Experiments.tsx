import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NotebookPen, Search, Lock, Plus } from "lucide-react";
import { EXP_STATUS, PROJECT_COLORS, fmtDateTime } from "@/lib/labels";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function Experiments() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", objective: "" });

  const { data: projects } = trpc.project.options.useQuery();
  const { data: experiments, isLoading } = trpc.experiment.list.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : (statusFilter as "planning" | "in_progress" | "completed" | "signed"),
    projectId: projectFilter === "all" ? undefined : Number(projectFilter),
  });

  const createMut = trpc.experiment.create.useMutation({
    onSuccess: (r) => {
      toast.success(`实验 ${r.code} 已创建`);
      setCreateOpen(false);
      navigate(`/experiments/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">实验记录本</h1>
          <p className="text-sm text-muted-foreground mt-1">
            电子实验记录（ELN）· 支持签署锁定与审计追踪
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-500"
          onClick={() => {
            setForm({ projectId: "", title: "", objective: "" });
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> 新建实验
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索实验标题或编号…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="planning">计划中</SelectItem>
            <SelectItem value="in_progress">进行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="signed">已签署</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="所属项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">编号</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-44">所属项目</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="w-32">创建人</TableHead>
                <TableHead className="w-36">更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {experiments?.map((e) => {
                const st = EXP_STATUS[e.status];
                const pc = PROJECT_COLORS[e.projectColor ?? "teal"] ?? PROJECT_COLORS.teal;
                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/experiments/${e.id}`)}
                  >
                    <TableCell className="font-mono text-xs text-teal-700">{e.code}</TableCell>
                    <TableCell>
                      <span className="font-medium flex items-center gap-1.5">
                        {e.status === "signed" && <Lock className="h-3.5 w-3.5 text-violet-500" />}
                        {e.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-md ${pc.soft}`}>
                        {e.projectName ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.createdByName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDateTime(e.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && !experiments?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    <NotebookPen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    没有匹配的实验记录
                  </TableCell>
                </TableRow>
              )}
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新建实验 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建实验</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>所属项目</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>实验标题</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：CAR-T 体外杀伤实验"
              />
            </div>
            <div className="space-y-2">
              <Label>实验目标（可选）</Label>
              <Textarea
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.title.trim() || !form.projectId}
              onClick={() =>
                createMut.mutate({
                  projectId: Number(form.projectId),
                  title: form.title.trim(),
                  objective: form.objective || undefined,
                })
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
