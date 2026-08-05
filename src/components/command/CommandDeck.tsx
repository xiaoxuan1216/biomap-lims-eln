import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalSquare, Send, Trash2, ArrowRight, User } from "lucide-react";
import { useI18n } from "@/i18n";

interface ChatAction {
  label: string;
  href: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  table?: { columns: string[]; rows: string[][] };
  actions?: ChatAction[];
  suggestions?: string[];
}

const STORAGE_KEY = "biomap-command-history";

export default function CommandDeck() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ChatMsg[]) : [];
    } catch {
      return [];
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const exec = trpc.command.execute.useMutation({
    onSuccess: (res) => {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: res.reply, table: res.table, actions: res.actions, suggestions: res.suggestions },
      ]);
    },
    onError: (e) => {
      setMsgs((m) => [...m, { role: "assistant", text: `${t("指令执行失败")}：${e.message}` }]);
    },
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-30)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = (text?: string) => {
    const v = (text ?? input).trim();
    if (!v || exec.isPending) return;
    setMsgs((m) => [...m, { role: "user", text: v }]);
    setInput("");
    exec.mutate({ text: v, lang });
  };

  const lastMsg = msgs[msgs.length - 1];
  const suggestions =
    lastMsg?.role === "assistant" && lastMsg.suggestions?.length
      ? lastMsg.suggestions
      : msgs.length === 0
        ? [
            t("今天有哪些设备预约？"),
            t("哪些样本快过期？"),
            t("设备状态总览"),
            t("进行中的流程进度"),
            t("创建一个重组抗体表达流程"),
            t("打开序列库"),
          ]
        : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/20">
          <TerminalSquare className="h-4.5 w-4.5 text-teal-300" />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{t("指令台")}</div>
          <div className="text-[11px] text-slate-400">{t("脱离 GUI 的即时指令下发 · 像对话一样操作系统")}</div>
        </div>
        {msgs.length > 0 && (
          <button
            className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
            onClick={() => {
              setMsgs([]);
              localStorage.removeItem(STORAGE_KEY);
            }}
          >
            <Trash2 className="h-3 w-3" /> {t("清空会话")}
          </button>
        )}
      </div>

      {/* 会话区 */}
      {(msgs.length > 0 || exec.isPending) && (
        <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/60">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="flex items-start gap-2 max-w-[80%]">
                  <div className="rounded-xl rounded-tr-sm bg-teal-600 px-3 py-2 text-[13px] text-white shadow-sm">
                    {m.text}
                  </div>
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200">
                    <User className="h-3 w-3 text-slate-500" />
                  </span>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 shadow-sm leading-relaxed">
                    {m.text}
                  </div>
                  {m.table && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            {m.table.columns.map((c) => (
                              <th key={c} className="px-3 py-1.5 text-left font-medium text-slate-500 whitespace-nowrap">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.table.rows.map((r, ri) => (
                            <tr key={ri} className="border-b border-slate-50 last:border-0">
                              {r.map((c, ci) => (
                                <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.actions.map((a) => (
                        <Button
                          key={a.href + a.label}
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-teal-200 text-teal-700 hover:bg-teal-50 text-xs"
                          onClick={() => navigate(a.href)}
                        >
                          {a.label} <ArrowRight className="h-3 w-3" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {exec.isPending && (
            <div className="flex justify-start">
              <div className="rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-400 shadow-sm">
                {t("正在执行…")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 建议 chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {suggestions.map((s) => (
            <button
              key={s}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 transition-colors"
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
          placeholder={t("输入指令，如：今天有哪些设备预约？/ 创建一个噬菌体展示流程 / 打开序列库")}
          className="h-10 text-[13px] border-slate-200 focus-visible:ring-teal-500"
        />
        <Button
          className="h-10 w-10 shrink-0 bg-teal-600 hover:bg-teal-700"
          size="icon"
          onClick={() => send()}
          disabled={exec.isPending || !input.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
