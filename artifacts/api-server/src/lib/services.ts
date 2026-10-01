import type { Request, Response, NextFunction } from "express";
import { db, platformServices } from "@workspace/db";

export type ServiceDef = {
  key: string;
  name: string;
  description: string;
  group: "Research" | "Rankings" | "Public" | "Integration" | "Legacy";
  defaultEnabled: boolean;
  dependsOn?: string[];
  defaultConfig?: Record<string, unknown>;
};

/**
 * Every feature of the platform is a service that an administrator can switch
 * on or off. Organisation structure, people and administration are core and
 * always available.
 */
export const SERVICE_DEFS: ServiceDef[] = [
  {
    key: "research_repository", name: "Research repository", group: "Research", defaultEnabled: true,
    description: "Central database of approved research outputs (articles, papers, books, datasets, patents...).",
  },
  {
    key: "activities", name: "Academic activities", group: "Research", defaultEnabled: true,
    description: "Seminars, conferences, grants, awards, editorial roles, supervision and other academic activities.",
  },
  {
    key: "approvals", name: "Manager approval workflow", group: "Research", defaultEnabled: true,
    description: "Every submission is reviewed by the direct manager before it is stored permanently. If switched off, submissions are approved automatically.",
  },
  {
    key: "harvesting", name: "Publication harvesting", group: "Integration", defaultEnabled: true,
    dependsOn: ["research_repository"],
    description: "Search external bibliographic sources by name / ORCID and import records as candidates.",
    defaultConfig: {
      providers: { openalex: true, crossref: true, orcid: true, semantic_scholar: true, scopus: true, wos: true },
      autoHarvestDays: 0,
      refreshCitationsDays: 7,
    },
  },
  {
    key: "profiles", name: "Researcher profile pages", group: "Public", defaultEnabled: true,
    description: "A page per staff member showing approved outputs and activities.",
  },
  {
    key: "showcase", name: "University showcase", group: "Public", defaultEnabled: true,
    description: "Public page with research statistics, highlights, grants and awards.",
  },
  {
    key: "exports", name: "Exports (BibTeX / CSV / JSON)", group: "Integration", defaultEnabled: true,
    description: "Download publication lists and activity reports.",
  },
  {
    key: "oai_pmh", name: "OAI-PMH endpoint", group: "Integration", defaultEnabled: false,
    dependsOn: ["research_repository"],
    description: "Open Archives Initiative endpoint (Dublin Core) for aggregators such as OpenAIRE, BASE and CORE.",
  },
  {
    key: "ranking", name: "QS ranking dashboard", group: "Rankings", defaultEnabled: true,
    description: "QS World / Arab ranking analytics, peer comparison, predictions and what-if simulation.",
  },
  {
    key: "ranking_ai", name: "AI ranking analysis", group: "Rankings", defaultEnabled: true,
    dependsOn: ["ranking"],
    description: "Claude-generated strategic analysis of ranking indicators (needs an Anthropic API key).",
  },
  {
    key: "qa", name: "QA test dashboard", group: "Legacy", defaultEnabled: false,
    description: "Legacy software-QA dashboard (test cases, defects, testers) shipped with the original code.",
  },
];

type Row = { enabled: boolean; config: Record<string, unknown> };
let cache: Map<string, Row> | null = null;
let cacheAt = 0;

export async function loadServices(force = false): Promise<Map<string, Row>> {
  if (cache && !force && Date.now() - cacheAt < 30_000) return cache;
  const rows = await db.select().from(platformServices);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const missing = SERVICE_DEFS.filter((d) => !byKey.has(d.key));
  if (missing.length) {
    await db.insert(platformServices).values(
      missing.map((d) => ({ key: d.key, enabled: d.defaultEnabled, config: d.defaultConfig ?? {} })),
    ).onConflictDoNothing();
    return loadServices(true);
  }
  cache = new Map(
    SERVICE_DEFS.map((d) => {
      const r = byKey.get(d.key)!;
      return [d.key, { enabled: r.enabled, config: { ...(d.defaultConfig ?? {}), ...(r.config ?? {}) } }];
    }),
  );
  cacheAt = Date.now();
  return cache;
}

export function invalidateServices() {
  cache = null;
}

export async function isEnabled(key: string): Promise<boolean> {
  const all = await loadServices();
  const def = SERVICE_DEFS.find((d) => d.key === key);
  if (!all.get(key)?.enabled) return false;
  for (const dep of def?.dependsOn ?? []) if (!all.get(dep)?.enabled) return false;
  return true;
}

export async function serviceConfig<T = Record<string, unknown>>(key: string): Promise<T> {
  const all = await loadServices();
  return (all.get(key)?.config ?? {}) as T;
}

/** Route guard: responds 404 with a clear message when the service is switched off. */
export function requireService(...keys: string[]) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      for (const key of keys) {
        if (!(await isEnabled(key))) {
          res.status(404).json({ error: `The "${key}" service is disabled`, service: key, disabled: true });
          return;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
