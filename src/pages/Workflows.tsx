import { antibodyStageNames, type AntibodyStage } from "@contracts/antibodyMethods";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Network, Users, GitBranch, PlayCircle } from "lucide-react";
import { WORKFLOW_STATUS, TEMPLATE_GROUPS, TEMPLATE_GROUP_ORDER } from "@contracts/workflow";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";

export default function Workflows({ configuration = false }: { configuration?: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedStage = searchParams.get("stage");
  const initialStage = requestedStage && Object.hasOwn(antibodyStageNames, requestedStage) ? requestedStage as AntibodyStage : "all";
  const maintain = configuration;
  const canConfigure = user?.role !== "viewer";
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<AntibodyStage | "all">(initialStage);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: wfsAll, isLoading } = trpc.workflow.list.useQuery();
  // 子流程不在主列表展示，通过父流程节点穿透访问
  const wfs = wfsAll?.filter((w) => !w.parentWorkflowId && (maintain || !!w.publishedRelease));
  const { data: templates } = trpc.workflow.templates.useQuery();
  const { data: projects } = trpc.project.options.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", templateKey: "blank", projectId: "none", description: "", scenario: "synbio" as "synbio" | "antibody" });
  const [tab, setTab] = useState<"all" | "synbio" | "antibody">(initialStage === "all" ? "all" : "antibody");

  const createMut = trpc.workflow.create.useMutation({
    onSuccess: (r) => {
      toast.success(t("流程已创建"));
      setCreateOpen(false);
      utils.workflow.list.invalidate();
      navigate(`/workflows/${r.id}/edit`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createAntibody = trpc.workflow.createAntibodyMethod.useMutation({ onSuccess: async result => { await utils.workflow.list.invalidate(); navigate(`/workflows/${result.id}?workspace=configuration`); }, onError: error => toast.error(error.message) });
  const selectedTpl = form.templateKey !== "blank" ? templates?.find((tpl) => tpl.key === form.templateKey) : null;
  const visible = wfs?.filter(w => (tab === "all" || (w.scenario ?? "synbio") === tab) && (stage === "all" || (maintain ? w.stage : w.publishedRelease?.stage) === stage) && `${w.name} ${w.description ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t(maintain ? "方法与流程画布" : "方法库")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(maintain ? "在后台配置流程画布、实验步骤和发布要求；发布后供实验工作台使用。" : "选择已发布方法，准备本批样本并开始实验。") }
          </p>
        </div>
        <div className="flex gap-2">
        {canConfigure && <Button variant="outline" onClick={() => navigate(maintain ? "/workflows" : "/configuration/methods")}>{t(maintain ? "返回已发布方法" : "进入方法配置")}</Button>}
        {maintain && canConfigure && <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("新建流程")}
        </Button>}</div>
      </div>

      {maintain && canConfigure && <Card><CardContent className="space-y-3 p-4"><h2 className="font-medium">{t("抗体研发阶段方法")}</h2><p className="text-sm text-muted-foreground">{t("从阶段草稿开始，补齐实际 SOP、设备、物料与结果标准后再复核发布。")}</p><div className="grid gap-2 md:grid-cols-4">{(Object.keys(antibodyStageNames) as AntibodyStage[]).map(stage => <Button key={stage} variant="outline" className="h-auto whitespace-normal py-3" disabled={createAntibody.isPending} onClick={() => createAntibody.mutate({ stage, lang })}>{antibodyStageNames[stage][lang]}</Button>)}</div></CardContent></Card>}

      {/* 场景分栏 */}
      <div className="flex gap-2">
        {([
          { key: "all", label: t("全部") },
          { key: "synbio", label: t("合成生物") },
          { key: "antibody", label: t("抗体研发") },
        ] as const).map((it) => (
          <button
            key={it.key}
            onClick={() => { setTab(it.key); setStage("all"); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === it.key
                ? "bg-teal-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {it.label}
            <span className="ml-1.5 opacity-70">
              {it.key === "all" ? wfs?.length ?? 0 : wfs?.filter((w) => (w.scenario ?? "synbio") === it.key).length ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3"><Input aria-label={t("搜索方法名称或用途")} placeholder={t("搜索方法名称或用途")} value={search} onChange={e => setSearch(e.target.value)}/>{tab !== "synbio" && <div className="flex flex-wrap gap-2"><Button size="sm" variant={stage === "all" ? "default" : "outline"} onClick={() => setStage("all")}>{t("全部阶段")}</Button>{(Object.keys(antibodyStageNames) as AntibodyStage[]).map(key => <Button key={key} size="sm" variant={stage === key ? "default" : "outline"} onClick={() => { setStage(key); setTab("antibody"); }}>{t(({ cloning: "分子克隆", expression: "转染表达", purification: "抗体纯化", characterization: "抗体表征" })[key])}</Button>)}</div>}</div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("加载中…")}</div>
      ) : !visible?.length ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
            {t(wfs?.length ? "没有匹配的方法，请调整阶段或搜索内容。" : maintain ? "暂无方法草稿，可从上方研发阶段开始建立。" : "暂无已发布方法。请方法负责人在维护方法库中完成复核发布。")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((w) => {
            const st = WORKFLOW_STATUS[w.status] ?? WORKFLOW_STATUS.draft;
            return (
              <Card
                key={w.id}
                className={`${!maintain || canConfigure ? "cursor-pointer hover:border-teal-300 hover:shadow-sm" : ""} transition-all`}
                onClick={() => {
                  if (maintain && !canConfigure) return;
                  navigate(maintain ? `/workflows/${w.id}/edit` : `/workflows/${w.id}${Number.isSafeInteger(Number(searchParams.get("sampleId"))) && Number(searchParams.get("sampleId")) > 0 ? `?sampleId=${Number(searchParams.get("sampleId"))}` : ""}`);
                }}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-snug">{w.name}</div>
                    <Badge
                      variant="outline"
                      style={{ color: st.color, borderColor: st.color + "55", background: st.color + "11" }}
                    >
                      {w.publishedRelease ? `${t("已发布")} V${w.publishedRelease.version}` : t(w.methodState === "review" ? "待复核" : w.methodState === "retired" ? "已停用" : "待确认草稿")}
                    </Badge>
                  </div>
                  {w.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{w.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px]">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {t("{n} 节点", { n: w.nodeCount })}
                    </Badge>
                    <Badge variant="secondary" className="text-[11px]">
                      {t(w.scenario === "antibody" ? "抗体研发" : "合成生物学")}
                    </Badge>
                    {w.owners.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {w.owners.slice(0, 3).join(t("、"))}
                        {w.owners.length > 3 ? t(" 等 {n} 人", { n: w.owners.length }) : ""}
                      </span>
                    )}
                  </div>
                  {maintain && <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-muted-foreground">
                    {t("这里保存流程定义；每次实验的节点进度请在运行中心查看。")}
                  </div>}
                  {maintain && canConfigure && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={event => { event.stopPropagation(); navigate(`/workflows/${w.id}/edit`); }}>{t("打开流程画布")}</Button><Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); navigate(`/workflows/${w.id}?workspace=configuration`); }}>{t("方法要求与发布")}</Button></div>}
                  {!maintain && w.publishedRelease && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-teal-200 text-teal-700 hover:bg-teal-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/runs/new?workflowId=${w.id}&methodReleaseId=${w.publishedRelease!.id}${Number.isSafeInteger(Number(searchParams.get("sampleId"))) && Number(searchParams.get("sampleId")) > 0 ? `&sampleId=${Number(searchParams.get("sampleId"))}` : ""}`);
                      }}
                    >
                      <PlayCircle className="mr-1 h-4 w-4" /> {t("使用此方法")}
                    </Button>
                  )}
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
            <DialogTitle>{t("新建流程")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("名称")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("例如：CAR-T 杀伤评估自动化业务流")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("初始模板")}</Label>
              <Select value={form.templateKey} onValueChange={(v) => setForm({ ...form, templateKey: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">{t("空白画布")}</SelectItem>
                  {TEMPLATE_GROUP_ORDER.map((g) => (
                    <SelectGroup key={g}>
                      <SelectLabel>{t(TEMPLATE_GROUPS[g])}</SelectLabel>
                      {templates
                        ?.filter((tpl) => tpl.group === g)
                        .map((tpl) => (
                          <SelectItem key={tpl.key} value={tpl.key}>
                            {t(tpl.name)}（{t("{n} 节点", { n: tpl.nodeCount })}）
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selectedTpl && (
                <p className="text-xs text-muted-foreground">{t(selectedTpl.description)}</p>
              )}
            </div>
            {form.templateKey === "blank" && (
              <div className="space-y-1.5">
                <Label>{t("场景")}</Label>
                <Select value={form.scenario} onValueChange={(v) => setForm({ ...form, scenario: v as "synbio" | "antibody" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="synbio">{t("合成生物")}</SelectItem>
                    <SelectItem value="antibody">{t("抗体研发")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("关联项目（可选）")}</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("不关联")}</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("描述（可选）")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("取消")}
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
                  scenario: form.templateKey === "blank" ? form.scenario : undefined,
                  lang,
                })
              }
            >
              {t("创建并编辑")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
