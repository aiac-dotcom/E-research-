import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { Download, Loader2, Globe2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl, useApi, useDebounced } from "@/lib/api";
import { useService } from "@/lib/services";
import { ACTIVITY_GROUPS, OUTPUT_TYPES, fmt } from "@/lib/vocab";
import { PageHeader, OutputCitation, ActivityLine, Empty, inputCls, Chip } from "@/components/research/common";
import { UnitSelect } from "@/components/research/UnitSelect";
import { useViz, VizTooltip } from "@/components/research/viz";

function Initials({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary" style={{ width: size, height: size, fontSize: size / 2.8 }} aria-hidden>
      {ini}
    </span>
  );
}

export function PeopleDirectory({ basePath = "/researchers" }: { basePath?: string }) {
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState("");
  const dq = useDebounced(q);
  const params = new URLSearchParams(Object.entries({ q: dq, unitId }).filter(([, v]) => v) as [string, string][]);
  const res = useApi<any[]>(`/public/people?${params}`, { placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Researchers" description="Academic staff profiles with their approved publications and activities." />
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap gap-2">
          <input className={cn(inputCls, "w-72")} placeholder="Search name or research interest…" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          <UnitSelect value={unitId} onChange={setUnitId} source="/public/units" className="w-72" />
        </div>
        {res.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !res.data?.length ? <Empty title="No researchers found" /> : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {res.data.map((p) => (
              <li key={p.id}>
                <Link href={`${basePath}/${p.slug}`} className="flex h-full gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50">
                  <Initials name={p.fullName} url={p.photoUrl} />
                  <div className="min-w-0">
                    <div className="font-medium">{p.honorific ? `${p.honorific} ` : ""}{p.fullName}</div>
                    <div className="text-sm text-muted-foreground">{[p.academicRank, p.unitName].filter(Boolean).join(" · ")}</div>
                    {p.researchInterests?.length > 0 && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.researchInterests.join(" · ")}</div>}
                    <div className="mt-2 text-xs"><span className="font-semibold">{p.outputs}</span> <span className="text-muted-foreground">public outputs</span></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const exportsOn = useService("exports");
  const q = useApi<any>(`/public/people/${slug}`, { retry: false });
  const viz = useViz();
  if (q.isLoading) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!q.data) return <div className="p-8"><Empty title="Profile not found">This profile does not exist or is not public.</Empty></div>;
  const { person, unitPath, outputs, activities, metrics, services } = q.data;
  const byType = outputs.reduce((acc: Record<string, number>, o: any) => ({ ...acc, [o.type]: (acc[o.type] ?? 0) + 1 }), {});
  const ids = [
    person.orcid && { label: "ORCID", href: `https://orcid.org/${person.orcid}` },
    person.scopusAuthorId && { label: "Scopus", href: `https://www.scopus.com/authid/detail.uri?authorId=${person.scopusAuthorId}` },
    person.googleScholarId && { label: "Google Scholar", href: `https://scholar.google.com/citations?user=${person.googleScholarId}` },
    person.wosResearcherId && { label: "Web of Science", href: `https://www.webofscience.com/wos/author/record/${person.wosResearcherId}` },
    person.openalexAuthorId && { label: "OpenAlex", href: `https://openalex.org/${person.openalexAuthorId}` },
  ].filter(Boolean) as { label: string; href: string }[];
  const yearGroups = outputs.reduce((acc: Record<string, any[]>, o: any) => {
    const y = String(o.publicationYear ?? "Undated");
    (acc[y] ||= []).push(o);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-5 border-b px-6 py-8 sm:flex-row">
        <Initials name={person.fullName} url={person.photoUrl} size={96} />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{person.honorific ? `${person.honorific} ` : ""}{person.fullName}</h1>
          {person.fullNameAr && <div className="text-lg text-muted-foreground" dir="rtl" lang="ar">{person.fullNameAr}</div>}
          <div className="text-muted-foreground">{[person.academicRank, person.jobTitle].filter(Boolean).join(" · ")}</div>
          {unitPath.length > 0 && <div className="text-sm">{unitPath.map((u: any) => u.name).join(" › ")}</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            {ids.map((i) => <a key={i.label} href={i.href} target="_blank" rel="noreferrer"><Chip className="hover:bg-muted">{i.label}</Chip></a>)}
            {person.website && <a href={person.website} target="_blank" rel="noreferrer"><Chip className="hover:bg-muted"><Globe2 className="h-3 w-3" /> Website</Chip></a>}
          </div>
          {person.researchInterests?.length > 0 && <div className="text-sm"><span className="text-muted-foreground">Research interests: </span>{person.researchInterests.join(" · ")}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 pt-6 sm:grid-cols-4">
        {[["Research outputs", metrics.outputs], ["Citations", metrics.citations], ["h-index (in this repository)", metrics.hIndex], ["Open-access outputs", metrics.openAccess]].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">{l}</div>
            <div className="text-2xl font-semibold">{fmt(Number(v))}</div>
          </div>
        ))}
      </div>

      {person.bio && <p className="max-w-3xl px-6 pt-6 leading-relaxed">{person.bio}</p>}

      {metrics.byYear.length > 1 && (
        <figure className="px-6 pt-6">
          <figcaption className="mb-2 text-sm font-medium">Outputs per year</figcaption>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={metrics.byYear} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={viz.grid} />
                <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: viz.axis }} tick={{ fill: viz.muted, fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: viz.muted, fontSize: 12 }} />
                <Tooltip cursor={{ fill: viz.hover }} content={<VizTooltip />} />
                <Bar dataKey="n" name="Outputs" fill={viz.series[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}

      <Tabs defaultValue="outputs" className="px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            {services.outputs && <TabsTrigger value="outputs">Publications ({outputs.length})</TabsTrigger>}
            {services.activities && <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>}
          </TabsList>
          {exportsOn && outputs.length > 0 && (
            <div className="flex gap-2">
              {["bib", "ris", "csv"].map((f) => (
                <a key={f} href={apiUrl(`/public/people/${slug}/export/${f}`)}><Button size="sm" variant="outline"><Download className="h-4 w-4" /> {f.toUpperCase()}</Button></a>
              ))}
            </div>
          )}
        </div>
        <TabsContent value="outputs" className="mt-5 space-y-6">
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(byType).map(([t, n]) => <Chip key={t}>{OUTPUT_TYPES[t] ?? t}: {String(n)}</Chip>)}
          </div>
          {outputs.length === 0 ? <Empty title="No approved publications yet" /> :
            Object.entries(yearGroups).sort(([a], [b]) => b.localeCompare(a)).map(([year, items]) => (
              <section key={year}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{year}</h2>
                <ol className="space-y-4">
                  {(items as any[]).map((o) => <li key={o.id}><OutputCitation o={o} highlight={person.fullName} /></li>)}
                </ol>
              </section>
            ))}
        </TabsContent>
        <TabsContent value="activities" className="mt-5 space-y-6">
          {activities.length === 0 ? <Empty title="No approved activities yet" /> : ACTIVITY_GROUPS.map((g) => {
            const items = activities.filter((a: any) => a.type in g.types);
            if (!items.length) return null;
            return (
              <section key={g.label}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{g.label}</h2>
                <ul className="space-y-3">{items.map((a: any) => <li key={a.id}><ActivityLine a={a} /></li>)}</ul>
              </section>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

