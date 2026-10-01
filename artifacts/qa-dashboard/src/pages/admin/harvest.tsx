import { useState } from "react";
import { useSearch } from "wouter";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, useApi, useApiMutation, useDebounced } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, Empty, inputCls, Chip } from "@/components/research/common";
import { HarvestWizard } from "@/components/research/HarvestWizard";

export default function HarvestAdmin() {
  const search = new URLSearchParams(useSearch());
  const me = useMe().data;
  const [personId, setPersonId] = useState<number | null>(Number(search.get("personId")) || null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const people = useApi<any[]>(dq.length >= 2 ? `/people?q=${encodeURIComponent(dq)}` : null);
  const person = useApi<any[]>(personId ? `/people?inactive=1` : null).data?.find((p) => p.id === personId);
  const runs = useApi<any[]>("/harvest/runs");
  const refresh = useApiMutation(() => api("/admin/harvest/refresh-citations", { body: {} }), (r: any) => toast.success(`${r.updated} citation counts refreshed`));

  return (
    <div>
      <PageHeader title="Harvest publications"
        description="Search external bibliographic databases by name, choose the right author profiles, and import records into a staff member’s portfolio for confirmation and manager approval."
        actions={me?.person.systemRole === "admin" && (
          <Button variant="outline" onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh citation counts
          </Button>
        )} />
      <div className="grid gap-6 px-6 py-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium">Staff member</div>
            {person ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div><div className="font-medium">{person.fullName}</div><div className="text-sm text-muted-foreground">{person.email} · {person.unitName ?? "no unit"}</div></div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPersonId(null)}>Change</Button>
              </div>
            ) : (
              <>
                <input className={inputCls} placeholder="Search staff by name or email…" aria-label="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
                <ul className="divide-y rounded-md border">
                  {(people.data ?? []).map((p) => (
                    <li key={p.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setPersonId(p.id)}>
                      <span className="font-medium">{p.fullName}</span> <span className="text-muted-foreground">{p.unitName ?? ""}</span>
                    </button></li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {person && <HarvestWizard key={person.id} person={person} canSendToApproval />}
        </div>
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Recent harvest runs</h2>
          {!runs.data?.length ? <Empty title="No runs yet" /> : (
            <ul className="divide-y rounded-lg border text-sm">
              {runs.data.slice(0, 25).map((r) => (
                <li key={r.id} className="space-y-1 p-3">
                  <div className="flex items-center justify-between"><span className="font-medium">{r.personName ?? "—"}</span><Chip>{r.trigger}</Chip></div>
                  <div className="text-xs text-muted-foreground">{r.providers.join(", ")} · {new Date(r.startedAt).toLocaleString()}</div>
                  <div className="text-xs">found {r.found} · new {r.created} · duplicates {r.duplicates}</div>
                  {r.errors?.length > 0 && <div className="text-xs text-amber-700 dark:text-amber-300">{r.errors.join("; ")}</div>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
