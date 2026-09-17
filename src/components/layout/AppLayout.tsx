import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FlaskConical,
  LayoutDashboard,
  FolderKanban,
  NotebookPen,
  Dna,
  TestTubes,
  Snowflake,
  History,
  Search,
  LogOut,
  Menu,
  X,
  Network,
  MonitorCog,
  Bot,
  Handshake,
  Cpu,
  ClipboardList,
  PlayCircle,
} from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { AuthLayoutSkeleton } from "../AuthLayoutSkeleton";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

const Copilot = lazy(() => import("../copilot/Copilot"));

const NAV_GROUPS = [
  {
    label: "工作台",
    items: [
      { icon: LayoutDashboard, label: "仪表盘", path: "/" },
      { icon: PlayCircle, label: "实验运行", path: "/runs" },
      { icon: Bot, label: "Lab Agent", path: "/lab-agent" },
      { icon: Cpu, label: "仪器属性智能体", path: "/instrument-agent" },
      { icon: History, label: "活动日志", path: "/activity" },
    ],
  },
  {
    label: "研究",
    items: [
      { icon: FolderKanban, label: "项目管理", path: "/projects" },
      { icon: NotebookPen, label: "实验记录本", path: "/experiments" },
      { icon: Network, label: "BioFlow 工作流", path: "/workflows" },
      { icon: ClipboardList, label: "样品请求与履约", path: "/sample-requests" },
      { icon: Handshake, label: "外部委托", path: "/external-orders" },
      { icon: Dna, label: "序列库", path: "/sequences" },
    ],
  },
  {
    label: "资源",
    items: [
      { icon: TestTubes, label: "样本库存", path: "/samples" },
      { icon: Snowflake, label: "存储管理", path: "/storage" },
      { icon: MonitorCog, label: "设备管理", path: "/equipment" },
    ],
  },
];

function isActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname.startsWith(path);
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchQ, setSearchQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) return <AuthLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher className="border-white/15 text-slate-300 hover:text-white hover:bg-white/10" />
        </div>
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-teal-500 flex items-center justify-center">
              <FlaskConical className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">BioMap OS</h1>
              <p className="text-xs text-slate-400">{t("LIMS · ELN 实验室信息平台")}</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 text-center max-w-sm">
            {t("登录以访问实验室项目、电子实验记录、样本库存与存储管理系统。")}
          </p>
          <Button
            onClick={() => (window.location.href = LOGIN_PATH)}
            size="lg"
            className="w-full bg-teal-600 hover:bg-teal-500"
          >
            {t("登录继续")}
          </Button>
        </div>
      </div>
    );
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-teal-500 flex items-center justify-center shrink-0">
          <FlaskConical className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white tracking-tight leading-none">BioMap OS</div>
          <div className="text-[10px] text-slate-500 mt-1 tracking-wider">LIMS · ELN SUITE</div>
        </div>
      </div>
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {t(group.label)}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(location.pathname, item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-teal-500/15 text-teal-300 font-medium"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 shrink-0", active && "text-teal-400")} />
                    {t(item.label)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* User */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors w-full text-left">
              <Avatar className="h-8 w-8 border border-white/10 shrink-0">
                <AvatarFallback className="bg-teal-600 text-white text-xs">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate leading-none">
                  {user?.name || t("用户")}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-1">{user?.email || ""}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t("退出登录")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 bg-slate-950">{sidebar}</aside>
      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-950">
            <button
              className="absolute right-3 top-4 text-slate-400"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 shrink-0 border-b bg-white flex items-center gap-4 px-4 md:px-6 sticky top-0 z-30">
          <button className="md:hidden text-slate-600" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="relative flex-1 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQ.trim()) {
                navigate(`/search?q=${encodeURIComponent(searchQ.trim())}`);
                setSearchQ("");
              }
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("全局搜索：实验 / 样本 / 项目 / 序列…")}
              className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-teal-500"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {t("系统在线")}
            </div>
            <Avatar className="h-8 w-8 border">
              <AvatarFallback className="bg-teal-600 text-white text-xs">
                {user?.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-[1400px] mx-auto">{children}</div>
        </main>
      </div>
      <Toaster richColors position="top-right" />
      <Suspense fallback={null}>
        <Copilot />
      </Suspense>
    </div>
  );
}
