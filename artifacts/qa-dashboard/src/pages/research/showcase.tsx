import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Table2, BarChart3, Award, Landmark, Mic2, Quote, Globe2, Unlock, Users, BookOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "@/lib/api";
import { SDGS, fmt, pct, OA_LABELS } from "@/lib/vocab";
import { ActivityLine, OutputCitation, Empty } from "@/components/research/common";
import { UnitSelect } from "@/components/research/UnitSelect";
import { useViz, VizTooltip, Legend } from "@/components/research/viz";

const GROUPS = ["Journal articles", "Conference papers", "Books & chapters", "Other outputs"];
const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (c: string) => {
  try {
    return regionNames?.of(c) ?? c;
  } catch {
    return c;
  }
};

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Award; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" aria-hidden />{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bar list: one series, one colour, value at the bar tip. */
function BarList({ rows, color, onSelect }: { rows: { label: string; value: number; id?: number }[]; color: string; onSelect?: (id: number) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="text-sm text-muted-foreground">No data yet.</div>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
          {onSelect && r.id ? (
            <button className="truncate text-left hover:underline" onClick={() => onSelect(r.id!)} title={r.label}>{r.label}</button>
          ) : <span className="truncate" title={r.label}>{r.label}</span>}
          <div className="flex items-center gap-2" title={`${r.label}: ${r.value.toLocaleString()}`}>
            <div className="h-3 rounded-r-[4px]" style={{ width: `${(r.value / max) * 85}%`, minWidth: r.value ? 3 : 0, background: color }} />
            <span className="tabular-nums text-muted-foreground">{r.value.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Showcase() {
  const [unitId, setUnitId] = useState("");
  const [table, setTable] = useState(false);
  const viz = useViz();
  const q = useApi<any>(`/public/showcase${unitId ? `?unitId=${unitId}` : ""}`, { placeholderData: (p: any) => p });
  const d = q.data;
  const instName = import.meta.env.VITE_INSTITUTION_NAME || "Our University";

  const yearRows = useMemo(() => {
    if (!d) return [];
    const years = [...new Set<number>(d.byYear.map((r: any) => r.year))].sort();
    return years.map((y) => {
      const row: any = { year: String(y) };
      for (const g of GROUPS) row[g] = d.byYear.find((r: any) => r.year === y && r.grp === g)?.n ?? 0;
      row.total = GROUPS.reduce((a, g) => a + row[g], 0);
      return row;
    });
  }, [d]);
  const presentGroups = GROUPS.filter((g) => yearRows.some((r) => r[g] > 0));

  if (!d && q.isLoading) return <div className="p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!d) return <div className="p-10"><Empty title="Showcase unavailable">{(q.error as Error)?.message}</Empty></div>;
  const k = d.kpis;
  const sdgMax = Math.max(1, ...d.sdgs.map((s: any) => s.n));
  const funding = k.funding.map((f: any) => `${fmt(f.total)} ${f.currency}`).join(" + ") || "—";

  return (
    <div className={`mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 transition-opacity ${q.isFetching ? "opacity-70" : ""}`}>
      <header className="space-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Research at {instName}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{d.scope ? d.scope.name : "University research showcase"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UnitSelect value={unitId} onChange={setUnitId} source="/public/units" allLabel="Whole university" ariaLabel="Scope" className="w-full sm:w-80" />
          <span className="text-xs text-muted-foreground">Approved, public records only · updated {new Date(d.generatedAt).toLocaleString()}</span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <div className="flex flex-col justify-between rounded-xl border bg-card p-6">
          <div className="text-sm text-muted-foreground">Research outputs</div>
          <div className="text-6xl font-semibold tracking-tight">{fmt(k.outputs)}</div>
          <div className="text-sm text-muted-foreground">{fmt(k.outputs5y)} in the last five years · {fmt(k.activeResearchers)} active researchers of {fmt(k.staff)} staff</div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Tile icon={Quote} label="Citations" value={fmt(k.citations)} sub="OpenAlex / source counts" />
          <Tile icon={Unlock} label="Open access" value={pct(k.openAccessShare)} sub="of outputs with known status" />
          <Tile icon={Globe2} label="International co-authorship" value={pct(k.intlCollabShare)} sub="of outputs with affiliation data" />
          <Tile icon={Landmark} label="Research grants" value={fmt(k.grants)} sub={funding} />
          <Tile icon={Award} label="Awards & honours" value={fmt(k.awards)} />
          <Tile icon={Users} label="Researchers" value={fmt(k.activeResearchers)} sub="published in the last 5 years" />
        </div>
      </div>

      <Card
        title="Research output by year"
        subtitle="Last ten years, by output type"
        action={
          <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {table ? "Chart" : "Table"}
          </button>
        }
      >
        {yearRows.length === 0 ? <div className="text-sm text-muted-foreground">No dated outputs yet.</div> : table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4 font-medium">Year</th>{GROUPS.map((g) => <th key={g} className="py-2 pr-4 text-right font-medium">{g}</th>)}<th className="py-2 text-right font-medium">Total</th></tr></thead>
              <tbody>{yearRows.map((r) => <tr key={r.year} className="border-b last:border-0"><td className="py-1.5 pr-4">{r.year}</td>{GROUPS.map((g) => <td key={g} className="py-1.5 pr-4 text-right">{r[g]}</td>)}<td className="py-1.5 text-right font-medium">{r.total}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <>
            <Legend items={presentGroups.map((g) => ({ label: g, color: viz.series[GROUPS.indexOf(g)] }))} />
            <div className="mt-3 h-72">
              <ResponsiveContainer>
                <BarChart data={yearRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={viz.grid} />
                  <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: viz.axis }} tick={{ fill: viz.muted, fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: viz.muted, fontSize: 12 }} />
                  <Tooltip cursor={{ fill: viz.hover }} content={<VizTooltip />} />
                  {presentGroups.map((g, i) => (
                    <Bar key={g} dataKey={g} name={g} stackId="t" fill={viz.series[GROUPS.indexOf(g)]} maxBarSize={24}
                      stroke={viz.surface} strokeWidth={1}
                      radius={i === presentGroups.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={d.scope ? "By sub-unit" : "By college and unit"} subtitle="Approved outputs credited to staff in each unit">
          <BarList color={viz.series[0]} rows={d.byUnit.map((u: any) => ({ label: u.name, value: u.outputs, id: u.unitId }))} onSelect={(id) => setUnitId(String(id))} />
        </Card>
        <Card title="Open access" subtitle="Outputs by access route">
          <BarList color={viz.series[0]} rows={["gold", "diamond", "green", "hybrid", "bronze", "closed", "unknown"]
            .map((s) => ({ label: OA_LABELS[s], value: d.oa.find((o: any) => o.status === s)?.n ?? 0 }))
            .filter((r) => r.value > 0)} />
        </Card>
      </div>

      <Card title="Contribution to the UN Sustainable Development Goals" subtitle="Outputs mapped to each SDG (from OpenAlex classification or author tagging)">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {SDGS.map((s) => {
            const n = d.sdgs.find((x: any) => x.sdg === s.n)?.n ?? 0;
            return (
              <li key={s.n} className="overflow-hidden rounded-lg border" title={`SDG ${s.n} ${s.title}: ${n} outputs`}>
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-white" style={{ background: s.color, opacity: n ? 1 : 0.35 }}>
                  <span className="text-sm">{s.n}</span><span className="truncate font-medium">{s.title}</span>
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-lg font-semibold tabular-nums">{n}</div>
                  <div className="mt-1 h-1 rounded bg-muted"><div className="h-1 rounded" style={{ width: `${(n / sdgMax) * 100}%`, background: viz.series[0] }} /></div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="International collaboration" subtitle={`Co-author countries (excluding ${countryName(d.homeCountry)})`}>
          <BarList color={viz.series[0]} rows={d.countries.map((c: any) => ({ label: countryName(c.country), value: c.n }))} />
        </Card>
        <Card title="Research themes" subtitle="Most frequent keywords">
          {d.keywords.length === 0 ? <div className="text-sm text-muted-foreground">No data yet.</div> : (
            <ul className="flex flex-wrap gap-2">
              {d.keywords.map((kw: any) => (
                <li key={kw.keyword} className="rounded-full border px-3 py-1 text-sm">
                  {kw.keyword} <span className="tabular-nums text-muted-foreground">{kw.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Highlighted research" subtitle={d.highlights.length ? "Featured or most-cited recent outputs" : undefined}>
        {d.highlights.length === 0 ? <div className="text-sm text-muted-foreground">No outputs yet.</div> : (
          <ul className="grid gap-5 md:grid-cols-2">
            {d.highlights.map((o: any) => (
              <li key={o.id} className="rounded-lg border p-4">
                <OutputCitation o={o} />
                {o.internalAuthors?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {o.internalAuthors.map((a: any) => <Link key={a.personId} href={`/researchers/${a.slug}`} className="text-primary hover:underline">{a.fullName}</Link>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { title: "Recent awards", icon: Award, items: d.awards },
          { title: "Research grants", icon: Landmark, items: d.grants },
          { title: "Talks & conferences", icon: Mic2, items: d.events },
        ].map((s) => (
          <Card key={s.title} title={s.title}>
            {s.items.length === 0 ? <div className="text-sm text-muted-foreground">Nothing to show yet.</div> : (
              <ul className="space-y-4">
                {s.items.map((a: any) => <li key={a.id}><ActivityLine a={a} showPerson /></li>)}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span><BookOpen className="mr-1 inline h-3.5 w-3.5" aria-hidden />Every record is approved by the staff member’s line manager before publication. Metrics follow Snowball Metrics definitions.</span>
        <Link href="/researchers" className="text-primary hover:underline">Browse researchers →</Link>
      </footer>
    </div>
  );
}
