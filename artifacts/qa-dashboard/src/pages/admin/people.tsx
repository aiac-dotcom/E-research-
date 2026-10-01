import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { Plus, Upload, Loader2, Pencil, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, parseCsv, useApi, useApiMutation, useDebounced } from "@/lib/api";
import { PageHeader, Empty, Field, NativeSelect, inputCls, Chip } from "@/components/research/common";
import { UnitSelect } from "@/components/research/UnitSelect";

const FIELDS: [string, string][] = [
  ["fullName", "Full name *"], ["email", "Email *"], ["honorific", "Title (Dr., Prof.)"], ["fullNameAr", "Name (Arabic)"],
  ["academicRank", "Academic rank"], ["jobTitle", "Job title"], ["staffNumber", "Staff number"], ["orcid", "ORCID iD"],
  ["scopusAuthorId", "Scopus Author ID"], ["wosResearcherId", "WoS ResearcherID"], ["openalexAuthorId", "OpenAlex ID"], ["googleScholarId", "Google Scholar ID"],
];

function PersonForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const [p, setP] = useState<any>({ systemRole: "staff", active: true, profilePublic: true, ...initial, orgUnitId: initial?.orgUnitId ?? "" });
  const save = useApiMutation(
    () => {
      const body = { ...p, orgUnitId: p.orgUnitId ? Number(p.orgUnitId) : null, nameVariants: typeof p.nameVariants === "string" ? p.nameVariants : (p.nameVariants ?? []).join(", ") };
      return initial?.id ? api(`/admin/people/${initial.id}`, { method: "PUT", body }) : api("/admin/people", { body });
    },
    () => { toast.success("Saved"); onDone(); },
  );
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined, { onError: (er) => toast.error(er.message) }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, l]) => (
          <Field key={k} label={l}><input className={inputCls} required={l.endsWith("*")} type={k === "email" ? "email" : "text"} value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
        ))}
      </div>
      <Field label="Name variants" hint="Comma separated, used to match harvested records"><input className={inputCls} value={Array.isArray(p.nameVariants) ? p.nameVariants.join(", ") : p.nameVariants ?? ""} onChange={(e) => setP({ ...p, nameVariants: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit (college / department / unit)"><UnitSelect value={String(p.orgUnitId ?? "")} onChange={(v) => setP({ ...p, orgUnitId: v })} allLabel="— none —" /></Field>
        <Field label="System role">
          <NativeSelect value={p.systemRole} onChange={(v) => setP({ ...p, systemRole: v })}>
            <option value="staff">Staff</option>
            <option value="admin">Administrator</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.profilePublic} onChange={(e) => setP({ ...p, profilePublic: e.target.checked })} /> Public profile</label>
      </div>
      <p className="text-xs text-muted-foreground">Approval rights come from positions (Organisation page), not from the system role.</p>
      <div className="flex justify-end"><Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button></div>
    </form>
  );
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("fullName,email,unitCode,academicRank,jobTitle,orcid,staffNumber\n");
  const [result, setResult] = useState<any>(null);
  const run = useApiMutation(() => {
    return api("/admin/people/import", { body: { rows: parseCsv(text) } });
  }, (r) => { setResult(r); toast.success(`${r.created} created, ${r.updated} updated`); });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste CSV (or upload a file) with a header row. Columns: <code>fullName, email</code> (required), <code>unitCode</code> (unit code or exact name),
        <code> academicRank, jobTitle, orcid, staffNumber, honorific</code>. Existing emails are updated.
      </p>
      <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      <Textarea rows={10} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} aria-label="CSV content" />
      {result?.errors?.length > 0 && <div className="max-h-32 overflow-y-auto rounded border border-amber-300 p-2 text-xs">{result.errors.map((e: string) => <div key={e}>{e}</div>)}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Close</Button>
        <Button onClick={() => run.mutate(undefined)} disabled={run.isPending}>{run.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Import</Button>
      </div>
    </div>
  );
}

export default function PeopleAdmin() {
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);
  const dq = useDebounced(q);
  const params = new URLSearchParams(Object.entries({ q: dq, unitId, inactive: inactive ? "1" : "" }).filter(([, v]) => v) as [string, string][]);
  const res = useApi<any[]>(`/people?${params}`, { placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="People & roles" description="Staff records, unit membership, identifiers and administrator rights."
        actions={<>
          <Button variant="outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import CSV</Button>
          <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add person</Button>
        </>} />
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <input className={cn(inputCls, "w-72")} placeholder="Search name or email…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <UnitSelect value={unitId} onChange={setUnitId} className="w-72" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Include inactive</label>
          <span className="ml-auto text-sm text-muted-foreground">{res.data?.length ?? 0} people</span>
        </div>
        {!res.data?.length ? <Empty title="No people" /> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Unit</th><th className="px-3 py-2 font-medium">Identifiers</th><th className="px-3 py-2 text-right font-medium">Outputs</th><th className="px-3 py-2 text-right font-medium">Activities</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {res.data.map((p) => (
                  <tr key={p.id} className={`border-t ${p.active ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.fullName} {p.systemRole === "admin" && <Chip>admin</Chip>}</div>
                      <div className="text-xs text-muted-foreground">{p.email}{p.academicRank ? ` · ${p.academicRank}` : ""}</div>
                    </td>
                    <td className="px-3 py-2">{p.unitName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{[p.orcid && "ORCID", p.scopusAuthorId && "Scopus", p.openalexAuthorId && "OpenAlex", p.wosResearcherId && "WoS"].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.outputCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.activityCount}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Link href={`/admin/harvest?personId=${p.id}`}><Button size="sm" variant="ghost" aria-label={`Harvest for ${p.fullName}`} title="Harvest publications"><DownloadCloud className="h-4 w-4" /></Button></Link>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${p.fullName}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? `Edit ${editing.fullName}` : "Add person"}</DialogTitle></DialogHeader>
          {editing && <PersonForm initial={editing.id ? editing : undefined} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Import staff from CSV</DialogTitle></DialogHeader>
          <ImportDialog onDone={() => setImporting(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
