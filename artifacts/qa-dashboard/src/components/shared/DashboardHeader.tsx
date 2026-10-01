import { useState, useRef, useEffect } from "react";
import { RefreshCw, ChevronDown, Check } from "lucide-react";
import { DATA_SOURCES } from "@/lib/constants";

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  lastRefreshedAt?: string | null;
  onRefresh?: () => void;
  loading?: boolean;
  onIntervalChange?: (ms: number | null) => void;
}

const INTERVAL_OPTIONS = [
  { label: "Off", ms: null },
  { label: "Every 1 min", ms: 1 * 60 * 1000 },
  { label: "Every 5 min", ms: 5 * 60 * 1000 },
  { label: "Every 15 min", ms: 15 * 60 * 1000 },
  { label: "Every 1 hour", ms: 60 * 60 * 1000 },
];

export function DashboardHeader({ title, subtitle, lastRefreshedAt, onRefresh, loading, onIntervalChange }: DashboardHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (loading) {
      setIsSpinning(true);
    } else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleIntervalSelect = (ms: number | null) => {
    setSelectedIntervalMs(ms);
    setDropdownOpen(false);
    if (onIntervalChange) {
      onIntervalChange(ms);
    }
  };

  const lastRefreshed = lastRefreshedAt
    ? (() => {
        const d = new Date(lastRefreshedAt);
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${time} on ${date}`;
      })()
    : null;

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
      <div className="pt-2">
        <h1 className="font-bold text-[32px] tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1.5 text-[14px]">{subtitle}</p>
        
        {DATA_SOURCES.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[12px] text-muted-foreground shrink-0">
              Data Sources:
            </span>
            {DATA_SOURCES.map((source) => (
              <span
                key={source}
                className="text-[12px] font-bold rounded px-2 py-0.5 truncate print:!bg-[rgb(229,231,235)] print:!text-[rgb(75,85,99)]"
                title={source}
                style={{
                  maxWidth: "20ch",
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgb(229, 231, 235)",
                  color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)",
                }}
              >
                {source}
              </span>
            ))}
          </div>
        )}
        
        {lastRefreshed && <p className="text-[12px] text-muted-foreground mt-2">Last refresh: {lastRefreshed}</p>}
      </div>

      {onRefresh && (
        <div className="flex items-center gap-3 pt-2 print:hidden relative" ref={dropdownRef}>
          <div
            className="flex items-center rounded-[6px] overflow-hidden h-[32px] text-[13px] border shadow-sm"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF",
              color: isDark ? "#e5e7eb" : "#374151",
              borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb"
            }}
          >
            <button 
              onClick={onRefresh} 
              disabled={loading} 
              className="flex items-center gap-1.5 px-3 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="w-px h-5 shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)" }} />
            <button 
              onClick={() => setDropdownOpen((o) => !o)} 
              className={`flex items-center justify-center px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${dropdownOpen ? 'bg-black/5 dark:bg-white/10' : ''}`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {dropdownOpen && (
            <div className="absolute right-0 top-[36px] w-48 rounded-md border bg-popover text-popover-foreground shadow-md outline-none z-50 py-1 text-sm">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b mb-1">
                Auto-Refresh Interval
              </div>
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-muted transition-colors"
                  onClick={() => handleIntervalSelect(opt.ms)}
                >
                  <span>{opt.label}</span>
                  {selectedIntervalMs === opt.ms && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
