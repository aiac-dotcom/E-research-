import { db, people, submissions, researchOutputs, researchOutputAuthors, harvestRuns } from "@workspace/db";
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { logger } from "../logger";
import { dedupeKey, normalizeTitle } from "../util";
import { isEnabled, serviceConfig } from "../services";
import { createSubmission } from "../workflow";
import type { Person } from "../auth";
import { openalex } from "./openalex";
import { crossref } from "./crossref";
import { orcid } from "./orcid";
import { semanticScholar } from "./semanticscholar";
import { scopus } from "./scopus";
import { wos } from "./wos";
import type { AuthorCandidate, HarvestedWork, Provider, ProviderKey } from "./types";

export * from "./types";

export const PROVIDERS: Provider[] = [openalex, orcid, crossref, semanticScholar, scopus, wos];
export const providerByKey = (k: string) => PROVIDERS.find((p) => p.key === k);

/** Providers that are configured AND switched on in the harvesting service config. */
export async function activeProviders(): Promise<Provider[]> {
  const cfg = await serviceConfig<{ providers?: Record<string, boolean> }>("harvesting");
  return PROVIDERS.filter((p) => p.configured() && cfg.providers?.[p.key] !== false);
}

export async function providerStatus() {
  const cfg = await serviceConfig<{ providers?: Record<string, boolean> }>("harvesting");
  return PROVIDERS.map((p) => ({
    key: p.key, name: p.name, paid: p.paid, configured: p.configured(),
    enabled: cfg.providers?.[p.key] !== false, hint: p.configHint, idField: p.idField,
  }));
}

export async function searchAuthors(name: string, keys?: string[]) {
  const providers = (await activeProviders()).filter((p) => p.searchAuthors && (!keys?.length || keys.includes(p.key)));
  const results: AuthorCandidate[] = [];
  const errors: string[] = [];
  await Promise.all(providers.map(async (p) => {
    try {
      results.push(...(await p.searchAuthors!(name)));
    } catch (err) {
      errors.push(`${p.name}: ${(err as Error).message}`);
    }
  }));
  return { results, errors };
}

const richness = (w: HarvestedWork) =>
  [w.abstract, w.venue, w.doi, w.volume, w.pages, w.publicationDate].filter(Boolean).length + w.authors.length / 10;

/** Merge records from several providers describing the same work (DOI or title+year). */
export function mergeWorks(works: HarvestedWork[]): HarvestedWork[] {
  const byKey = new Map<string, HarvestedWork>();
  const titleIndex = new Map<string, string>();
  for (const w of works) {
    if (!w.title || w.title === "(untitled)") continue;
    const tKey = dedupeKey(w.title, w.publicationYear, null);
    const key = w.doi ? `doi:${w.doi}` : titleIndex.get(tKey) ?? tKey;
    const existingKey = byKey.has(key) ? key : titleIndex.get(tKey);
    const prev = existingKey ? byKey.get(existingKey) : undefined;
    if (!prev) {
      byKey.set(key, { ...w, providers: [w.provider] });
      titleIndex.set(tKey, key);
      continue;
    }
    const [base, other] = richness(w) > richness(prev) ? [w, prev] : [prev, w];
    const merged: HarvestedWork = { ...base };
    for (const f of ["abstract", "venue", "publisher", "volume", "issue", "pages", "doi", "isbn", "issn", "url", "language", "publicationDate", "publicationYear"] as const) {
      if (!merged[f] && other[f]) (merged as any)[f] = other[f];
    }
    if (merged.oaStatus === "unknown") merged.oaStatus = other.oaStatus;
    if (merged.authors.length < other.authors.length) merged.authors = other.authors;
    merged.keywords = [...new Set([...base.keywords, ...other.keywords])].slice(0, 15);
    merged.sdgs = [...new Set([...base.sdgs, ...other.sdgs])];
    merged.collabCountries = [...new Set([...base.collabCountries, ...other.collabCountries])];
    merged.citationCount = Math.max(base.citationCount ?? 0, other.citationCount ?? 0);
    merged.externalIds = { ...other.externalIds, ...base.externalIds };
    merged.providers = [...new Set([...(prev.providers ?? [prev.provider]), w.provider])];
    byKey.set(existingKey!, merged);
    if (merged.doi && existingKey !== `doi:${merged.doi}`) titleIndex.set(tKey, existingKey!);
  }
  return [...byKey.values()];
}

