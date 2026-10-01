import { cn } from "@/lib/utils";
import { useState } from "react";
import { Download, Star, EyeOff, Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, download, useApi, useApiMutation, useDebounced } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useService } from "@/lib/services";
import { OUTPUT_TYPES, OA_LABELS, ACTIVITY_GROUPS } from "@/lib/vocab";
import { PageHeader, OutputCitation, ActivityLine, Empty, NativeSelect, inputCls, Chip } from "@/components/research/common";
import { UnitSelect } from "@/components/research/UnitSelect";

function AdminTools({ kind, id, featured, visibility }: { kind: "outputs" | "activities"; id: number; featured: boolean; visibility: string }) {
  const patch = useApiMutation((body: any) => api(`/admin/${kind}/${id}`, { method: "PATCH", body }));
  const del = useApiMutation(() => api(`/admin/${kind}/${id}`, { method: "DELETE" }), () => toast.success("Deleted"));
  return (
    <span className="inline-flex gap-1">
      <button className={`rounded p-1 hover:bg-muted ${featured ? "text-amber-500" : "text-muted-foreground"}`} title={featured ? "Unfeature" : "Feature on showcase"}
        aria-label={featured ? "Unfeature" : "Feature on showcase"} onClick={() => patch.mutate({ featured: !featured })}>
        <Star className="h-4 w-4" fill={featured ? "currentColor" : "none"} />
      </button>
      <button className="rounded p-1 text-muted-foreground hover:bg-muted" title={visibility === "public" ? "Make internal" : "Make public"}
        aria-label={visibility === "public" ? "Make internal" : "Make public"} onClick={() => patch.mutate({ visibility: visibility === "public" ? "internal" : "public" })}>
        {visibility === "public" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <button className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Delete permanently" aria-label="Delete permanently"
        onClick={() => { if (confirm("Delete this record permanently?")) del.mutate(undefined); }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}

function Outputs() {
  const isAdmin = useMe().data?.person.systemRole === "admin";
  const exportsOn = useService("exports");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [unitId, setUnitId] = useState("");
  const [oa, setOa] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sort, setSort] = useState("year");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = new URLSearchParams(Object.entries({ q: dq, type, unitId, oa, yearFrom, yearTo, sort }).filter(([, v]) => v) as [string, string][]);
  const res = useApi<{ total: number; items: any[]; pageSize: number }>(`/outputs?${params}&page=${page}`, { placeholderData: (p) => p });
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={cn(inputCls, "w-64")} placeholder="Search title, author, journal, DOI…" aria-label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <NativeSelect value={type} onChange={reset(setType)} ariaLabel="Type" className="w-44">
          <option value="">All types</option>
          {Object.entries(OUTPUT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <UnitSelect value={unitId} onChange={reset(setUnitId)} className="w-64" />
        <NativeSelect value={oa} onChange={reset(setOa)} ariaLabel="Open access" className="w-40">
          <option value="">Any access</option>
          <option value="open">Open access (any)</option>
          {Object.entries(OA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <input className={cn(inputCls, "w-24")} type="number" placeholder="From" aria-label="Year from" value={yearFrom} onChange={(e) => reset(setYearFrom)(e.target.value)} />
        <input className={cn(inputCls, "w-24")} type="number" placeholder="To" aria-label="Year to" value={yearTo} onChange={(e) => reset(setYearTo)(e.target.value)} />
        <NativeSelect value={sort} onChange={setSort} ariaLabel="Sort" className="w-40">
          <option value="year">Newest first</option>
          <option value="citations">Most cited</option>
          <option value="title">Title A–Z</option>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{res.data ? `${res.data.total.toLocaleString()} approved outputs` : "Loading…"}</div>
        {exportsOn && (
          <div className="flex flex-wrap gap-2">
            {[["bib", "BibTeX"], ["ris", "RIS (EndNote/Zotero)"], ["csv", "CSV (Excel)"], ["json", "JSON"]].map(([f, l]) => (
              <Button key={f} size="sm" variant="outline" onClick={() => download(`/outputs-export/${f}?${params}`, `research-outputs.${f}`).catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" /> {l}
              </Button>
            ))}
          </div>
        )}
      </div>
      {res.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !res.data?.items.length ? <Empty title="No outputs match these filters" /> : (
        <ul className={`divide-y rounded-lg border transition-opacity ${res.isFetching ? "opacity-60" : ""}`}>
          {res.data.items.map((o) => (
            <li key={o.id} className="p-4">
              <OutputCitation o={o} actions={<>
                {o.internalAuthors?.map((a: any) => <a key={a.personId} href={`/researchers/${a.slug}`} className="text-xs text-primary hover:underline">{a.fullName}</a>)}
                {o.visibility === "internal" && <Chip>internal</Chip>}
                {isAdmin && <AdminTools kind="outputs" id={o.id} featured={o.featured} visibility={o.visibility} />}
              </>} />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function Activities() {
  const isAdmin = useMe().data?.person.systemRole === "admin";
  const [group, setGroup] = useState("");
  const [unitId, setUnitId] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const types = group ? Object.keys(ACTIVITY_GROUPS.find((g) => g.label === group)?.types ?? {}).join(",") : "";
  const params = new URLSearchParams(Object.entries({ q: dq, type: types, unitId }).filter(([, v]) => v) as [string, string][]);
  const res = useApi<any[]>(`/activities?${params}`, { placeholderData: (p) => p });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={cn(inputCls, "w-64")} placeholder="Search title, organisation, funder…" aria-label="Search activities" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect value={group} onChange={setGroup} ariaLabel="Category" className="w-52">
          <option value="">All categories</option>
          {ACTIVITY_GROUPS.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
        </NativeSelect>
        <UnitSelect value={unitId} onChange={setUnitId} className="w-64" />
      </div>
      {!res.data?.length ? <Empty title="No activities" /> : (
        <ul className="divide-y rounded-lg border">
          {res.data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1"><ActivityLine a={a} showPerson /></div>
              {a.visibility === "internal" && <Chip>internal</Chip>}
              {isAdmin && <AdminTools kind="activities" id={a.id} featured={a.featured} visibility={a.visibility} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Repository() {
  const activitiesOn = useService("activities");
  return (
    <div>
      <PageHeader title="Research repository" description="All approved research outputs and academic activities of the university. Only manager-approved records appear here." />
      <Tabs defaultValue="outputs" className="px-6 py-5">
        <TabsList>
          <TabsTrigger value="outputs">Research outputs</TabsTrigger>
          {activitiesOn && <TabsTrigger value="activities">Activities</TabsTrigger>}
        </TabsList>
        <TabsContent value="outputs" className="mt-5"><Outputs /></TabsContent>
        {activitiesOn && <TabsContent value="activities" className="mt-5"><Activities /></TabsContent>}
      </Tabs>
    </div>
  );
}
