import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Building2,
  Snowflake,
  Thermometer,
  Layers,
  Archive,
  Grid3x3,
  Trash2,
  Thermometer as TempIcon,
} from "lucide-react";
import { LOCATION_TYPES } from "@/lib/labels";
import { locationPath } from "@/components/LocationSelect";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, typeof Building2> = {
  lab: Building2,
  freezer: Snowflake,
  fridge: Thermometer,
  shelf: Layers,
  rack: Archive,
  box: Grid3x3,
};

type Node = {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  temperature: string | null;
  rows: number | null;
  cols: number | null;
  sampleCount: number;
  children: Node[];
};

export default function Storage() {
  const utils = trpc.useUtils();
  const { data: locations, isLoading } = trpc.storage.tree.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<Node | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "freezer",
    parentId: "none",
    temperature: "",
    rows: "9",
    cols: "9",
  });

  const createMut = trpc.storage.create.useMutation({
    onSuccess: () => {
      toast.success("存储位置已创建");
      setCreateOpen(false);
      utils.storage.tree.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.storage.delete.useMutation({
    onSuccess: () => {
      toast.success("存储位置已删除");
      setDeleting(null);
      utils.storage.tree.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      setDeleting(null);
    },
  });

  const tree = useMemo(() => {
    if (!locations) return [];
    const map = new Map<number, Node>();
    locations.forEach((l) => map.set(l.id, { ...l, children: [] }));
    const roots: Node[] = [];
    map.forEach((n) => {
      if (n.parentId != null && map.has(n.parentId)) {
        map.get(n.parentId)!.children.push(n);
      } else {
        roots.push(n);
      }
    });
    return roots;
  }, [locations]);

  const renderNode = (node: Node, depth: number) => {
    const Icon = TYPE_ICONS[node.type] ?? Archive;
    const isBox = node.type === "box";
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2.5 py-2.5 px-3 rounded-lg hover:bg-slate-50 group"
          style={{ marginLeft: depth * 24 }}
        >
          <Icon className={`h-4 w-4 shrink-0 ${node.type === "freezer" ? "text-cyan-500" : node.type === "box" ? "text-teal-600" : "text-slate-400"}`} />
          {isBox ? (
            <Link to={`/storage/box/${node.id}`} className="font-medium text-sm hover:text-teal-700">
              {node.name}
              <span className="text-xs text-muted-foreground font-normal ml-2">
                {node.rows}×{node.cols} 格
              </span>
            </Link>
          ) : (
            <span className="font-medium text-sm">{node.name}</span>
          )}
          <span className="text-xs text-muted-foreground">{LOCATION_TYPES[node.type]}</span>
          {node.temperature && (
            <span className="flex items-center gap-0.5 text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
              <TempIcon className="h-3 w-3" /> {node.temperature}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{node.sampleCount} 样本</span>
          <button
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500"
            onClick={() => setDeleting(node)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">存储管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实验室 → 冰箱 → 层架 → 冻存盒 的层级存储结构
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新建位置
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">加载中…</p>
          ) : tree.length ? (
            <div className="divide-y divide-slate-50">{tree.map((n) => renderNode(n, 0))}</div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              还没有存储位置，点击「新建位置」创建实验区或冰箱
            </p>
          )}
        </CardContent>
      </Card>

      {/* 新建位置 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建存储位置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：-80°C 冰箱 2 号"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LOCATION_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>上级位置</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">（顶级位置）</SelectItem>
                    {locations?.filter((l) => l.type !== "box").map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {locationPath(locations, l.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(form.type === "freezer" || form.type === "fridge") && (
              <div className="space-y-2">
                <Label>温度</Label>
                <Input
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                  placeholder="例如：-80°C / 4°C / -196°C"
                />
              </div>
            )}
            {form.type === "box" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>行数</Label>
                  <Input
                    type="number"
                    min="1"
                    max="26"
                    value={form.rows}
                    onChange={(e) => setForm({ ...form, rows: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>列数</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={form.cols}
                    onChange={(e) => setForm({ ...form, cols: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.name.trim()}
              onClick={() =>
                createMut.mutate({
                  name: form.name.trim(),
                  type: form.type as "lab" | "freezer" | "fridge" | "shelf" | "rack" | "box",
                  parentId: form.parentId === "none" ? null : Number(form.parentId),
                  temperature: form.temperature || undefined,
                  rows: form.type === "box" ? Number(form.rows) : undefined,
                  cols: form.type === "box" ? Number(form.cols) : undefined,
                })
              }
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleting !== null} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              仅当该位置下没有子位置和样本时才能删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate({ id: deleting.id })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
