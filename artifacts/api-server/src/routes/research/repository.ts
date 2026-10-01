import { Router } from "express";
import { db, people, researchOutputs, researchOutputAuthors, harvestRuns, orgUnits } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireUser, requireAdmin, currentPerson, type Person } from "../../lib/auth";
import { requireService, isEnabled } from "../../lib/services";
import { orgSnapshot } from "../../lib/approval";
import {
  searchOutputs, filtersFromQuery, allOutputsForExport, toBibtex, toRis, toCsv, searchActivities, withInternalAuthors,
} from "../../lib/repository";
import { showcaseStats } from "../../lib/showcase";
import * as harvest from "../../lib/harvest";
import { asyncHandler, HttpError, intParam, normalizeOrcid, str } from "../../lib/util";
import { isApproverOf } from "./admin";

const router = Router();

// ── Internal repository (signed-in staff) ──────────────────────────────────

router.get("/outputs", requireUser, requireService("research_repository"), asyncHandler(async (req, res) => {
  res.json(await searchOutputs(filtersFromQuery(req.query)));
}));

router.get("/outputs/:id", requireUser, requireService("research_repository"), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const [o] = await db.select().from(researchOutputs).where(eq(researchOutputs.id, id));
  if (!o) throw new HttpError(404, "Not found");
  const [withAuthors] = await withInternalAuthors([o]);
  res.json(withAuthors);
}));

function sendExport(res: any, format: string, rows: (typeof researchOutputs.$inferSelect)[], name: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const map: Record<string, [string, string, (r: typeof rows) => string]> = {
    bib: ["application/x-bibtex; charset=utf-8", "bib", toBibtex],
    ris: ["application/x-research-info-systems; charset=utf-8", "ris", toRis],
    csv: ["text/csv; charset=utf-8", "csv", toCsv],
    json: ["application/json; charset=utf-8", "json", (r) => JSON.stringify(r, null, 2)],
  };
  const [type, ext, fn] = map[format] ?? map.json;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${stamp}.${ext}"`);
  res.send(fn(rows));
}

router.get("/outputs-export/:format", requireUser, requireService("research_repository", "exports"), asyncHandler(async (req, res) => {
  sendExport(res, String(req.params.format), await allOutputsForExport(filtersFromQuery(req.query)), "research-outputs");
}));

router.get("/activities", requireUser, requireService("activities"), asyncHandler(async (req, res) => {
  res.json(await searchActivities({
    q: str(req.query.q, 200), type: str(req.query.type, 400), personId: intParam(req.query.personId),
    unitId: intParam(req.query.unitId), yearFrom: intParam(req.query.yearFrom), yearTo: intParam(req.query.yearTo),
    limit: intParam(req.query.limit) ?? 1000,
  }));
}));

/** Internal profile (includes internal-visibility items). */
router.get("/people/:id/profile", requireUser, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  res.json(await profilePayload(id, false));
}));

/** Counts per year with empty years filled in, so the time axis is continuous. */
function yearSeries(years: (number | null)[]) {
  const counts = new Map<number, number>();
  for (const y of years) if (y) counts.set(y, (counts.get(y) ?? 0) + 1);
  if (!counts.size) return [];
  const min = Math.min(...counts.keys());
  const max = Math.max(...counts.keys());
  return Array.from({ length: max - min + 1 }, (_, i) => ({ year: min + i, n: counts.get(min + i) ?? 0 }));
}

