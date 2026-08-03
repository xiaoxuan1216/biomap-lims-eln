import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History } from "lucide-react";
import { fmtDateTime } from "@/lib/labels";
import { useI18n } from "@/i18n";

const ENTITY_LABELS: Record<string, string> = {
  project: "项目",
  experiment: "实验",
  sample: "样本",
  storage: "存储",
  sequence: "序列",
};

export default function ActivityLog() {
  const { t } = useI18n();
  const { data: activities, isLoading } = trpc.dashboard.recentActivity.useQuery({ limit: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("活动日志")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("全实验室操作审计追踪（最近 100 条）")}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t("时间")}</TableHead>
                <TableHead className="w-32">{t("操作人")}</TableHead>
                <TableHead>{t("操作")}</TableHead>
                <TableHead className="w-24">{t("对象类型")}</TableHead>
                <TableHead>{t("对象")}</TableHead>
                <TableHead>{t("详情")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm text-muted-foreground">{fmtDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="h-6 w-6 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-semibold">
                        {a.userName?.charAt(0) ?? t("系")}
                      </span>
                      {a.userName}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{a.action}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-50">
                      {t(ENTITY_LABELS[a.entityType] ?? a.entityType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-56 truncate">
                    {a.entityName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-64 truncate">
                    {a.detail ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && !activities?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {t("暂无活动记录")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
