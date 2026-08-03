import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Heading2, Type, ListChecks, Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import { uid, type ElnBlock } from "@/lib/labels";
import { useI18n } from "@/i18n";

interface Props {
  blocks: ElnBlock[];
  onChange: (blocks: ElnBlock[]) => void;
  readOnly?: boolean;
}

export default function BlockEditor({ blocks, onChange, readOnly }: Props) {
  const { t } = useI18n();
  const update = (id: string, patch: Partial<ElnBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as ElnBlock) : b)));
  };

  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  const move = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const addBlock = (type: ElnBlock["type"]) => {
    const block: ElnBlock =
      type === "checklist"
        ? { id: uid(), type, items: [{ id: uid(), text: "", done: false }] }
        : { id: uid(), type, text: "" };
    onChange([...blocks, block]);
  };

  return (
    <div>
      {!readOnly && (
        <div className="flex gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => addBlock("heading")}>
            <Heading2 className="h-3.5 w-3.5 mr-1" /> {t("标题")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => addBlock("text")}>
            <Type className="h-3.5 w-3.5 mr-1" /> {t("文本")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => addBlock("checklist")}>
            <ListChecks className="h-3.5 w-3.5 mr-1" /> {t("清单")}
          </Button>
        </div>
      )}

      <div className="space-y-1">
        {blocks.map((block, idx) => (
          <div
            key={block.id}
            className="eln-block group relative rounded-lg px-3 py-2 transition-colors"
          >
            {/* 悬浮工具条 */}
            {!readOnly && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full flex flex-col opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                <button
                  className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={() => move(block.id, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-0.5 text-slate-300 hover:text-red-500"
                  onClick={() => remove(block.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  disabled={idx === blocks.length - 1}
                  onClick={() => move(block.id, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {block.type === "heading" &&
              (readOnly ? (
                <h3 className="text-base font-semibold text-slate-800 pt-1">{block.text}</h3>
              ) : (
                <input
                  className="w-full bg-transparent outline-none text-base font-semibold text-slate-800 placeholder:text-slate-300"
                  value={block.text}
                  placeholder={t("小节标题")}
                  onChange={(e) => update(block.id, { text: e.target.value })}
                />
              ))}

            {block.type === "text" &&
              (readOnly ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {block.text || <span className="text-slate-300">{t("（空）")}</span>}
                </p>
              ) : (
                <textarea
                  className="text-sm text-slate-700 leading-relaxed placeholder:text-slate-300"
                  rows={Math.max(2, block.text.split("\n").length)}
                  value={block.text}
                  placeholder={t("记录实验内容、观察结果、数据…")}
                  onChange={(e) => update(block.id, { text: e.target.value })}
                />
              ))}

            {block.type === "checklist" && (
              <div className="space-y-1.5">
                {block.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 group/item">
                    <Checkbox
                      checked={item.done}
                      disabled={readOnly}
                      onCheckedChange={(checked) =>
                        update(block.id, {
                          items: block.items.map((it) =>
                            it.id === item.id ? { ...it, done: checked === true } : it,
                          ),
                        })
                      }
                    />
                    {readOnly ? (
                      <span
                        className={`text-sm flex-1 ${
                          item.done ? "line-through text-slate-400" : "text-slate-700"
                        }`}
                      >
                        {item.text}
                      </span>
                    ) : (
                      <>
                        <input
                          className={`flex-1 bg-transparent outline-none text-sm placeholder:text-slate-300 ${
                            item.done ? "line-through text-slate-400" : "text-slate-700"
                          }`}
                          value={item.text}
                          placeholder={t("步骤 / 材料…")}
                          onChange={(e) =>
                            update(block.id, {
                              items: block.items.map((it) =>
                                it.id === item.id ? { ...it, text: e.target.value } : it,
                              ),
                            })
                          }
                        />
                        <button
                          className="opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500"
                          onClick={() =>
                            update(block.id, {
                              items: block.items.filter((it) => it.id !== item.id),
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-500 ml-7"
                    onClick={() =>
                      update(block.id, {
                        items: [...block.items, { id: uid(), text: "", done: false }],
                      })
                    }
                  >
                    <Plus className="h-3 w-3" /> {t("添加一项")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {readOnly ? t("本实验暂无内容") : t("使用上方按钮添加标题、文本或清单，开始记录实验")}
          </p>
        )}
      </div>
    </div>
  );
}
