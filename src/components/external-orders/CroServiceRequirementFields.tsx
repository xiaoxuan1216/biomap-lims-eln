import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import {
  getCroCatalog,
  getCroServiceTemplate,
  initialCroRequirementData,
  type CroRequirementData,
  type CroRequirementValue,
} from "@contracts/croCatalog";

type Props = {
  catalogKey: string;
  templateKey: string;
  data: CroRequirementData;
  onChange: (templateKey: string, data: CroRequirementData) => void;
};

export function CroServiceRequirementFields({
  catalogKey,
  templateKey,
  data,
  onChange,
}: Props) {
  const { t } = useI18n();
  const catalog = getCroCatalog(catalogKey);
  const template = getCroServiceTemplate(catalogKey, templateKey);
  if (!catalog) return null;

  const updateField = (key: string, value: CroRequirementValue | undefined) => {
    const next = { ...data };
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    )
      delete next[key];
    else next[key] = value;
    onChange(templateKey, next);
  };

  return (
    <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-teal-900">
            {t("CRO 标准服务目录")}
          </div>
          <p className="mt-1 text-xs text-teal-800/70">
            {t(
              "选择常用服务后填写结构化参数；正式下单前仍需与服务商确认最终规格。"
            )}
          </p>
        </div>
        <a
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
          href={catalog.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t(catalog.sourceLabel)} <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="space-y-2">
        <Label>{t("委托内容模板")}</Label>
        <Select
          value={templateKey || "__custom__"}
          onValueChange={value => {
            if (value === "__custom__") onChange("", {});
            else {
              const nextTemplate = getCroServiceTemplate(catalogKey, value);
              onChange(
                value,
                nextTemplate ? initialCroRequirementData(nextTemplate) : {}
              );
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {catalog.services.map(service => (
              <SelectItem key={service.key} value={service.key}>
                {t(service.category)} · {t(service.name)}
              </SelectItem>
            ))}
            <SelectItem value="__custom__">
              {t("自定义委托（自由输入）")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {template && (
        <>
          <div className="rounded-lg border border-teal-100 bg-white/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t(template.name)}</span>
              <Badge
                variant="outline"
                className="border-teal-200 bg-teal-50 text-teal-700"
              >
                {t("结构化模板 v{version}", { version: template.version })}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(template.description)}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {template.fields.map(field => {
              const value = data[field.key];
              const wide =
                field.type === "textarea" || field.type === "multiselect";
              return (
                <div
                  key={field.key}
                  className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}
                >
                  <Label>
                    {t(field.label)}
                    {field.required && (
                      <span className="ml-1 text-rose-500">*</span>
                    )}
                    {field.unit && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({t(field.unit)})
                      </span>
                    )}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      rows={3}
                      value={typeof value === "string" ? value : ""}
                      placeholder={
                        field.placeholder ? t(field.placeholder) : undefined
                      }
                      onChange={event =>
                        updateField(field.key, event.target.value)
                      }
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={typeof value === "string" ? value : ""}
                      onValueChange={next => updateField(field.key, next)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("请选择")} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map(entry => (
                          <SelectItem key={entry.value} value={entry.value}>
                            {t(entry.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "multiselect" ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-2">
                      {field.options?.map(entry => {
                        const values = Array.isArray(value) ? value : [];
                        const selected = values.includes(entry.value);
                        return (
                          <Button
                            key={entry.value}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            className={
                              selected ? "bg-teal-600 hover:bg-teal-500" : ""
                            }
                            onClick={() =>
                              updateField(
                                field.key,
                                selected
                                  ? values.filter(item => item !== entry.value)
                                  : [...values, entry.value]
                              )
                            }
                          >
                            {t(entry.label)}
                          </Button>
                        );
                      })}
                    </div>
                  ) : field.type === "boolean" ? (
                    <Select
                      value={typeof value === "boolean" ? String(value) : ""}
                      onValueChange={next =>
                        updateField(field.key, next === "true")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("请选择")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{t("是")}</SelectItem>
                        <SelectItem value="false">{t("否")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      min={field.type === "number" ? 0 : undefined}
                      value={
                        typeof value === "number" || typeof value === "string"
                          ? value
                          : ""
                      }
                      placeholder={
                        field.placeholder ? t(field.placeholder) : undefined
                      }
                      onChange={event =>
                        updateField(
                          field.key,
                          field.type === "number"
                            ? event.target.value === ""
                              ? undefined
                              : Number(event.target.value)
                            : event.target.value
                        )
                      }
                    />
                  )}
                  {field.help && (
                    <p className="text-xs text-muted-foreground">
                      {t(field.help)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
