import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api, useApi, useApiMutation } from "@/lib/api";
import { PageHeader, Chip, inputCls } from "@/components/research/common";

type Svc = { key: string; name: string; description: string; group: string; enabled: boolean; dependsOn?: string[]; config: any };
type Prov = { key: string; name: string; paid: boolean; configured: boolean; enabled: boolean; hint: string };

export default function ServicesAdmin() {
  const q = useApi<{ services: Svc[]; providers: Prov[]; ai: { configured: boolean } }>("/admin/services");
  const put = useApiMutation((v: { key: string; body: any }) => api(`/admin/services/${v.key}`, { method: "PUT", body: v.body }), () => toast.success("Saved"));
  if (!q.data) return null;
  const { services, providers, ai } = q.data;
  const harvesting = services.find((s) => s.key === "harvesting")!;
  const groups = [...new Set(services.map((s) => s.group))];
  const byKey = Object.fromEntries(services.map((s) => [s.key, s]));

  return (
    <div>
      <PageHeader title="Services" description="Every capability is a service that can be switched on or off. Disabled services disappear from menus and their API endpoints return 404. Organisation, people and administration are always on." />
      <div className="max-w-5xl space-y-8 px-6 py-5">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
            <ul className="divide-y rounded-lg border">
              {services.filter((s) => s.group === g).map((s) => {
                const blocked = (s.dependsOn ?? []).filter((d) => !byKey[d]?.enabled);
                return (
                  <li key={s.key} className="flex items-start gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <code className="text-xs text-muted-foreground">{s.key}</code>
                        {s.key === "ranking_ai" && <Chip>{ai.configured ? "API key configured" : "no API key"}</Chip>}
                        {blocked.length > 0 && s.enabled && <Chip className="border-amber-300">inactive: needs {blocked.join(", ")}</Chip>}
                      </div>
                      <p className="text-sm text-muted-foreground">{s.description}</p>
                    </div>
                    <Switch checked={s.enabled} aria-label={`Enable ${s.name}`} onCheckedChange={(v) => put.mutate({ key: s.key, body: { enabled: v } })} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Harvesting sources</h2>
          <ul className="divide-y rounded-lg border">
            {providers.map((p) => (
              <li key={p.key} className="flex items-start gap-4 p-4">
                {p.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-label="Configured" /> : <XCircle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-label="Not configured" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-medium">{p.name}</span><Chip>{p.paid ? "paid / subscription" : "free"}</Chip></div>
                  <p className="text-sm text-muted-foreground">{p.hint}</p>
                </div>
                <Switch checked={p.enabled} disabled={!p.configured} aria-label={`Use ${p.name}`}
                  onCheckedChange={(v) => put.mutate({ key: "harvesting", body: { config: { providers: { ...harvesting.config.providers, [p.key]: v } } } })} />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Automatic harvest every N days</span>
              <input type="number" min={0} className={inputCls} defaultValue={harvesting.config.autoHarvestDays ?? 0}
                onBlur={(e) => put.mutate({ key: "harvesting", body: { config: { autoHarvestDays: Number(e.target.value) || 0 } } })} />
              <span className="block text-xs text-muted-foreground">0 = off. Staff with ORCID / OpenAlex / Scopus IDs get new records as “to confirm”.</span>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Refresh citation counts every N days</span>
              <input type="number" min={0} className={inputCls} defaultValue={harvesting.config.refreshCitationsDays ?? 7}
                onBlur={(e) => put.mutate({ key: "harvesting", body: { config: { refreshCitationsDays: Number(e.target.value) || 0 } } })} />
              <span className="block text-xs text-muted-foreground">Uses OpenAlex (free) for outputs with a DOI.</span>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">API keys are set as environment variables on the server (see <code>server-install/.env.example</code>); they are never stored in the database or sent to browsers.</p>
        </section>
      </div>
    </div>
  );
}
