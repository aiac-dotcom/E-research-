import { useState } from "react";
import { Loader2, Search, DownloadCloud, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, useApi, useApiMutation } from "@/lib/api";
import { Chip, Empty, OutputCitation, inputCls } from "./common";

type Provider = { key: string; name: string; paid: boolean; configured: boolean; enabled: boolean; hint: string; idField: string | null };
type Candidate = { provider: string; id: string; name: string; orcid?: string | null; affiliation?: string | null; worksCount?: number | null; citedByCount?: number | null; topics?: string[]; url?: string | null };
type Work = any;

/**
 * Find a person's publications in external sources:
 * 1) search author identities by name, 2) choose the right ones, 3) preview, 4) import as candidates.
 */
export function HarvestWizard({ person, canSendToApproval }: {
  person: { id: number; fullName: string; orcid?: string | null; openalexAuthorId?: string | null; scopusAuthorId?: string | null };
  canSendToApproval?: boolean;
}) {
  const providersQ = useApi<Provider[]>("/harvest/providers");
  const [name, setName] = useState(person.fullName);
  const [chosenProviders, setChosenProviders] = useState<string[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, Candidate>>({});
  const [works, setWorks] = useState<Work[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"" | "search" | "preview" | "import">("");
  const [linkIds, setLinkIds] = useState(true);

  const usable = (providersQ.data ?? []).filter((p) => p.configured && p.enabled);
  const activeProviders = chosenProviders ?? usable.map((p) => p.key);

  const runStored = useApiMutation(() => api(`/harvest/run/${person.id}`, { body: { personId: person.id } }), (r: any) => {
    if (r.errors?.length) toast.warning(r.errors.join(" · "));
    toast.success(`Found ${r.found} records: ${r.created} new candidates, ${r.duplicates} already known.`);
  });

  async function search() {
    setBusy("search");
    setWorks(null);
    setSelected({});
    try {
      const r = await api<{ results: Candidate[]; errors: string[] }>(`/harvest/authors?name=${encodeURIComponent(name)}&providers=${activeProviders.join(",")}`);
      setCandidates(r.results);
      setErrors(r.errors);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function preview() {
    setBusy("preview");
    try {
      const sources = Object.values(selected).map((c) => ({ provider: c.provider, id: c.id }));
      if (linkIds) {
        for (const c of Object.values(selected)) {
          if (["openalex", "orcid", "semantic_scholar", "scopus"].includes(c.provider)) {
            await api("/harvest/link", { body: { personId: person.id, provider: c.provider, id: c.id, orcid: c.orcid } }).catch(() => {});
          }
        }
      }
      const r = await api<{ works: Work[]; errors: string[] }>("/harvest/preview", { body: { personId: person.id, sources } });
      setWorks(r.works);
      setErrors(r.errors);
      setPicked(new Set(r.works.map((w, i) => (w.duplicate ? -1 : i)).filter((i) => i >= 0)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const importMut = useApiMutation(
    (status: "candidate" | "pending") =>
      api("/harvest/import", { body: { personId: person.id, status, works: works!.filter((_, i) => picked.has(i)) } }),
    (r: any) => {
      toast.success(`${r.created} records imported${r.duplicates ? `, ${r.duplicates} skipped as duplicates` : ""}.`);
      setWorks(null);
      setCandidates(null);
    },
  );

  const hasStoredIds = Boolean(person.orcid || person.openalexAuthorId || person.scopusAuthorId);

  return (
    <div className="space-y-6">
      {hasStoredIds && (
        <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium">Quick refresh from linked identifiers</div>
            <div className="text-muted-foreground">
              {[person.orcid && `ORCID ${person.orcid}`, person.openalexAuthorId && `OpenAlex ${person.openalexAuthorId}`, person.scopusAuthorId && `Scopus ${person.scopusAuthorId}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <Button variant="secondary" onClick={() => runStored.mutate(undefined)} disabled={runStored.isPending}>
            {runStored.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Harvest now
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm font-medium">1 · Search author profiles by name</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-label="Author name"
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }} />
          <Button onClick={search} disabled={busy !== "" || name.trim().length < 3}>
            {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {(providersQ.data ?? []).map((p) => (
            <label key={p.key} className={`flex items-center gap-1.5 ${!p.configured || !p.enabled ? "opacity-50" : ""}`} title={p.hint}>
              <input type="checkbox" disabled={!p.configured || !p.enabled} checked={activeProviders.includes(p.key)}
                onChange={(e) => setChosenProviders(e.target.checked ? [...activeProviders, p.key] : activeProviders.filter((k) => k !== p.key))} />
              {p.name} {p.paid && <Chip>paid</Chip>} {!p.configured && <span className="text-xs">(no API key)</span>}
            </label>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>
        </div>
      )}

      {candidates && !works && (
        <div className="space-y-3">
          <div className="text-sm font-medium">2 · Choose the profiles that belong to {person.fullName}</div>
          {candidates.length === 0 ? <Empty title="No author profiles found">Try another spelling or an Arabic/transliterated variant.</Empty> : (
            <ul className="divide-y rounded-lg border">
              {candidates.map((c) => {
                const key = `${c.provider}:${c.id}`;
                return (
                  <li key={key} className="flex items-start gap-3 p-3">
                    <input type="checkbox" className="mt-1" aria-label={`Select ${c.name} (${c.provider})`} checked={Boolean(selected[key])}
                      onChange={(e) => setSelected((s) => {
                        const n = { ...s };
                        if (e.target.checked) n[key] = c; else delete n[key];
                        return n;
                      })} />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Chip>{c.provider.replace("_", " ")}</Chip>
                        {c.orcid && <Chip>ORCID {c.orcid}</Chip>}
                        {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-primary" aria-label="Open profile"><ExternalLink className="h-3.5 w-3.5" /></a>}
                      </div>
                      <div className="text-muted-foreground">
                        {[c.affiliation, c.worksCount != null && `${c.worksCount} works`, c.citedByCount != null && `${c.citedByCount} citations`].filter(Boolean).join(" · ")}
                      </div>
                      {c.topics?.length ? <div className="text-xs text-muted-foreground">{c.topics.join(" · ")}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={linkIds} onChange={(e) => setLinkIds(e.target.checked)} />
              Save chosen identifiers to the profile (enables automatic harvesting)
            </label>
            <Button onClick={preview} disabled={!Object.keys(selected).length || busy !== ""}>
              {busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" />} Fetch publications
            </Button>
          </div>
        </div>
      )}

      {works && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">3 · Review {works.length} records ({picked.size} selected)</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set(works.map((w, i) => (w.duplicate ? -1 : i)).filter((i) => i >= 0)))}>Select new</Button>
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set())}>Clear</Button>
            </div>
          </div>
          <ul className="max-h-[520px] divide-y overflow-y-auto rounded-lg border">
            {works.map((w, i) => (
              <li key={i} className={`flex gap-3 p-3 ${w.duplicate ? "opacity-60" : ""}`}>
                <input type="checkbox" className="mt-1" aria-label={`Select ${w.title}`} disabled={w.duplicate} checked={picked.has(i)}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                <div className="min-w-0 flex-1">
                  <OutputCitation o={w} highlight={w.authorPosition ? w.authors?.[w.authorPosition - 1]?.name : undefined}
                    actions={<>
                      {(w.providers ?? [w.provider]).map((p: string) => <Chip key={p}>{p.replace("_", " ")}</Chip>)}
                      {w.duplicate && <Chip className="border-emerald-300"><CheckCircle2 className="h-3 w-3" /> already in portfolio</Chip>}
                      {!w.authorPosition && !w.duplicate && <Chip className="border-amber-300">author name not matched</Chip>}
                    </>} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            {canSendToApproval && (
              <Button variant="secondary" disabled={!picked.size || importMut.isPending} onClick={() => importMut.mutate("pending")}>
                Import & send to approval
              </Button>
            )}
            <Button disabled={!picked.size || importMut.isPending} onClick={() => importMut.mutate("candidate")}>
              {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              Import {picked.size} for confirmation
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Imported records appear under “To confirm” in the person’s portfolio. Once confirmed they go to the direct manager; only approved
            records are stored permanently and shown on the profile.
          </p>
        </div>
      )}
    </div>
  );
}
