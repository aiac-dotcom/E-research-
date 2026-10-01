import { cn } from "@/lib/utils";
import { useState } from "react";
import { Loader2, Search, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { OUTPUT_TYPES, OA_LABELS, ACTIVITY_GROUPS, CREDIT_ROLES, SDGS } from "@/lib/vocab";
import { Field, NativeSelect, inputCls } from "./common";

export type OutputPayload = {
  type: string; title: string; abstract?: string | null; publicationYear?: number | null; publicationDate?: string | null;
  venue?: string | null; publisher?: string | null; volume?: string | null; issue?: string | null; pages?: string | null;
  doi?: string | null; isbn?: string | null; issn?: string | null; url?: string | null; language?: string | null;
  oaStatus?: string; keywords?: string[]; sdgs?: number[]; authors?: { name: string; orcid?: string | null; position?: number; countries?: string[] }[];
  collabCountries?: string[]; citationCount?: number; externalIds?: Record<string, string>; authorPosition?: number | null;
  isCorresponding?: boolean; creditRoles?: string[]; visibility?: string;
};

const emptyOutput: OutputPayload = { type: "journal_article", title: "", authors: [{ name: "" }], oaStatus: "unknown", keywords: [], sdgs: [], creditRoles: [], visibility: "public" };

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function OutputForm({ initial, submitLabel = "Submit for approval", onSubmit, busy, selfName }: {
  initial?: OutputPayload; submitLabel?: string; onSubmit: (p: OutputPayload, source: string) => void; busy?: boolean; selfName?: string;
}) {
  const [p, setP] = useState<OutputPayload>(() => ({ ...emptyOutput, ...initial, authors: initial?.authors?.length ? initial.authors : [{ name: selfName ?? "" }] }));
  const [doiQuery, setDoiQuery] = useState(initial?.doi ?? "");
  const [looking, setLooking] = useState(false);
  const [source, setSource] = useState("manual");
  const set = (patch: Partial<OutputPayload>) => setP((x) => ({ ...x, ...patch }));

  async function lookup() {
    if (!doiQuery.trim()) return;
    setLooking(true);
    try {
      const w = await api<OutputPayload>(`/lookup/doi?doi=${encodeURIComponent(doiQuery.trim())}`);
      setP({ ...emptyOutput, ...w, creditRoles: p.creditRoles, visibility: p.visibility });
      setSource("doi_lookup");
      toast.success("Metadata filled from the DOI. Please check it before submitting.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  const authors = p.authors ?? [];
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...p, authors: authors.filter((a) => a.name.trim()) }, source);
      }}
    >
      <div className="rounded-lg border bg-muted/40 p-4">
        <Field label="Start from a DOI (recommended)" hint="Metadata is fetched from OpenAlex / Crossref. You can still edit everything.">
          <div className="flex gap-2">
            <Input value={doiQuery} onChange={(e) => setDoiQuery(e.target.value)} placeholder="10.1109/ACCESS.2024.1234567 or https://doi.org/…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookup(); } }} />
            <Button type="button" variant="secondary" onClick={lookup} disabled={looking}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
            </Button>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Output type">
          <NativeSelect value={p.type} onChange={(v) => set({ type: v })}>
            {Object.entries(OUTPUT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Year">
          <Input type="number" min={1900} max={2100} value={p.publicationYear ?? ""} onChange={(e) => set({ publicationYear: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Open access">
          <NativeSelect value={p.oaStatus ?? "unknown"} onChange={(v) => set({ oaStatus: v })}>
            {Object.entries(OA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Title *"><Input required value={p.title} onChange={(e) => set({ title: e.target.value })} /></Field>

      <div className="space-y-2">
        <div className="text-sm font-medium">Authors (in order)</div>
        {authors.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
            <Input aria-label={`Author ${i + 1}`} value={a.name} onChange={(e) => set({ authors: authors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <label className="flex items-center gap-1 whitespace-nowrap text-xs">
              <input type="radio" name="me" checked={p.authorPosition === i + 1} onChange={() => set({ authorPosition: i + 1 })} /> This is me
            </label>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove author" onClick={() => set({ authors: authors.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set({ authors: [...authors, { name: "" }] })}>
          <Plus className="h-4 w-4" /> Add author
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.type === "conference_paper" ? "Conference / proceedings" : p.type === "book_chapter" ? "Book title" : "Journal / venue"}>
          <Input value={p.venue ?? ""} onChange={(e) => set({ venue: e.target.value })} />
        </Field>
        <Field label="Publisher"><Input value={p.publisher ?? ""} onChange={(e) => set({ publisher: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Volume"><Input value={p.volume ?? ""} onChange={(e) => set({ volume: e.target.value })} /></Field>
        <Field label="Issue"><Input value={p.issue ?? ""} onChange={(e) => set({ issue: e.target.value })} /></Field>
        <Field label="Pages"><Input value={p.pages ?? ""} onChange={(e) => set({ pages: e.target.value })} /></Field>
        <Field label="ISSN / ISBN"><Input value={p.issn ?? p.isbn ?? ""} onChange={(e) => set(p.type.startsWith("book") ? { isbn: e.target.value } : { issn: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="DOI"><Input value={p.doi ?? ""} onChange={(e) => set({ doi: e.target.value })} placeholder="10.xxxx/…" /></Field>
        <Field label="URL"><Input type="url" value={p.url ?? ""} onChange={(e) => set({ url: e.target.value })} /></Field>
      </div>
      <Field label="Abstract"><Textarea rows={4} value={p.abstract ?? ""} onChange={(e) => set({ abstract: e.target.value })} /></Field>
      <Field label="Keywords" hint="Separate with commas">
        <Input value={(p.keywords ?? []).join(", ")} onChange={(e) => set({ keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">UN Sustainable Development Goals</legend>
        <div className="flex flex-wrap gap-1.5">
          {SDGS.map((s) => {
            const on = p.sdgs?.includes(s.n);
            return (
              <button type="button" key={s.n} title={s.title} aria-pressed={on}
                onClick={() => set({ sdgs: on ? p.sdgs!.filter((x) => x !== s.n) : [...(p.sdgs ?? []), s.n] })}
                className={`h-8 w-8 rounded text-xs font-bold transition ${on ? "text-white ring-2 ring-offset-2 ring-offset-background" : "bg-muted text-muted-foreground"}`}
                style={on ? { background: s.color, ["--tw-ring-color" as string]: s.color } : undefined}>
                {s.n}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">My contribution (CRediT roles)</legend>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {Object.entries(CREDIT_ROLES).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.creditRoles?.includes(k) ?? false}
                onChange={(e) => set({ creditRoles: e.target.checked ? [...(p.creditRoles ?? []), k] : (p.creditRoles ?? []).filter((r) => r !== k) })} />
              {v}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.isCorresponding ?? false} onChange={(e) => set({ isCorresponding: e.target.checked })} /> I am the corresponding author
        </label>
      </fieldset>

      <Field label="Visibility" className="max-w-xs">
        <NativeSelect value={p.visibility ?? "public"} onChange={(v) => set({ visibility: v })}>
          <option value="public">Public (profile & showcase)</option>
          <option value="internal">Internal only</option>
        </NativeSelect>
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !p.title.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}

export type ActivityPayload = {
  type: string; title: string; role?: string | null; description?: string | null; startDate?: string | null; endDate?: string | null;
  location?: string | null; country?: string | null; organisation?: string | null; url?: string | null; funder?: string | null;
  amount?: string | null; currency?: string | null; reference?: string | null; scope?: string | null; visibility?: string;
};

export function ActivityForm({ initial, submitLabel = "Submit for approval", onSubmit, busy }: {
  initial?: ActivityPayload; submitLabel?: string; onSubmit: (p: ActivityPayload) => void; busy?: boolean;
}) {
  const [p, setP] = useState<ActivityPayload>(() => ({ type: "conference_presentation", title: "", visibility: "public", ...initial }));
  const set = (patch: Partial<ActivityPayload>) => setP((x) => ({ ...x, ...patch }));
  const isGrant = p.type === "grant" || p.type === "consultancy";
  const isEvent = /seminar|conference|workshop|keynote|training/.test(p.type);
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit(p); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Activity type">
          <NativeSelect value={p.type} onChange={(v) => set({ type: v })}>
            {ACTIVITY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {Object.entries(g.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </optgroup>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Scope">
          <NativeSelect value={p.scope ?? ""} onChange={(v) => set({ scope: v || null })}>
            <option value="">—</option>
            <option value="internal">Internal</option>
            <option value="national">National</option>
            <option value="regional">Regional</option>
            <option value="international">International</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label={isGrant ? "Project title *" : isEvent ? "Event / talk title *" : "Title *"}>
        <Input required value={p.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="My role" hint={isGrant ? "e.g. Principal investigator, Co-investigator" : "e.g. Speaker, Chair, Attendee, Reviewer"}>
          <Input value={p.role ?? ""} onChange={(e) => set({ role: e.target.value })} />
        </Field>
        <Field label={isGrant ? "Funding body" : p.type === "award" ? "Awarding body" : "Organiser / organisation"}>
          <Input value={(isGrant ? p.funder : p.organisation) ?? ""} onChange={(e) => set(isGrant ? { funder: e.target.value } : { organisation: e.target.value })} />
        </Field>
      </div>
      {isGrant && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount"><Input type="number" min={0} step="0.01" value={p.amount ?? ""} onChange={(e) => set({ amount: e.target.value })} /></Field>
          <Field label="Currency"><Input value={p.currency ?? "OMR"} onChange={(e) => set({ currency: e.target.value })} maxLength={3} /></Field>
          <Field label="Grant reference"><Input value={p.reference ?? ""} onChange={(e) => set({ reference: e.target.value })} /></Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Start date"><Input type="date" value={p.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value })} /></Field>
        <Field label="End date"><Input type="date" value={p.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        <Field label="City / venue"><Input value={p.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label="Country"><Input value={p.country ?? ""} onChange={(e) => set({ country: e.target.value })} /></Field>
      </div>
      <Field label="Link (programme, certificate, news item)"><Input type="url" value={p.url ?? ""} onChange={(e) => set({ url: e.target.value })} /></Field>
      <Field label="Description"><Textarea rows={3} value={p.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Visibility" className="max-w-xs">
        <NativeSelect value={p.visibility ?? "public"} onChange={(v) => set({ visibility: v })}>
          <option value="public">Public (profile & showcase)</option>
          <option value="internal">Internal only</option>
        </NativeSelect>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !p.title.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