async function profilePayload(id: number, publicOnly: boolean) {
  const [p] = await db.select().from(people).where(eq(people.id, id));
  if (!p || (publicOnly && (!p.profilePublic || !p.active))) throw new HttpError(404, "Profile not found");
  const snap = await orgSnapshot();
  const unitPath: { id: number; name: string; type: string }[] = [];
  for (let u = p.orgUnitId ? snap.units.get(p.orgUnitId) : undefined; u; u = u.parentId ? snap.units.get(u.parentId) : undefined) {
    unitPath.unshift({ id: u.id, name: u.name, type: u.type });
    if (unitPath.length > 10) break;
  }
  const outputsOn = await isEnabled("research_repository");
  const activitiesOn = await isEnabled("activities");
  const outputs = outputsOn ? (await searchOutputs({ personId: id, publicOnly, pageSize: 2000, page: 1 })).items : [];
  const acts = activitiesOn ? await searchActivities({ personId: id, publicOnly, limit: 2000 }) : [];
  const cites = outputs.map((o) => o.citationCount).sort((a, b) => b - a);
  const hIndex = cites.filter((c, i) => c >= i + 1).length;
  const { email, authUserId, staffNumber, ...safe } = p;
  return {
    person: publicOnly ? safe : p,
    unitPath,
    outputs,
    activities: acts,
    metrics: {
      outputs: outputs.length,
      citations: cites.reduce((a, b) => a + b, 0),
      hIndex,
      openAccess: outputs.filter((o) => ["gold", "diamond", "green", "hybrid", "bronze"].includes(o.oaStatus)).length,
      byYear: yearSeries(outputs.map((o) => o.publicationYear)),
    },
    services: { outputs: outputsOn, activities: activitiesOn },
  };
}

// ── Harvesting ─────────────────────────────────────────────────────────────

async function harvestTarget(req: any): Promise<{ actor: Person; person: Person }> {
  const actor = (await currentPerson(req))!;
  const personId = intParam(req.body?.personId ?? req.params?.id ?? req.query?.personId) ?? actor.id;
  if (personId === actor.id) return { actor, person: actor };
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person) throw new HttpError(404, "Person not found");
  if (!isApproverOf(await orgSnapshot(), actor, person)) throw new HttpError(403, "You can only harvest for yourself or staff you approve for");
  return { actor, person };
}

const harvestGuard = requireService("harvesting");

router.get("/harvest/providers", requireUser, harvestGuard, asyncHandler(async (_req, res) => {
  res.json(await harvest.providerStatus());
}));

router.get("/harvest/authors", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const name = str(req.query.name, 200);
  if (!name || name.length < 3) throw new HttpError(400, "Enter at least 3 characters");
  const providers = str(req.query.providers, 200)?.split(",");
  res.json(await harvest.searchAuthors(name, providers));
}));

router.post("/harvest/preview", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const { person } = await harvestTarget(req);
  const sources = (Array.isArray(req.body?.sources) ? req.body.sources : [])
    .map((s: any) => ({ provider: String(s.provider), id: String(s.id) })).slice(0, 10);
  if (!sources.length) throw new HttpError(400, "Choose at least one author profile");
  res.json(await harvest.previewForPerson(person, sources));
}));

router.post("/harvest/import", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const { actor, person } = await harvestTarget(req);
  const works = (Array.isArray(req.body?.works) ? req.body.works : []).slice(0, 2000);
  // Staff importing for themselves create candidates they then confirm; approvers may send straight to review.
  const status = req.body?.status === "pending" ? "pending" : "candidate";
  const result = await harvest.stageWorks(person, works, actor, status);
  await db.insert(harvestRuns).values({
    personId: person.id, providers: [...new Set(works.flatMap((w: any) => w.providers ?? [w.provider]))] as string[],
    found: works.length, created: result.created, duplicates: result.duplicates, startedBy: actor.id, finishedAt: new Date(),
  });
  res.json(result);
}));

/** Save a chosen external identity (OpenAlex author, ORCID, Scopus ID...) to the person's profile. */
router.post("/harvest/link", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const { person } = await harvestTarget(req);
  const p = harvest.providerByKey(String(req.body?.provider));
  if (!p?.idField || p.idField === "fullName" || p.idField === "nameVariants") throw new HttpError(400, "This provider has no profile identifier");
  let id = str(req.body?.id, 200);
  if (p.idField === "orcid") id = normalizeOrcid(id);
  if (!id) throw new HttpError(400, "Identifier required");
  const set: Record<string, unknown> = { [p.idField]: id, updatedAt: new Date() };
  if (req.body?.orcid && !person.orcid) set.orcid = normalizeOrcid(req.body.orcid);
  const [u] = await db.update(people).set(set).where(eq(people.id, person.id)).returning();
  res.json(u);
}));

