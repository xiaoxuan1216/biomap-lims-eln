import { Languages } from "lucide-react";
import { useI18n } from "./index";
import { cn } from "@/lib/utils";

/** 中英文切换按钮 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      title={t("切换语言")}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium",
        "text-slate-600 hover:text-teal-700 hover:border-teal-300 hover:bg-teal-50/60 transition-colors",
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5" />
      {lang === "zh" ? "EN" : "中文"}
    </button>
  );
}
