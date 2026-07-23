import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FolderKanban, NotebookPen, TestTubes, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router";
import { PROJECT_COLORS, PROJECT_STATUS, fmtDate } from "@/lib/labels";
import { toast } from "sonner";

const COLOR_OPTIONS = ["teal", "indigo", "amber", "rose", "cyan", "violet"];

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "teal", status: "active" });

  const refresh = () => utils.project.list.invalidate();
  const createMut = trpc.project.create.useMutation({
    onSuccess: () => {
      toast.success("项目已创建");
      setDialogOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("项目已更新");
      setDialogOpen(false);
      refresh();
      utils.project.byId.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("项目已删除");
      setDeleting(null);
      refresh();
    },
    onError: (e) => {
      toast.error(e.message);
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", color: "teal", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (p: NonNullable<typeof projects>[number]) => {
    setEditing(p.id);
    setForm({
      name: p.name,
      description: p.description ?? "",
      color: p.color,
      status: p.status,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing, ...form, status: form.status as "active" | "on_hold" | "completed" });
    } else {
      createMut.mutate({ ...form, status: form.status as "active" | "on_hold" | "completed" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目管理</h1>
          <p className="text-sm text-muted-foreground mt-1">组织实验与样本的研究项目</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-500">
          <Plus className="h-4 w-4 mr-1" /> 新建项目
        </Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : projects?.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const color = PROJECT_COLORS[p.color] ?? PROJECT_COLORS.teal;
            const status = PROJECT_STATUS[p.status];
            return (
              <Card key={p.id} className="group hover:shadow-md transition-shadow overflow-hidden">
                <div className={`h-1.5 ${color.dot}`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate hover:text-teal-700 transition-colors">
                        {p.name}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4 text-slate-500" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> 编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2 min-h-10">
                    {p.description || "暂无描述"}
                  </p>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <NotebookPen className="h-3.5 w-3.5" /> {p.experimentCount} 实验
                      {p.activeExperimentCount > 0 && `（${p.activeExperimentCount} 进行中）`}
                    </span>
                    <span className="flex items-center gap-1">
                      <TestTubes className="h-3.5 w-3.5" /> {p.sampleCount} 样本
                    </span>
                    <span className="ml-auto">{fmtDate(p.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <FolderKanban className="h-10 w-10" />
            <p>还没有项目，点击「新建项目」开始你的第一个研究项目</p>
          </div>
        </Card>
      )}

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑项目" : "新建项目"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>项目名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：CAR-T 细胞疗法开发"
              />
            </div>
            <div className="space-y-2">
              <Label>项目描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="研究目标、范围与预期成果…"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>标识颜色</Label>
                <div className="flex gap-2 pt-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-6 w-6 rounded-full ${PROJECT_COLORS[c].dot} ${
                        form.color === c ? "ring-2 ring-offset-2 ring-slate-400" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">进行中</SelectItem>
                    <SelectItem value="on_hold">已暂停</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-teal-600 hover:bg-teal-500"
            >
              {editing ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleting !== null} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目？</AlertDialogTitle>
            <AlertDialogDescription>
              项目删除后不可恢复。项目下若仍有实验记录将无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate({ id: deleting })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
