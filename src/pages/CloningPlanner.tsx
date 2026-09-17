import { Navigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { workflowPlateUrl } from "@/features/cloning-planner/workflowPlateContext";

/** Compatibility for previously shared links; the editor owns the feature. */
export default function CloningPlanner() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const planId = Number(params.get("planId")) || 0;
  const saved = trpc.cloningLayout.byId.useQuery({ id: planId }, { enabled: planId > 0 });
  if (planId && saved.isLoading) return <p>{t("加载中…")}</p>;
  if (saved.error) return <p role="alert" className="text-destructive">{t(saved.error.message)}</p>;
  const workflowId = saved.data?.workflowId ?? Number(params.get("workflowId"));
  const projectId = Number(params.get("projectId"));
  return <Navigate replace to={workflowId > 0 ? workflowPlateUrl(workflowId, { planId: saved.data?.id, nodeKey: params.get("nodeKey") ?? saved.data?.nodeKey }) : projectId > 0 ? `/projects/${projectId}` : "/workflows"} />;
}