function nameTokens(n: string) {
  return normalizeTitle(n).split(" ").filter((t) => t.length > 1);
}

/** Which author entry is this person? ORCID first, then family name + initial. */
export function matchAuthorPosition(w: HarvestedWork, p: Pick<Person, "fullName" | "nameVariants" | "orcid">): number | null {
  if (p.orcid) {
    const hit = w.authors.find((a) => a.orcid === p.orcid);
    if (hit) return hit.position;
  }
  for (const n of [p.fullName, ...(p.nameVariants ?? [])]) {
    const t = nameTokens(n);
    const fam = t[t.length - 1];
    const init = t[0]?.[0];
    const hit = w.authors.find((a) => {
      const at = nameTokens(a.name);
      return at.includes(fam) && (!init || at.some((x) => x[0] === init));
    });
    if (hit) return hit.position;
  }
  return null;
}

/** Keys of works already approved for, or already submitted/dismissed by, this person. */
async function knownKeys(personId: number): Promise<Set<string>> {
  const subs = await db.select({ k: submissions.dedupeKey }).from(submissions)
    .where(and(eq(submissions.personId, personId), eq(submissions.kind, "output")));
  const outs = await db.select({ t: researchOutputs.title, y: researchOutputs.publicationYear, d: researchOutputs.doi })
    .from(researchOutputs)
    .innerJoin(researchOutputAuthors, eq(researchOutputAuthors.outputId, researchOutputs.id))
    .where(eq(researchOutputAuthors.personId, personId));
  const set = new Set<string>();
  for (const s of subs) if (s.k) set.add(s.k);
  for (const o of outs) {
    set.add(dedupeKey(o.t, o.y, o.d));
    set.add(dedupeKey(o.t, o.y, null));
  }
  return set;
}

export async function previewForPerson(person: Person, sources: { provider: string; id: string }[]) {
  const works: HarvestedWork[] = [];
  const errors: string[] = [];
  const active = await activeProviders();
  await Promise.all(sources.map(async (s) => {
    const p = active.find((x) => x.key === s.provider);
    if (!p?.worksByAuthorId) {
      errors.push(`${s.provider}: provider not available`);
      return;
    }
    try {
      works.push(...(await p.worksByAuthorId(s.id)));
    } catch (err) {
      errors.push(`${p.name}: ${(err as Error).message}`);
    }
  }));
  const merged = mergeWorks(works).sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0));
  const known = await knownKeys(person.id);
  return {
    errors,
    works: merged.map((w) => ({
      ...w,
      authorPosition: matchAuthorPosition(w, person),
      duplicate: known.has(dedupeKey(w.title, w.publicationYear, w.doi)) || known.has(dedupeKey(w.title, w.publicationYear, null)),
    })),
  };
}

/** Stage harvested works as submissions for a person; returns counts. */
export async function stageWorks(person: Person, works: HarvestedWork[], actor: Person | null, status: "candidate" | "pending") {
  const known = await knownKeys(person.id);
  let created = 0;
  let duplicates = 0;
  for (const w of works) {
    const key = dedupeKey(w.title, w.publicationYear, w.doi);
    if (known.has(key) || known.has(dedupeKey(w.title, w.publicationYear, null))) {
      duplicates++;
      continue;
    }
    known.add(key);
    const { provider, providers, ...rest } = w as HarvestedWork & { duplicate?: boolean; authorPosition?: number | null };
    delete (rest as any).duplicate;
    await createSubmission({
      kind: "output",
      person,
      actor,
      status,
      source: (providers?.[0] ?? provider) as any,
      payload: { ...rest, authorPosition: (w as any).authorPosition ?? matchAuthorPosition(w, person), harvestedFrom: providers ?? [provider] },
    });
    created++;
  }
  return { created, duplicates };
}

