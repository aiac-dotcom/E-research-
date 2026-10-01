import { useState } from "react";
import { Check, CornerUpLeft, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, OutputCitation, ActivityLine, Empty, Chip, StatusBadge, NativeSelect } from "@/components/research/common";
import { SubmissionTimeline } from "./portfolio";

type Item = {
  id: number; kind: "output" | "activity"; title: string; payload: any; source: string; targetId: number | null; status: string;
  personName: string; personEmail: string; unitName: string | null; submittedAt: string; route: string; reviewComment?: string | null; reviewedAt?: string;
};

function ReviewCard({ item, selected, onSelect }: { item: Item; selected: boolean; onSelect: (v: boolean) => void }) {
  const [comment, setComment] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const decide = useApiMutation(
    (decision: "approve" | "return" | "reject") => api(`/approvals/${item.id}`, { body: { decision, comment } }),
    () => toast.success("Decision recorded"),
  );
  const p = item.payload;
  return (
    <li className="flex gap-3 p-4">
      <input type="checkbox" className="mt-1" aria-label={`Select ${item.title}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{item.personName}</span>
          <span className="text-muted-foreground">{item.unitName ?? "No unit"}</span>
          <Chip>{item.kind === "output" ? "Publication" : "Activity"}</Chip>
          {item.targetId && <Chip>change to approved record</Chip>}
          {item.source !== "manual" && <Chip>source: {item.source.replace("_", " ")}</Chip>}
          {item.route !== "unit" && <Chip>{item.route === "admin" ? "no unit approver – admin" : "escalated from sub-unit"}</Chip>}
          <span className="text-xs text-muted-foreground">submitted {new Date(item.submittedAt).toLocaleDateString()}</span>
        </div>
        {item.kind === "output" ? (
          <>
            <OutputCitation o={p} highlight={p.authorPosition ? p.authors?.[p.authorPosition - 1]?.name : undefined} />
            <div className="text-xs text-muted-foreground">
              {p.authorPosition ? `Claims author position ${p.authorPosition}` : "Author position not indicated"}
              {p.creditRoles?.length ? ` · CRediT: ${p.creditRoles.join(", ").replace(/_/g, " ")}` : ""}
              {p.isCorresponding ? " · corresponding author" : ""}
              {p.visibility === "internal" ? " · internal only" : ""}
            </div>
            {p.abstract && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Abstract</summary><p className="mt-1">{p.abstract}</p></details>}
          </>
        ) : (
          <>
            <ActivityLine a={p} />
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            {p.reference && <div className="text-xs text-muted-foreground">Reference: {p.reference}</div>}
          </>
        )}
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment to the staff member (required to return or reject)" aria-label="Review comment" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide.mutate("approve")} disabled={decide.isPending}>
            {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve & store
          </Button>
          <Button size="sm" variant="outline" disabled={decide.isPending || !comment.trim()} onClick={() => decide.mutate("return")}>
            <CornerUpLeft className="h-4 w-4" /> Return for changes
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={decide.isPending || !comment.trim()} onClick={() => decide.mutate("reject")}>
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide" : "Show"} history</Button>
        </div>
        {showHistory && <SubmissionTimeline id={item.id} />}
      </div>
    </li>
  );
}

export default function Approvals() {
  const me = useMe().data;
  const q = useApi<Item[]>("/approvals");
  const history = useApi<Item[]>("/approvals?status=history");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState("all");
  const bulk = useApiMutation(() => api("/approvals-bulk", { body: { ids: [...picked], decision: "approve" } }), (r: any) => {
    toast.success(`${r.done} approved${r.errors.length ? `, ${r.errors.length} failed` : ""}`);
    setPicked(new Set());
  });
  const items = (q.data ?? []).filter((i) => kind === "all" || i.kind === kind);

  return (
    <div>
      <PageHeader
        title="Approvals"
        description={me?.approverPositions.length
          ? <>You approve as {me.approverPositions.map((p) => `${p.title}, ${p.unitName}`).join(" · ")}. Every holder of these positions sees the same queue; the first decision counts.</>
          : "Items routed to you as administrator."}
      />
      <Tabs defaultValue="queue" className="px-6 py-5">
        <TabsList>
          <TabsTrigger value="queue">Waiting ({q.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="history">My decisions</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect value={kind} onChange={setKind} ariaLabel="Type" className="w-44">
              <option value="all">All types</option>
              <option value="output">Publications</option>
              <option value="activity">Activities</option>
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={items.length > 0 && picked.size === items.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} /> Select all
            </label>
            <Button size="sm" disabled={!picked.size || bulk.isPending} onClick={() => bulk.mutate(undefined)}>
              <Check className="h-4 w-4" /> Approve {picked.size || ""} selected
            </Button>
          </div>
          {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : items.length === 0 ? <Empty title="Queue is empty">Nothing is waiting for your decision.</Empty> : (
            <ul className="divide-y rounded-lg border">
              {items.map((i) => (
                <ReviewCard key={i.id} item={i} selected={picked.has(i.id)}
                  onSelect={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(i.id); else n.delete(i.id); return n; })} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          {(history.data ?? []).length === 0 ? <Empty title="No decisions yet" /> : (
            <ul className="divide-y rounded-lg border">
              {history.data!.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <StatusBadge status={i.status} />
                  <span className="font-medium">{i.title}</span>
                  <span className="text-muted-foreground">{i.personName}</span>
                  {i.reviewComment && <span className="text-muted-foreground">“{i.reviewComment}”</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{i.reviewedAt && new Date(i.reviewedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
