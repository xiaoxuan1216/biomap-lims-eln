import CommandDeck from "@/components/command/CommandDeck";
import { Bot } from "lucide-react";
import { useI18n } from "@/i18n";

/** Lab Agent：指令台的独立工作台（全高度会话式操作入口） */
export default function LabAgent() {
  const { t } = useI18n();
  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600/10">
          <Bot className="h-5 w-5 text-teal-600" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lab Agent</h1>
          <p className="text-sm text-muted-foreground">
            {t("实验室指令台 · 用自然语言执行可验证查询；写操作需明确确认")}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CommandDeck fullHeight />
      </div>
    </div>
  );
}