/** Harvest using the identifiers stored on the person's profile. */
export async function harvestPerson(person: Person, actor: Person | null, trigger: "manual" | "scheduled" = "manual") {
  const active = await activeProviders();
  const sources: { provider: ProviderKey; id: string }[] = [];
  for (const p of active) {
    if (!p.worksByAuthorId || !p.idField || p.idField === "fullName") continue;
    const id = (person as any)[p.idField] as string | null;
    if (id) sources.push({ provider: p.key, id });
  }
  const [run] = await db.insert(harvestRuns).values({
    personId: person.id, providers: sources.map((s) => s.provider), trigger, startedBy: actor?.id ?? null,
  }).returning();
  if (!sources.length) {
    await db.update(harvestRuns).set({ finishedAt: new Date(), errors: ["No identifiers (ORCID, OpenAlex, Scopus...) on this profile"] }).where(eq(harvestRuns.id, run.id));
    return { runId: run.id, found: 0, created: 0, duplicates: 0, errors: ["No identifiers (ORCID, OpenAlex, Scopus...) on this profile. Use the name search to link one."] };
  }
  const { works, errors } = await previewForPerson(person, sources);
  const { created, duplicates } = await stageWorks(person, works.filter((w) => !w.duplicate), actor, "candidate");
  const dupTotal = duplicates + works.filter((w) => w.duplicate).length;
  await db.update(harvestRuns).set({ found: works.length, created, duplicates: dupTotal, errors, finishedAt: new Date() }).where(eq(harvestRuns.id, run.id));
  await db.update(people).set({ lastHarvestedAt: new Date() }).where(eq(people.id, person.id));
  return { runId: run.id, found: works.length, created, duplicates: dupTotal, errors };
}

/** Refresh citation counts of approved outputs from OpenAlex (free). */
export async function refreshCitations(limit = 200) {
  const rows = await db.select({ id: researchOutputs.id, doi: researchOutputs.doi }).from(researchOutputs)
    .where(and(isNotNull(researchOutputs.doi), or(
      sql`${researchOutputs.citationsUpdatedAt} is null`,
      lt(researchOutputs.citationsUpdatedAt, sql`now() - interval '6 days'`),
    )))
    .limit(limit);
  let updated = 0;
  for (const r of rows) {
    const w = await openalex.lookupDoi!(r.doi!);
    if (!w) continue;
    await db.update(researchOutputs).set({
      citationCount: w.citationCount ?? 0, citationSource: "openalex", citationsUpdatedAt: new Date(),
    }).where(eq(researchOutputs.id, r.id));
    updated++;
  }
  return updated;
}

let timer: NodeJS.Timeout | null = null;

/** Daily background job: auto-harvest people whose last harvest is older than N days, refresh citations. */
export function startHarvestScheduler() {
  if (timer || process.env["DISABLE_SCHEDULER"] === "1") return;
  const tick = async () => {
    try {
      if (!(await isEnabled("harvesting"))) return;
      const cfg = await serviceConfig<{ autoHarvestDays?: number; refreshCitationsDays?: number }>("harvesting");
      const days = Number(cfg.autoHarvestDays) || 0;
      if (days > 0) {
        const due = await db.select().from(people).where(and(
          eq(people.active, true),
          or(isNotNull(people.orcid), isNotNull(people.openalexAuthorId), isNotNull(people.scopusAuthorId)),
          or(sql`${people.lastHarvestedAt} is null`, lt(people.lastHarvestedAt, sql`now() - make_interval(days => ${days})`)),
        )).limit(25);
        for (const p of due) await harvestPerson(p, null, "scheduled");
        if (due.length) logger.info({ count: due.length }, "Scheduled harvest finished");
      }
      if ((Number(cfg.refreshCitationsDays) || 0) > 0) await refreshCitations(100);
    } catch (err) {
      logger.error({ err }, "Scheduled harvest failed");
    }
  };
  timer = setInterval(tick, 6 * 60 * 60 * 1000);
  setTimeout(tick, 60_000);
}

