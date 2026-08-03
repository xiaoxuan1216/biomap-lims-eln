import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en";
import { setLabelsLang } from "@/lib/labels";

export type Lang = "zh" | "en";

const STORAGE_KEY = "biomap-lang";

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** 以中文原文为 key 查英文翻译；支持 {var} 插值 */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "zh",
  setLang: () => {},
  t: (k) => k,
});

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return saved === "en" ? "en" : "zh";
  });

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    setLabelsLang(lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      if (lang === "zh") return interpolate(key, vars);
      const hit = en[key];
      return interpolate(hit ?? key, vars);
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/** 非 React 场景（如契约层函数）按语言取文案 */
export function pickLang(lang: Lang, zhText: string): string {
  if (lang === "zh") return zhText;
  return en[zhText] ?? zhText;
}
