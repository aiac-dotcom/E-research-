import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { FlaskConical, Sun, Moon } from "lucide-react";
import { useDarkMode } from "./AppLayout";
import { useService } from "@/lib/services";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useDarkMode();
  const [location] = useLocation();
  const showcase = useService("showcase");
  const profiles = useService("profiles");
  const link = (href: string, label: string) => (
    <Link href={href} className={`text-sm ${location.startsWith(href) ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>
  );
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><FlaskConical className="h-4 w-4" aria-hidden /></span>
            <span className="hidden sm:inline">{import.meta.env.VITE_INSTITUTION_NAME || "E-Research"}</span>
          </Link>
          <nav className="flex items-center gap-5" aria-label="Public">
            {showcase && link("/showcase", "Showcase")}
            {profiles && link("/researchers", "Researchers")}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setIsDark(!isDark)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Toggle dark mode">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link href="/sign-in" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Staff sign in</Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
