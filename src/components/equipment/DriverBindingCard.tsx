import { useMemo, useState } from "react";
import { Cable, CheckCircle2, CircleOff, FlaskConical, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { driverDefaults } from "@contracts/deviceDriver";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConfigValue = string | number | boolean;

const STATUS_STYLE: Record<string, string> = {
  simulation_ready: "border-sky-200 bg-sky-50 text-sky-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  offline: "border-amber-200 bg-amber-50 text-amber-700",
  fault: "border-red-200 bg-red-50 text-red-700",
  unconfigured: "border-slate-200 bg-slate-50 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  simulation_ready: "模拟就绪",
  ready: "就绪",
  offline: "Edge 离线",
  fault: "配置错误",
  unconfigured: "待测试",
};

export function DriverBindingCard({
  equipmentId,
  equipmentName,
  isAdmin,
}: {
  equipmentId: number;
  equipmentName: string;
  isAdmin: boolean;
}) {
  const { t, lang } = useI18n();
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.driver.catalog.useQuery();
  const { data: binding } = trpc.driver.bindingByEquipment.useQuery({ equipmentId });
  const [open, setOpen] = useState(false);
  const [driverRef, setDriverRef] = useState("");
  const [mode, setMode] = useState<"simulation" | "edge">("simulation");
  const [config, setConfig] = useState<Record<string, ConfigValue>>({});
  const [secretRef, setSecretRef] = useState("");

  const selected = useMemo(
    () =>
      catalog?.find(
        (entry) => `${entry.driverKey}@${entry.version}` === driverRef,
      ),
    [catalog, driverRef],
  );
  const boundDriver = catalog?.find(
    (entry) =>
      entry.driverKey === binding?.driverKey && entry.version === binding?.driverVersion,
  );

  const openBindingEditor = () => {
    if (!catalog?.length) {
      setOpen(true);
      return;
    }
    if (binding) {
      setDriverRef(`${binding.driverKey}@${binding.driverVersion}`);
      setMode(binding.mode);
      setConfig(binding.connectionConfig as Record<string, ConfigValue>);
      setSecretRef(binding.secretRef ?? "");
    } else {
      const first = catalog[0];
      setDriverRef(`${first.driverKey}@${first.version}`);
      setMode("simulation");
      setConfig(driverDefaults(first.connectionFields));
      setSecretRef("");
    }
    setOpen(true);
  };

  const bindMut = trpc.driver.bindEquipment.useMutation({
    onSuccess: async () => {
      toast.success(t("驱动绑定已保存"));
      setOpen(false);
      await Promise.all([
        utils.driver.bindingByEquipment.invalidate({ equipmentId }),
        utils.driver.bindings.invalidate(),
        utils.driver.nodeCatalog.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const testMut = trpc.driver.testBinding.useMutation({
    onSuccess: async (result) => {
      if (result.ok) toast.success(t(result.message));
      else toast.warning(t(result.message));
      await Promise.all([
        utils.driver.bindingByEquipment.invalidate({ equipmentId }),
        utils.driver.bindings.invalidate(),
        utils.driver.nodeCatalog.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const setField = (key: string, value: ConfigValue) =>
    setConfig((current) => ({ ...current, [key]: value }));

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cable className="h-4 w-4 text-teal-600" />
              {t("驱动与连接")}
            </CardTitle>
            <div className="flex items-center gap-2">
              {binding && (
                <Badge variant="outline" className={STATUS_STYLE[binding.status]}>
                  {t(STATUS_LABEL[binding.status] ?? binding.status)}
                </Badge>
              )}
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={openBindingEditor}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  {binding ? t("修改绑定") : t("绑定驱动")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {binding && boundDriver ? (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{lang === "en" ? (boundDriver.nameEn ?? boundDriver.name) : boundDriver.name}</span>
                  <Badge variant="secondary">{boundDriver.vendor}</Badge>
                  <Badge variant="outline">v{binding.driverVersion}</Badge>
                  <Badge variant="outline">
                    {binding.mode === "simulation" ? t("模拟模式") : t("Edge 实机模式")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {binding.lastMessage ? t(binding.lastMessage) : t("保存连接参数后执行一次连接测试")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{t("运行时：")}{boundDriver.runtime.kind}</span>
                  <span>·</span>
                  <span>{t("可编排动作：")}{boundDriver.actions.filter((action) => action.exposeAsNode).length}</span>
                  {binding.lastTestAt && (
                    <>
                      <span>·</span>
                      <span>{t("最近测试：")}{binding.lastTestAt.toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  disabled={testMut.isPending}
                  onClick={() => testMut.mutate({ equipmentId })}
                >
                  {binding.mode === "simulation" ? (
                    <FlaskConical className="mr-1.5 h-4 w-4" />
                  ) : binding.status === "ready" ? (
                    <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" />
                  ) : (
                    <CircleOff className="mr-1.5 h-4 w-4 text-amber-600" />
                  )}
                  {testMut.isPending ? t("测试中…") : t("测试连接")}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
              <Cable className="h-8 w-8 opacity-35" />
              <p className="text-sm">{t("该设备尚未绑定驱动，绑定后才能作为真实设备节点进入 BioFlow。")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("绑定设备驱动")} · {equipmentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("驱动版本")}</Label>
                <Select
                  value={driverRef}
                  onValueChange={(value) => {
                    setDriverRef(value);
                    const next = catalog?.find((item) => `${item.driverKey}@${item.version}` === value);
                    if (next) setConfig(driverDefaults(next.connectionFields));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {catalog?.map((entry) => (
                      <SelectItem key={`${entry.driverKey}@${entry.version}`} value={`${entry.driverKey}@${entry.version}`}>
                        {entry.vendor} · {lang === "en" ? (entry.nameEn ?? entry.name) : entry.name} · {entry.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("运行模式")}</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as "simulation" | "edge")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simulation">{t("模拟器（不下发物理命令）")}</SelectItem>
                    <SelectItem value="edge">{t("Edge Agent 实机连接")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selected && (
              <>
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">{t("运行前提")}</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {selected.runtime.requires.map((item) => <li key={item}>{t(item)}</li>)}
                  </ul>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selected.connectionFields.map((field) => (
                    <div key={field.key} className={`space-y-2 ${field.type === "path" ? "sm:col-span-2" : ""}`}>
                      <Label>
                        {lang === "en" ? (field.labelEn ?? field.label) : field.label}
                        {field.required ? " *" : ""}
                        {field.unit ? ` (${field.unit})` : ""}
                      </Label>
                      {field.type === "select" || field.type === "boolean" ? (
                        <Select
                          value={String(config[field.key] ?? "")}
                          onValueChange={(value) =>
                            setField(field.key, field.type === "boolean" ? value === "true" : value)
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(field.type === "boolean" ? ["true", "false"] : (field.options ?? [])).map((option) => (
                              <SelectItem key={option} value={option}>
                                {field.type === "boolean" ? (option === "true" ? t("是") : t("否")) : option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={field.type === "number" ? "number" : "text"}
                          min={field.min}
                          max={field.max}
                          value={String(config[field.key] ?? "")}
                          onChange={(event) =>
                            setField(
                              field.key,
                              field.type === "number" ? Number(event.target.value) : event.target.value,
                            )
                          }
                        />
                      )}
                      {(lang === "en" ? field.helpEn : field.help) && (
                        <p className="text-[11px] text-muted-foreground">
                          {lang === "en" ? field.helpEn : field.help}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>{t("凭据引用（可选）")}</Label>
              <Input
                value={secretRef}
                onChange={(event) => setSecretRef(event.target.value)}
                placeholder="secret://lab/equipment/credential"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("系统只保存 Secret 引用；密码和令牌由 Edge Agent 在本地解析。")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={!selected || bindMut.isPending}
              onClick={() => {
                if (!selected) return;
                bindMut.mutate({
                  equipmentId,
                  driverKey: selected.driverKey,
                  driverVersion: selected.version,
                  mode,
                  connectionConfig: config,
                  secretRef: secretRef || null,
                });
              }}
            >
              {bindMut.isPending ? t("保存中…") : t("保存绑定")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
