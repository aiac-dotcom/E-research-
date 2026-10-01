import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Check, X, Pencil, Trash2, Send, History, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useMe, type Person } from "@/lib/me";
import { useService } from "@/lib/services";
import { STATUS_LABELS } from "@/lib/vocab";
import { PageHeader, StatusBadge, OutputCitation, ActivityLine, Empty, Field, inputCls, Chip } from "@/components/research/common";
import { OutputForm, ActivityForm } from "@/components/research/forms";
import { HarvestWizard } from "@/components/research/HarvestWizard";

type Submission = {
  id: number; kind: "output" | "activity"; status: string; source: string; title: string; payload: any; targetId: number | null;
  reviewComment: string | null; updatedAt: string; submittedAt: string | null;
};

export function SubmissionTimeline({ id }: { id: number }) {
  const q = useApi<any>(`/submissions/${id}`);
  if (!q.data) return <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Routed to: {q.data.route.people.map((p: any) => p.fullName).join(", ") || "system administrators"}
        {q.data.route.level === "escalated" && " (escalated to parent unit)"}
      </div>
      <ol className="space-y-2 border-l pl-4">
        {q.data.events.map((e: any) => (
          <li key={e.id} className="text-sm">
            <span className="font-medium capitalize">{e.action.replace("_", " ")}</span>
            {e.actorName && <> by {e.actorName}</>}
            <span className="text-muted-foreground"> · {new Date(e.createdAt).toLocaleString()}</span>
            {e.comment && <div className="mt-0.5 rounded bg-muted px-2 py-1 text-muted-foreground">“{e.comment}”</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SubmissionRow({ s, selectable, selected, onSelect, onEdit, onHistory }: {
  s: Submission; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void; onEdit: () => void; onHistory: () => void;
}) {
  const claim = useApiMutation(() => api(`/submissions/${s.id}/claim`, { body: {} }), () => toast.success("Sent to your manager for approval"));
  const dismiss = useApiMutation(() => api(`/submissions/${s.id}/dismiss`, { body: {} }), () => toast.success("Dismissed"));
  const withdraw = useApiMutation(() => api(`/submissions/${s.id}`, { method: "DELETE" }), () => toast.success("Withdrawn"));
  const resubmit = useApiMutation(() => api(`/submissions/${s.id}/resubmit`, { body: {} }), () => toast.success("Resubmitted"));
  return (
    <li className="flex gap-3 p-4">
      {selectable && <input type="checkbox" className="mt-1" aria-label={`Select ${s.title}`} checked={selected} onChange={(e) => onSelect?.(e.target.checked)} />}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} />
          {s.targetId && <Chip>change request</Chip>}
          {s.source !== "manual" && <Chip>via {s.source.replace("_", " ")}</Chip>}
          <span className="text-xs text-muted-foreground">updated {new Date(s.updatedAt).toLocaleDateString()}</span>
        </div>
        {s.kind === "output" ? <OutputCitation o={s.payload} highlight={s.payload.authorPosition ? s.payload.authors?.[s.payload.authorPosition - 1]?.name : undefined} />
          : <ActivityLine a={s.payload} />}
        {s.reviewComment && s.status !== "approved" && (
          <div className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950 dark:text-orange-200">Manager comment: {s.reviewComment}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {s.status === "candidate" && <>
            <Button size="sm" onClick={() => claim.mutate(undefined)} disabled={claim.isPending}><Check className="h-4 w-4" /> Yes, this is mine</Button>
            <Button size="sm" variant="outline" onClick={() => dismiss.mutate(undefined)} disabled={dismiss.isPending}><X className="h-4 w-4" /> Not mine</Button>
          </>}
          {["candidate", "pending", "returned"].includes(s.status) && (
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
          )}
          {s.status === "returned" && (
            <Button size="sm" onClick={() => resubmit.mutate(undefined)} disabled={resubmit.isPending}><Send className="h-4 w-4" /> Resubmit</Button>
          )}
          {["pending", "returned"].includes(s.status) && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Withdraw this submission?")) withdraw.mutate(undefined); }}><Trash2 className="h-4 w-4" /> Withdraw</Button>
          )}
          {s.status !== "candidate" && <Button size="sm" variant="ghost" onClick={onHistory}><History className="h-4 w-4" /> History</Button>}
        </div>
      </div>
    </li>
  );
}

function ProfileSettings({ person }: { person: Person }) {
  const [p, setP] = useState(() => ({
    honorific: person.honorific ?? "", fullNameAr: person.fullNameAr ?? "", bio: person.bio ?? "",
    researchInterests: person.researchInterests.join(", "), nameVariants: person.nameVariants.join(", "),
    orcid: person.orcid ?? "", scopusAuthorId: person.scopusAuthorId ?? "", wosResearcherId: person.wosResearcherId ?? "",
    openalexAuthorId: person.openalexAuthorId ?? "", googleScholarId: person.googleScholarId ?? "",
    semanticScholarId: person.semanticScholarId ?? "", website: person.website ?? "", photoUrl: person.photoUrl ?? "",
    profilePublic: person.profilePublic,
  }));
  const save = useApiMutation(() => api("/me/profile", { method: "PUT", body: p }), () => toast.success("Profile saved"));
  const set = (k: string, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const inp = (k: keyof typeof p, label: string, hint?: string) => (
    <Field label={label} hint={hint}><input className={inputCls} value={String(p[k])} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <form className="max-w-3xl space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        {inp("honorific", "Title", "e.g. Dr., Prof.")}
        <div className="sm:col-span-2">{inp("fullNameAr", "Name in Arabic")}</div>
      </div>
      <Field label="Biography"><Textarea rows={4} value={p.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
      {inp("researchInterests", "Research interests", "Comma separated")}
      {inp("nameVariants", "Name variants used in publications", "e.g. A. Al-Hinai, Ahmed Alhinai — improves automatic matching")}
      <div className="rounded-lg border p-4">
        <div className="mb-3 text-sm font-medium">Persistent identifiers</div>
        <div className="grid gap-4 sm:grid-cols-2">
          {inp("orcid", "ORCID iD", "0000-0000-0000-0000 — the most reliable way to harvest your works")}
          {inp("scopusAuthorId", "Scopus Author ID")}
          {inp("wosResearcherId", "Web of Science ResearcherID")}
          {inp("openalexAuthorId", "OpenAlex author ID", "e.g. A5023888391")}
          {inp("googleScholarId", "Google Scholar user ID")}
          {inp("semanticScholarId", "Semantic Scholar author ID")}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {inp("website", "Personal website")}
        {inp("photoUrl", "Photo URL")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.profilePublic} onChange={(e) => set("profilePublic", e.target.checked)} /> Show my public profile page
      </label>
      <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</Button>
    </form>
  );
}

export default function Portfolio() {
  const meQ = useMe();
  const me = meQ.data;
  const outputsOn = useService("research_repository");
  const activitiesOn = useService("activities");
  const harvestOn = useService("harvesting");
  const profilesOn = useService("profiles");
  const subsQ = useApi<Submission[]>(me ? "/submissions/mine" : null);
  const [tab, setTab] = useState("work");
  const [statusFilter, setStatusFilter] = useState("open");
  const [editing, setEditing] = useState<Submission | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const create = useApiMutation((v: { kind: string; payload: any; source?: string }) => api("/submissions", { body: v }), () => {
    toast.success("Submitted. Your manager has been asked to approve it.");
    setTab("work");
  });
  const update = useApiMutation((v: { id: number; payload: any }) => api(`/submissions/${v.id}`, { method: "PUT", body: { payload: v.payload } }), () => {
    toast.success("Saved");
    setEditing(null);
  });
  const bulk = useApiMutation((action: "claim" | "dismiss") => api("/submissions/claim-bulk", { body: { ids: [...picked], action } }), (r: any) => {
    toast.success(`${r.done} updated`);
    setPicked(new Set());
  });

  const subs = subsQ.data ?? [];
  const candidates = subs.filter((s) => s.status === "candidate");
  const filtered = useMemo(() => subs.filter((s) => s.status !== "candidate" && (
    statusFilter === "all" ? true : statusFilter === "open" ? ["pending", "returned"].includes(s.status) : s.status === statusFilter)), [subs, statusFilter]);

  if (meQ.isLoading) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!me) return <div className="p-8"><Empty title="No staff profile">{(meQ.error as Error)?.message}</Empty></div>;

  const counts = me.mySubmissionCounts;
  return (
    <div>
      <PageHeader
        title={`Welcome, ${me.person.honorific ? me.person.honorific + " " : ""}${me.person.fullName}`}
        description={<>
          {me.unit ? <>{me.unit.name} · </> : <>Not yet assigned to a unit · </>}
          Submissions are reviewed by {me.myApprovers.people.map((p) => p.fullName).join(", ") || "the system administrators"}
          {me.myApprovers.level === "escalated" && " (escalated)"}
        </>}
        actions={profilesOn && <Link href={`/researchers/${me.person.slug}`}><Button variant="outline"><ExternalLink className="h-4 w-4" /> View my profile page</Button></Link>}
      />
      <div className="grid grid-cols-2 gap-3 px-6 pt-5 sm:grid-cols-4">
        {[["candidate", "To confirm"], ["pending", "Awaiting approval"], ["returned", "Need changes"], ["approved", "Approved"]].map(([k, l]) => (
          <div key={k} className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">{l}</div>
            <div className="text-2xl font-semibold">{counts[k] ?? 0}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="px-6 py-5">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="work">My submissions</TabsTrigger>
          {outputsOn && <TabsTrigger value="candidates">To confirm {candidates.length ? `(${candidates.length})` : ""}</TabsTrigger>}
          {outputsOn && <TabsTrigger value="add-output">Add publication</TabsTrigger>}
          {activitiesOn && <TabsTrigger value="add-activity">Add activity</TabsTrigger>}
          {outputsOn && harvestOn && <TabsTrigger value="find">Find my publications</TabsTrigger>}
          <TabsTrigger value="profile">Profile & identifiers</TabsTrigger>
        </TabsList>

        <TabsContent value="work" className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {["open", "approved", "rejected", "dismissed", "all"].map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                {s === "open" ? "In progress" : s === "all" ? "All" : STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {filtered.length === 0 ? <Empty title="Nothing here">Add a publication or activity, or confirm harvested records.</Empty> : (
            <ul className="divide-y rounded-lg border">
              {filtered.map((s) => <SubmissionRow key={s.id} s={s} onEdit={() => setEditing(s)} onHistory={() => setHistory(s.id)} />)}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="candidates" className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            These records were found in external databases. Confirm the ones you authored; they are then sent to your manager.
          </p>
          {candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.size === candidates.length}
                  onChange={(e) => setPicked(e.target.checked ? new Set(candidates.map((c) => c.id)) : new Set())} /> Select all
              </label>
              <Button size="sm" disabled={!picked.size || bulk.isPending} onClick={() => bulk.mutate("claim")}>Confirm {picked.size} selected</Button>
              <Button size="sm" variant="outline" disabled={!picked.size || bulk.isPending} onClick={() => bulk.mutate("dismiss")}>Dismiss selected</Button>
            </div>
          )}
          {candidates.length === 0 ? <Empty title="No records waiting">Use “Find my publications” to search OpenAlex, ORCID, Crossref and other sources.</Empty> : (
            <ul className="divide-y rounded-lg border">
              {candidates.map((s) => (
                <SubmissionRow key={s.id} s={s} selectable selected={picked.has(s.id)}
                  onSelect={(v) => setPicked((x) => { const n = new Set(x); if (v) n.add(s.id); else n.delete(s.id); return n; })}
                  onEdit={() => setEditing(s)} onHistory={() => setHistory(s.id)} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="add-output" className="mt-5 max-w-4xl">
          <OutputForm selfName={me.person.fullName} busy={create.isPending} onSubmit={(payload, source) => create.mutate({ kind: "output", payload, source })} />
        </TabsContent>
        <TabsContent value="add-activity" className="mt-5 max-w-4xl">
          <ActivityForm busy={create.isPending} onSubmit={(payload) => create.mutate({ kind: "activity", payload })} />
        </TabsContent>
        <TabsContent value="find" className="mt-5 max-w-5xl">
          <HarvestWizard person={me.person} />
        </TabsContent>
        <TabsContent value="profile" className="mt-5">
          <ProfileSettings person={me.person} />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit {editing?.kind === "activity" ? "activity" : "publication"}</DialogTitle></DialogHeader>
          {editing?.kind === "output" && <OutputForm initial={editing.payload} submitLabel="Save changes" busy={update.isPending} onSubmit={(payload) => update.mutate({ id: editing.id, payload })} />}
          {editing?.kind === "activity" && <ActivityForm initial={editing.payload} submitLabel="Save changes" busy={update.isPending} onSubmit={(payload) => update.mutate({ id: editing.id, payload })} />}
        </DialogContent>
      </Dialog>
      <Dialog open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approval history</DialogTitle></DialogHeader>
          {history !== null && <SubmissionTimeline id={history} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CommentBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Textarea rows={2} placeholder="Comment (required to return or reject)" value={value} onChange={(e) => onChange(e.target.value)} />;
}
