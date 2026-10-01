import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen, CheckSquare, FolderSearch, Users, Sparkles, LayoutDashboard, GraduationCap, MapPin, Globe,
  Upload as UploadIcon, Building2, UserCog, DownloadCloud, ToggleRight, Sun, Moon, Printer, Menu, LogOut, FlaskConical,
} from "lucide-react";
import { useAuthUser } from "@/lib/auth";
import { useMe } from "@/lib/me";
import { useService } from "@/lib/services";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type NavItem = { href: string; label: string; icon: typeof BookOpen; show: boolean; badge?: number };

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem("eresearch.theme");
      if (saved) return saved === "dark";
    } catch {
      /* ignore */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("eresearch.theme", isDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [isDark]);
  return [isDark, setIsDark] as const;
}

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const me = useMe().data;
  const isAdmin = me?.person.systemRole === "admin";
  const svc = {
    repo: useService("research_repository"), ranking: useService("ranking"), showcase: useService("showcase"),
    harvest: useService("harvesting"), qa: useService("qa"), profiles: useService("profiles"),
  };
  const sections: { title: string; items: NavItem[] }[] = [
    { title: "Research", items: [
      { href: "/portfolio", label: "My portfolio", icon: BookOpen, show: true },
      { href: "/approvals", label: "Approvals", icon: CheckSquare, show: Boolean(me?.isApprover), badge: me?.toReview },
      { href: "/repository", label: "Repository", icon: FolderSearch, show: svc.repo },
      { href: "/researchers", label: "Researchers", icon: Users, show: svc.profiles },
      { href: "/showcase", label: "University showcase", icon: Sparkles, show: svc.showcase },
    ] },
    { title: "Rankings", items: [
      { href: "/dashboard", label: "Ranking overview", icon: LayoutDashboard, show: svc.ranking },
      { href: "/ranking", label: "QS ranking analysis", icon: GraduationCap, show: svc.ranking },
      { href: "/arab-ranking", label: "Arab rankings", icon: MapPin, show: svc.ranking },
      { href: "/world-ranking", label: "World rankings", icon: Globe, show: svc.ranking },
      { href: "/upload", label: "QA data upload", icon: UploadIcon, show: svc.qa },
    ] },
    { title: "Administration", items: [
      { href: "/admin/org", label: "Organisation", icon: Building2, show: isAdmin },
      { href: "/admin/people", label: "People & roles", icon: UserCog, show: isAdmin },
      { href: "/admin/harvest", label: "Harvest publications", icon: DownloadCloud, show: Boolean(me?.isApprover) && svc.harvest },
      { href: "/admin/services", label: "Services", icon: ToggleRight, show: isAdmin },
    ] },
  ];
  return (
    <nav className="flex flex-col gap-6 p-3" aria-label="Main">
      {sections.map((s) => {
        const items = s.items.filter((i) => i.show);
        if (!items.length) return null;
        return (
          <div key={s.title}>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = location === item.href || location.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        active ? "bg-sidebar-accent font-medium text-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/portfolio" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <FlaskConical className="h-4 w-4" aria-hidden />
      </span>
      <span>{import.meta.env.VITE_PLATFORM_NAME || "E-Research"}</span>
    </Link>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useDarkMode();
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuthUser();
  const me = useMe();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col print:hidden">
        <div className="flex h-14 items-center border-b border-sidebar-border px-5"><Brand /></div>
        <div className="flex-1 overflow-y-auto"><NavSections /></div>
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="flex h-14 items-center border-b px-5"><Brand /></SheetTitle>
          <NavSections onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur print:hidden">
          <button className="rounded-md p-2 hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden"><Brand /></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => window.print()} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Print or save as PDF" title="Print / PDF">
              <Printer className="h-4 w-4" />
            </button>
            <button onClick={() => setIsDark(!isDark)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Toggle dark mode">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="mx-1 h-6 w-px bg-border" />
            {user && (
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium leading-tight">{me.data?.person.fullName ?? user.name}</div>
                  <div className="text-xs leading-tight text-muted-foreground">{me.data?.unit?.name ?? user.email}</div>
                </div>
                <button onClick={signOut} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Sign out" title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>
        {me.error && (me.error as any).status === 403 && (
          <div className="border-b bg-amber-50 px-6 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="status">
            {(me.error as Error).message}
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
