import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ExternalLink, Lock, Unlock } from "lucide-react";
import { OUTPUT_TYPES, OA_LABELS, STATUS_LABELS, ACTIVITY_TYPES, SDGS } from "@/lib/vocab";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  candidate: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  returned: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  dismissed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-muted"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground ${className}`}>{children}</span>;
}

export function OaBadge({ status }: { status: string }) {
  if (!status || status === "unknown") return null;
  const open = status !== "closed";
  return (
    <Chip className={open ? "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300" : ""}>
      {open ? <Unlock className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
      {OA_LABELS[status]} {open ? "open access" : ""}
    </Chip>
  );
}

export function SdgDots({ sdgs }: { sdgs: number[] }) {
  if (!sdgs?.length) return null;
  return (
    <span className="inline-flex gap-1">
      {sdgs.map((n) => {
        const s = SDGS[n - 1];
        return (
          <span key={n} title={`SDG ${n}: ${s?.title}`} className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-white" style={{ background: s?.color }}>
            {n}
          </span>
        );
      })}
    </span>
  );
}

export type OutputLike = {
  id?: number; type: string; title: string; authors?: { name: string; personId?: number | null }[]; publicationYear?: number | null;
  venue?: string | null; volume?: string | null; issue?: string | null; pages?: string | null; doi?: string | null; url?: string | null;
  oaStatus?: string; citationCount?: number; sdgs?: number[];
  internalAuthors?: { personId: number; fullName: string; slug: string }[];
};

/** One reference, APA-like, with identifiers and badges. */
export function OutputCitation({ o, highlight, actions }: { o: OutputLike; highlight?: string; actions?: ReactNode }) {
  const authors = o.authors ?? [];
  const shown = authors.slice(0, 8).map((a) => a.name);
  const internal = new Set((o.internalAuthors ?? []).map((a) => a.fullName));
  const link = o.doi ? `https://doi.org/${o.doi}` : o.url;
  return (
    <div className="space-y-1">
      <div className="font-medium leading-snug">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="hover:underline">{o.title}</a>
        ) : o.title}
      </div>
      {authors.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {shown.map((n, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <span className={n === highlight || internal.has(n) ? "font-semibold text-foreground" : ""}>{n}</span>
            </span>
          ))}
          {authors.length > 8 && ` … +${authors.length - 8} more`}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {[o.venue && <em key="v">{o.venue}</em>, o.volume && `${o.volume}${o.issue ? `(${o.issue})` : ""}`, o.pages, o.publicationYear]
            .filter(Boolean)
            .map((x, i) => <span key={i}>{i > 0 && " · "}{x}</span>)}
        </span>
        <Chip>{OUTPUT_TYPES[o.type] ?? o.type}</Chip>
        {o.oaStatus && <OaBadge status={o.oaStatus} />}
        {typeof o.citationCount === "number" && o.citationCount > 0 && <Chip>{o.citationCount} citations</Chip>}
        <SdgDots sdgs={o.sdgs ?? []} />
        {o.doi && (
          <a href={`https://doi.org/${o.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            doi:{o.doi} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
        {actions}
      </div>
    </div>
  );
}

export type ActivityLike = {
  type: string; title: string; role?: string | null; organisation?: string | null; location?: string | null; country?: string | null;
  startDate?: string | null; endDate?: string | null; funder?: string | null; amount?: string | null; currency?: string | null;
  scope?: string | null; url?: string | null; personName?: string;
};

export function ActivityLine({ a, showPerson }: { a: ActivityLike; showPerson?: boolean }) {
  const dates = [a.startDate, a.endDate && a.endDate !== a.startDate ? a.endDate : null].filter(Boolean).join(" – ");
  return (
    <div className="space-y-1">
      <div className="font-medium leading-snug">
        {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">{a.title}</a> : a.title}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <Chip>{ACTIVITY_TYPES[a.type] ?? a.type}</Chip>
        {showPerson && a.personName && <span className="font-medium text-foreground">{a.personName}</span>}
        {a.role && <span>{a.role}</span>}
        {(a.organisation || a.funder) && <span>{a.organisation ?? a.funder}</span>}
        {(a.location || a.country) && <span>{[a.location, a.country].filter(Boolean).join(", ")}</span>}
        {a.amount && <span>{Number(a.amount).toLocaleString()} {a.currency}</span>}
        {a.scope && <Chip className="capitalize">{a.scope}</Chip>}
        {dates && <span>{dates}</span>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function NativeSelect({ value, onChange, children, ariaLabel, className = "" }: {
  value: string; onChange: (v: string) => void; children: ReactNode; ariaLabel?: string; className?: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, className)}>
      {children}
    </select>
  );
}
