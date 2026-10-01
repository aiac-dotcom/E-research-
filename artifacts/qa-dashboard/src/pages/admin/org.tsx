import { cn } from "@/lib/utils";
import { useState } from "react";
import { Plus, Loader2, Trash2, UserPlus, X, ShieldCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, useApi, useApiMutation } from "@/lib/api";
import { UNIT_TYPES } from "@/lib/vocab";
import { PageHeader, Empty, Field, NativeSelect, inputCls, Chip } from "@/components/research/common";
import { orderTree, type Unit } from "@/components/research/UnitSelect";

type UnitRow = Unit & { nameAr: string | null; code: string | null; rorId: string | null; description: string | null; website: string | null; memberCount: number; positionCount: number; active: boolean };

function UnitForm({ initial, units, onDone }: { initial?: Partial<UnitRow>; units: UnitRow[]; onDone: () => void }) {
  const [u, setU] = useState<Partial<UnitRow>>({ type: "department", active: true, ...initial });
  const save = useApiMutation(
    () => (initial?.id ? api(`/admin/org/units/${initial.id}`, { method: "PUT", body: u }) : api("/admin/org/units", { body: u })),
    () => { toast.success("Saved"); onDone(); },
  );
  const set = (k: keyof UnitRow, v: unknown) => setU((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <NativeSelect value={u.type ?? "department"} onChange={(v) => set("type", v)}>
            {Object.entries(UNIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Parent">
          <NativeSelect value={u.parentId ? String(u.parentId) : ""} onChange={(v) => set("parentId", v ? Number(v) : null)}>
            <option value="">— top level —</option>
            {orderTree(units).filter((x) => x.id !== initial?.id).map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.depth)}{x.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Name *"><input required className={inputCls} value={u.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Name (Arabic)"><input dir="rtl" className={inputCls} value={u.nameAr ?? ""} onChange={(e) => set("nameAr", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Short unique code used in staff imports, e.g. CS"><input className={inputCls} value={u.code ?? ""} onChange={(e) => set("code", e.target.value)} /></Field>
        <Field label="ROR ID" hint="Research Organization Registry (for the university)"><input className={inputCls} value={u.rorId ?? ""} onChange={(e) => set("rorId", e.target.value)} /></Field>
      </div>
      <Field label="Website"><input className={inputCls} value={u.website ?? ""} onChange={(e) => set("website", e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={u.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active</label>
      <div className="flex justify-end"><Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button></div>
    </form>
  );
}

function PersonPicker({ onPick, exclude = [] }: { onPick: (id: number) => void; exclude?: number[] }) {
  const [q, setQ] = useState("");
  const res = useApi<any[]>(q.length >= 2 ? `/people?q=${encodeURIComponent(q)}` : null);
  return (
    <div className="space-y-2">
      <input className={inputCls} placeholder="Type a name or email…" aria-label="Find person" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {(res.data ?? []).filter((p) => !exclude.includes(p.id)).map((p) => (
          <li key={p.id}>
            <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => onPick(p.id)}>
              <span className="font-medium">{p.fullName}</span> <span className="text-muted-foreground">{p.email} · {p.unitName ?? "no unit"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitDetail({ id, units, onEdit }: { id: number; units: UnitRow[]; onEdit: () => void }) {
  const q = useApi<any>(`/org/units/${id}`);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("unit");
  const [assignTo, setAssignTo] = useState<number | null>(null);
  const addPos = useApiMutation(() => api(`/admin/org/units/${id}/positions`, { body: { title, approvalScope: scope, isApprover: true } }), () => setTitle(""));
  const delPos = useApiMutation((pid: number) => api(`/admin/positions/${pid}`, { method: "DELETE" }));
  const togglePos = useApiMutation((v: { id: number; body: any }) => api(`/admin/positions/${v.id}`, { method: "PUT", body: v.body }));
  const assign = useApiMutation((personId: number) => api(`/admin/positions/${assignTo}/assignments`, { body: { personId } }), () => { toast.success("Assigned"); setAssignTo(null); });
  const unassign = useApiMutation((aid: number) => api(`/admin/assignments/${aid}`, { method: "DELETE" }));
  const delUnit = useApiMutation(() => api(`/admin/org/units/${id}`, { method: "DELETE" }), () => toast.success("Unit deleted"));
  if (!q.data) return <Loader2 className="h-5 w-5 animate-spin" />;
  const { unit, positions, members, approvalRoute } = q.data;
  const parent = units.find((u) => u.id === unit.parentId);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{unit.name}</h2><Chip>{UNIT_TYPES[unit.type]}</Chip>{!unit.active && <Chip>inactive</Chip>}</div>
          <div className="text-sm text-muted-foreground">{[unit.code, parent && `in ${parent.name}`, unit.nameAr].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>Edit unit</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this unit?")) delUnit.mutate(undefined, { onError: (e) => toast.error(e.message) }); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" aria-hidden /> Who approves submissions from this unit</div>
        <div className="mt-1 text-muted-foreground">
          {approvalRoute.people.length ? approvalRoute.people.map((p: any) => p.fullName).join(", ") : "Nobody — items go to system administrators"}
          {approvalRoute.level === "escalated" && " (no approver here; escalated to a parent unit)"}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold">Positions</h3>
        <p className="text-sm text-muted-foreground">
          Add a position (e.g. Head of Department, Dean, Research Coordinator) and assign one or more people. All holders of an approver
          position can approve — the first decision counts. “Whole subtree” lets a dean also approve for every department below.
        </p>
        {positions.length === 0 && <Empty title="No positions yet" />}
        <ul className="space-y-3">
          {positions.map((p: any) => (
            <li key={p.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.title}</span>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.isApprover} onChange={(e) => togglePos.mutate({ id: p.id, body: { isApprover: e.target.checked } })} /> approver</label>
                <NativeSelect value={p.approvalScope} onChange={(v) => togglePos.mutate({ id: p.id, body: { approvalScope: v } })} ariaLabel="Approval scope" className="h-7 w-40 text-xs">
                  <option value="unit">This unit only</option>
                  <option value="subtree">Whole subtree</option>
                </NativeSelect>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setAssignTo(p.id)}><UserPlus className="h-4 w-4" /> Assign</Button>
                  <Button size="sm" variant="ghost" aria-label="Delete position" onClick={() => { if (confirm("Delete position and its assignments?")) delPos.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.holders.length === 0 && <li className="text-sm text-muted-foreground">Vacant</li>}
                {p.holders.map((h: any) => (
                  <li key={h.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                    {h.fullName}
                    <button aria-label={`Remove ${h.fullName}`} className="rounded-full p-0.5 hover:bg-background" onClick={() => unassign.mutate(h.id)}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) addPos.mutate(undefined); }}>
          <input className={cn(inputCls, "w-64")} placeholder="New position title" aria-label="New position title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <NativeSelect value={scope} onChange={setScope} ariaLabel="Scope" className="w-40"><option value="unit">This unit only</option><option value="subtree">Whole subtree</option></NativeSelect>
          <Button type="submit" variant="secondary" disabled={!title.trim()}><Plus className="h-4 w-4" /> Add position</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Members ({members.length})</h3>
        {members.length === 0 ? <div className="text-sm text-muted-foreground">No staff assigned. Assign people from “People & roles”.</div> : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {members.map((m: any) => <li key={m.id}>{m.fullName} <span className="text-muted-foreground">{m.academicRank ?? m.jobTitle ?? ""}</span></li>)}
          </ul>
        )}
      </section>

      <Dialog open={assignTo !== null} onOpenChange={(o) => !o && setAssignTo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign person to position</DialogTitle></DialogHeader>
          <PersonPicker onPick={(pid) => assign.mutate(pid)} exclude={positions.find((p: any) => p.id === assignTo)?.holders.map((h: any) => h.personId) ?? []} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrgAdmin() {
  const q = useApi<UnitRow[]>("/org/units");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<UnitRow> | null>(null);
  const units = q.data ?? [];
  const tree = orderTree(units);
  return (
    <div>
      <PageHeader title="Organisation structure" description="Colleges, departments, units and centres; positions and who holds them. Approval routing follows this structure."
        actions={<Button onClick={() => setEditing({ type: units.length ? "department" : "university", parentId: selected })}><Plus className="h-4 w-4" /> New unit</Button>} />
      <div className="grid gap-6 px-6 py-5 lg:grid-cols-[22rem_1fr]">
        <div className="rounded-lg border">
          {tree.length === 0 ? <div className="p-4"><Empty title="No units yet">Start with the university, then add colleges, departments and units.</Empty></div> : (
            <ul className="py-1">
              {tree.map((u) => (
                <li key={u.id}>
                  <button onClick={() => setSelected(u.id)} aria-current={selected === u.id}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted ${selected === u.id ? "bg-muted font-medium" : ""} ${u.active ? "" : "opacity-50"}`}
                    style={{ paddingLeft: 12 + u.depth * 16 }}>
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.memberCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>{selected ? <UnitDetail key={selected} id={selected} units={units} onEdit={() => setEditing(units.find((u) => u.id === selected) ?? null)} /> : <Empty title="Select a unit">Choose a unit on the left to manage its positions and members.</Empty>}</div>
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit unit" : "New unit"}</DialogTitle></DialogHeader>
          {editing && <UnitForm initial={editing} units={units} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
