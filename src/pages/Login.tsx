import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Dna,
  Eye,
  EyeOff,
  FlaskConical,
  LockKeyhole,
  Network,
  ShieldCheck,
  TestTubes,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

const CAPABILITIES = [
  { icon: FlaskConical, label: "项目、ELN、样本与设备数据统一管理" },
  { icon: Network, label: "实验数据全链路追溯" },
  { icon: ShieldCheck, label: "角色权限与审计记录" },
] as const;

export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/", { replace: true });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password || loginMutation.isPending) return;
    loginMutation.mutate({ username, password });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-teal-500/15 blur-3xl" />
        <div className="absolute -bottom-52 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="absolute right-5 top-5 z-20">
        <LanguageSwitcher className="border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg shadow-teal-950/50">
              <FlaskConical className="h-8 w-8" />
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight">BioMap OS</div>
              <div className="mt-1 text-xs font-medium tracking-[0.24em] text-teal-300">LIMS · ELN SUITE</div>
            </div>
          </div>

          <h1 className="max-w-xl text-5xl font-semibold leading-[1.12] tracking-tight text-slate-50">
            {t("合成生物学实验室的一体化操作系统")}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
            {t("登录以访问实验室项目、电子实验记录、样本库存与存储管理系统。")}
          </p>

          <div className="mt-10 grid max-w-xl gap-3">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.035] px-4 py-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className="text-sm text-slate-300">{t(label)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-bold">BioMap OS</div>
              <div className="text-[10px] tracking-[0.2em] text-teal-300">LIMS · ELN SUITE</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.065] p-1 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-[1.35rem] bg-slate-950/70 px-6 py-8 sm:px-8">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/20 bg-teal-400/10 text-teal-300">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">{t("欢迎回到 BioMap OS")}</h2>
                <p className="mt-2 text-sm text-slate-400">{t("使用 BioMap OS 账号登录")}</p>
              </div>

              <form className="space-y-5" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-200">{t("账号")}</Label>
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t("请输入账号")}
                    className="h-11 border-white/10 bg-white/[0.055] text-white placeholder:text-slate-600 focus-visible:border-teal-400/60 focus-visible:ring-teal-400/15"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200">{t("密码")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("请输入密码")}
                      className="h-11 border-white/10 bg-white/[0.055] pr-11 text-white placeholder:text-slate-600 focus-visible:border-teal-400/60 focus-visible:ring-teal-400/15"
                    />
                    <button
                      type="button"
                      aria-label={t(showPassword ? "隐藏密码" : "显示密码")}
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {loginMutation.error && (
                  <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200">
                    {t(loginMutation.error.message)}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={!username.trim() || !password || loginMutation.isPending}
                  className="h-11 w-full bg-teal-500 font-semibold text-slate-950 hover:bg-teal-400"
                >
                  {loginMutation.isPending ? t("正在登录…") : t("登录")}
                  {!loginMutation.isPending && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
              </form>

              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                {t("账号信息仅用于本系统身份验证")}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5"><Dna className="h-3.5 w-3.5" /> BioFlow</span>
            <span className="flex items-center gap-1.5"><TestTubes className="h-3.5 w-3.5" /> LIMS</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> ELN</span>
          </div>
        </section>
      </div>
    </main>
  );
}
