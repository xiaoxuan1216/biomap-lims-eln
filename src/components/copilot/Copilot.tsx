import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  X,
  Send,
  FlaskConical,
  ArrowRight,
  FileInput,
  Loader2,
  Network,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCopilotContext, insertBlocksToExperiment } from "@/lib/copilotContext";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

interface ChatAction {
  label: string;
  url?: string;
  kind?: string;
  templateKey?: string;
  name?: string;
  done?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  actions?: ChatAction[];
}

const SUGGESTIONS: Record<string, string[]> = {
  default: ["哪些样本快过期了？", "实验室现在什么情况？", "设备今天有预约吗？"],
  experiment: ["生成 Gibson 组装方案", "生成 qPCR 方案", "生成流式检测方案"],
  sequence: ["帮我分析这条序列", "Gibson 引物怎么设计？", "这条序列有什么酶切位点？"],
  sample: ["哪些样本需要补货？", "哪些样本快过期了？"],
  equipment: ["设备状态怎么样？", "今明两天有哪些预约？"],
  workflow: ["现在有哪些流程？", "推荐一个载体构建 Pipeline", "推荐抗体研发 Pipeline"],
};

function suggestionsFor(pathname: string, ctxType?: string): string[] {
  if (ctxType === "experiment") return SUGGESTIONS.experiment;
  if (ctxType === "sequence") return SUGGESTIONS.sequence;
  if (pathname.startsWith("/samples")) return SUGGESTIONS.sample;
  if (pathname.startsWith("/equipment")) return SUGGESTIONS.equipment;
  if (pathname.startsWith("/workflows")) return SUGGESTIONS.workflow;
  if (pathname.startsWith("/sequences")) return SUGGESTIONS.sequence;
  return SUGGESTIONS.default;
}

export default function Copilot() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const chatMut = trpc.ai.chat.useMutation({
    onError: (e) => {
      setMessages((m) => [...m, { role: "assistant", text: t("出错了：{msg}", { msg: e.message }) }]);
    },
  });

  const createWfMut = trpc.workflow.create.useMutation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || chatMut.isPending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    const ctx = getCopilotContext();
    chatMut.mutate(
      {
        message: msg,
        lang,
        context: { page: location.pathname, entityType: ctx.entityType, entityId: ctx.entityId },
      },
      {
        onSuccess: (r) => {
          setMessages((m) => [
            ...m,
            { role: "assistant", text: r.reply, actions: r.actions as ChatAction[] },
          ]);
        },
      },
    );
  };

  const handleAction = async (action: ChatAction, msgIdx?: number, actionIdx?: number) => {
    if (action.kind === "createWorkflow" && action.templateKey) {
      if (createWfMut.isPending || action.done) return;
      try {
        const wfName = action.name ?? t("新建流程");
        const { id } = await createWfMut.mutateAsync({
          name: wfName,
          templateKey: action.templateKey,
          lang,
        });
        await utils.workflow.list.invalidate();
        toast.success(t("流程「{name}」已创建", { name: wfName }));
        setMessages((m) => {
          // 标记该创建按钮已使用，防止重复创建
          const next = m.map((msg, i) =>
            i === msgIdx && msg.actions
              ? {
                  ...msg,
                  actions: msg.actions.map((a, ai) =>
                    ai === actionIdx ? { ...a, done: true } : a,
                  ),
                }
              : msg,
          );
          return [
            ...next,
            {
              role: "assistant" as const,
              text: t("✅ 已从模板创建流程「{name}」，整套 DAG（节点、连线、判断分支）已就位。打开编辑器可以查看流程图、分配负责人、调整节点参数。", { name: wfName }),
              actions: [{ label: t("打开 DAG 编辑器"), url: `/workflows/${id}` }],
            },
          ];
        });
      } catch (e) {
        toast.error(t("创建失败：{msg}", { msg: e instanceof Error ? e.message : t("未知错误") }));
      }
      return;
    }
    if (action.kind === "insertBlocks" && action.templateKey) {
      try {
        const data = await utils.ai.generateProtocol.fetch({ templateKey: action.templateKey });
        if (data.blocks?.length) {
          const ok = insertBlocksToExperiment(
            data.blocks.map((b) => ({
              ...b,
              id: `cop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            })) as Parameters<typeof insertBlocksToExperiment>[0],
          );
          if (ok) {
            toast.success(t("「{label}」方案已插入实验记录", { label: data.label }));
            setOpen(false);
          } else {
            toast.error(t("插入失败：请在实验详情页使用该功能"));
          }
        }
      } catch {
        toast.error(t("方案获取失败"));
      }
      return;
    }
    if (action.url) {
      navigate(action.url);
      setOpen(false);
    }
  };

  const ctx = getCopilotContext();
  const suggestions = suggestionsFor(location.pathname, ctx.entityType);

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg shadow-teal-600/30",
          "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
          "flex items-center justify-center transition-all hover:scale-105 active:scale-95",
          open && "opacity-0 pointer-events-none",
        )}
        title="BioMap OS Copilot"
      >
        <Sparkles className="h-6 w-6" />
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
      </button>

      {/* 抽屉 */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-white border-l shadow-2xl",
          "flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* 头部 */}
        <div className="h-14 shrink-0 border-b flex items-center gap-2.5 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
          <Sparkles className="h-5 w-5" />
          <div className="flex-1">
            <div className="font-semibold text-sm leading-none">BioMap OS Copilot</div>
            <div className="text-[11px] text-teal-100 mt-1">
              {t("合成生物学智能助手")}
              {ctx.entityName && <span> · {t("上下文")}：{ctx.entityName}</span>}
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-700">
                {t("你好！我是 BioMap OS Copilot 🧬 我可以帮你查询实验室数据、分析序列、生成实验方案，还能推荐并一键创建合成生物学 DAG 流程。")}
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium px-1">{t("试试这些：")}</div>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-sm rounded-xl border px-3.5 py-2.5 hover:border-teal-300 hover:bg-teal-50/50 transition-colors flex items-center gap-2"
                  >
                    <FlaskConical className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "rounded-tr-sm bg-teal-600 text-white"
                    : "rounded-tl-sm bg-slate-100 text-slate-800",
                )}
              >
                {m.text}
                {m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.actions.map((a, ai) => {
                      const primary = a.kind === "insertBlocks" || a.kind === "createWorkflow";
                      const creating = a.kind === "createWorkflow" && createWfMut.isPending;
                      return (
                        <Button
                          key={ai}
                          size="sm"
                          variant={primary && !a.done ? "default" : "outline"}
                          className={cn(
                            "h-7 text-xs",
                            primary && !a.done && "bg-teal-600 hover:bg-teal-500",
                          )}
                          disabled={creating || a.done}
                          onClick={() => handleAction(a, i, ai)}
                        >
                          {creating ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : a.done ? (
                            <Check className="h-3 w-3 mr-1" />
                          ) : a.kind === "insertBlocks" ? (
                            <FileInput className="h-3 w-3 mr-1" />
                          ) : a.kind === "createWorkflow" ? (
                            <Network className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowRight className="h-3 w-3 mr-1" />
                          )}
                          {a.done ? t("已创建") : t(a.label)}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatMut.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                {t("Copilot 思考中…")}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t p-3">
          {messages.length > 0 && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs whitespace-nowrap rounded-full border px-3 py-1.5 hover:border-teal-300 hover:bg-teal-50/50 transition-colors text-slate-600"
                >
                  {t(s)}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("问点什么，例如「生成 Gibson 方案」…")}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              className="bg-teal-600 hover:bg-teal-500 shrink-0"
              disabled={chatMut.isPending || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