router.post("/harvest/run/:id", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const { actor, person } = await harvestTarget(req);
  res.json(await harvest.harvestPerson(person, actor));
}));

router.get("/harvest/runs", requireUser, harvestGuard, asyncHandler(async (req, res) => {
  const actor = (await currentPerson(req))!;
  const rows = await db.select({ r: harvestRuns, personName: people.fullName }).from(harvestRuns)
    .leftJoin(people, eq(people.id, harvestRuns.personId))
    .where(actor.systemRole === "admin" ? undefined : eq(harvestRuns.startedBy, actor.id))
    .orderBy(desc(harvestRuns.startedAt)).limit(100);
  res.json(rows.map((x) => ({ ...x.r, personName: x.personName })));
}));

router.post("/admin/harvest/refresh-citations", requireAdmin, harvestGuard, asyncHandler(async (_req, res) => {
  res.json({ updated: await harvest.refreshCitations(500) });
}));

// ── Public (no sign-in) ────────────────────────────────────────────────────

router.get("/public/showcase", requireService("showcase"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(await showcaseStats(intParam(req.query.unitId)));
}));

router.get("/public/units", asyncHandler(async (_req, res) => {
  if (!(await isEnabled("showcase")) && !(await isEnabled("profiles"))) throw new HttpError(404, "Disabled");
  const units = await db.select({ id: orgUnits.id, name: orgUnits.name, nameAr: orgUnits.nameAr, type: orgUnits.type, parentId: orgUnits.parentId })
    .from(orgUnits).where(eq(orgUnits.active, true));
  res.json(units);
}));

router.get("/public/people", requireService("profiles"), asyncHandler(async (req, res) => {
  const q = str(req.query.q, 100);
  const unitId = intParam(req.query.unitId);
  const snap = await orgSnapshot();
  const conds = [eq(people.active, true), eq(people.profilePublic, true)];
  if (q) conds.push(sql`(${people.fullName} ilike ${"%" + q + "%"} or ${people.fullNameAr} ilike ${"%" + q + "%"}
    or array_to_string(${people.researchInterests}, ' ') ilike ${"%" + q + "%"})`);
  const rows = await db.select({
    id: people.id, slug: people.slug, fullName: people.fullName, fullNameAr: people.fullNameAr, honorific: people.honorific,
    academicRank: people.academicRank, jobTitle: people.jobTitle, orgUnitId: people.orgUnitId, photoUrl: people.photoUrl,
    researchInterests: people.researchInterests, orcid: people.orcid,
    outputs: sql<number>`(select count(*)::int from ${researchOutputAuthors} r join ${researchOutputs} o on o.id = r.output_id
      where r.person_id = ${people.id} and o.visibility = 'public')`,
  }).from(people).where(and(...conds)).orderBy(people.fullName).limit(2000);
  const allowed = unitId ? new Set((await import("../../lib/approval")).descendants(snap, unitId)) : null;
  res.json(rows.filter((r) => !allowed || (r.orgUnitId && allowed.has(r.orgUnitId)))
    .map((r) => ({ ...r, unitName: r.orgUnitId ? snap.units.get(r.orgUnitId)?.name ?? null : null })));
}));

router.get("/public/people/:slug", requireService("profiles"), asyncHandler(async (req, res) => {
  const [p] = await db.select({ id: people.id }).from(people).where(eq(people.slug, String(req.params.slug)));
  if (!p) throw new HttpError(404, "Profile not found");
  res.json(await profilePayload(p.id, true));
}));

router.get("/public/outputs", requireService("showcase", "research_repository"), asyncHandler(async (req, res) => {
  res.json(await searchOutputs({ ...filtersFromQuery(req.query), publicOnly: true }));
}));

router.get("/public/people/:slug/export/:format", requireService("profiles", "exports"), asyncHandler(async (req, res) => {
  const [p] = await db.select().from(people).where(eq(people.slug, String(req.params.slug)));
  if (!p || !p.profilePublic) throw new HttpError(404, "Profile not found");
  sendExport(res, String(req.params.format), await allOutputsForExport({ personId: p.id, publicOnly: true }), p.slug);
}));

export default router;
