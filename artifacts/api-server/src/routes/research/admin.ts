import { Router } from "express";
import {
  db, platformServices, orgUnits, people, positions, positionAssignments, submissions,
  researchOutputAuthors, activities, ORG_UNIT_TYPES, SYSTEM_ROLES,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin, requireUser, currentPerson, type Person } from "../../lib/auth";
import { SERVICE_DEFS, loadServices, invalidateServices } from "../../lib/services";
import { providerStatus } from "../../lib/harvest";
import { orgSnapshot, descendants, heldApproverPositions, routeApproval } from "../../lib/approval";
import { asyncHandler, HttpError, intParam, normalizeOrcid, slugify, str, strArray } from "../../lib/util";
import { isAnthropicConfigured } from "@workspace/integrations-anthropic-ai";
import { AUTH_MODE } from "../../lib/auth";

const router = Router();

// ── Services (feature flags) ────────────────────────────────────────────────

/** Public: which services are on (the UI hides what is off). */
router.get("/services", asyncHandler(async (_req, res) => {
  const all = await loadServices();
  res.json({
    authMode: AUTH_MODE,
    services: SERVICE_DEFS.map((d) => ({
      key: d.key, name: d.name, group: d.group,
      enabled: Boolean(all.get(d.key)?.enabled) && (d.dependsOn ?? []).every((k) => all.get(k)?.enabled),
    })),
  });
}));

router.get("/admin/services", requireAdmin, asyncHandler(async (_req, res) => {
  const all = await loadServices(true);
  res.json({
    services: SERVICE_DEFS.map((d) => ({ ...d, enabled: all.get(d.key)?.enabled ?? false, config: all.get(d.key)?.config ?? {} })),
    providers: await providerStatus(),
    ai: { configured: isAnthropicConfigured() },
  });
}));

router.put("/admin/services/:key", requireAdmin, asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  const def = SERVICE_DEFS.find((d) => d.key === key);
  if (!def) throw new HttpError(404, "Unknown service");
  const actor = (await currentPerson(req))!;
  const set: Partial<typeof platformServices.$inferInsert> = { updatedAt: new Date(), updatedBy: actor.id };
  if (typeof req.body?.enabled === "boolean") set.enabled = req.body.enabled;
  if (req.body?.config && typeof req.body.config === "object") {
    const current = (await loadServices(true)).get(key)?.config ?? {};
    set.config = { ...current, ...req.body.config };
  }
  await db.update(platformServices).set(set).where(eq(platformServices.key, key));
  invalidateServices();
  res.json({ ok: true });
}));

// ── Current user ────────────────────────────────────────────────────────────

router.get("/me", requireUser, asyncHandler(async (req, res) => {
  const me = (await currentPerson(req))!;
  const snap = await orgSnapshot();
  const pending = await db.select({ id: submissions.id, orgUnitId: submissions.orgUnitId, personId: submissions.personId })
    .from(submissions).where(eq(submissions.status, "pending"));
  const toReview = me.systemRole === "admin"
    ? pending.filter((s) => s.personId !== me.id || routeApproval(snap, s.orgUnitId, s.personId).level === "admin").length
    : pending.filter((s) => routeApproval(snap, s.orgUnitId, s.personId).approverIds.includes(me.id)).length;
  const counts = await db.select({ status: submissions.status, n: sql<number>`count(*)::int` }).from(submissions)
    .where(eq(submissions.personId, me.id)).groupBy(submissions.status);
  const unit = me.orgUnitId ? snap.units.get(me.orgUnitId) : null;
  const route = routeApproval(snap, me.orgUnitId, me.id);
  const approverRows = route.approverIds.length
    ? await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, route.approverIds))
    : [];
  res.json({
    person: me,
    unit,
    approverPositions: heldApproverPositions(snap, me.id),
    isApprover: me.systemRole === "admin" || heldApproverPositions(snap, me.id).length > 0,
    toReview,
    mySubmissionCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    myApprovers: { level: route.level, people: approverRows },
  });
}));

const PROFILE_FIELDS = ["fullNameAr", "honorific", "bio", "photoUrl", "website", "googleScholarId",
  "scopusAuthorId", "wosResearcherId", "openalexAuthorId", "semanticScholarId"] as const;

function profilePatch(body: any) {
  const set: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) if (f in body) set[f] = str(body[f], f === "bio" ? 5000 : 300);
  if ("orcid" in body) set.orcid = body.orcid ? normalizeOrcid(body.orcid) : null;
  if ("researchInterests" in body) set.researchInterests = strArray(body.researchInterests, 30);
  if ("nameVariants" in body) set.nameVariants = strArray(body.nameVariants, 20);
  if ("profilePublic" in body) set.profilePublic = Boolean(body.profilePublic);
  if (body.orcid && !set.orcid) throw new HttpError(400, "Invalid ORCID iD");
  return set;
}

router.put("/me/profile", requireUser, asyncHandler(async (req, res) => {
  const me = (await currentPerson(req))!;
  const [p] = await db.update(people).set({ ...profilePatch(req.body ?? {}), updatedAt: new Date() }).where(eq(people.id, me.id)).returning();
  res.json(p);
}));

// ── Organisation structure ──────────────────────────────────────────────────

router.get("/org/units", requireUser, asyncHandler(async (_req, res) => {
  const units = await db.select().from(orgUnits).orderBy(asc(orgUnits.name));
  const members = await db.select({ unit: people.orgUnitId, n: sql<number>`count(*)::int` }).from(people)
    .where(eq(people.active, true)).groupBy(people.orgUnitId);
  const pos = await db.select({ unit: positions.orgUnitId, n: sql<number>`count(*)::int` }).from(positions).groupBy(positions.orgUnitId);
  const m = new Map(members.map((x) => [x.unit, x.n]));
  const p = new Map(pos.map((x) => [x.unit, x.n]));
  res.json(units.map((u) => ({ ...u, memberCount: m.get(u.id) ?? 0, positionCount: p.get(u.id) ?? 0 })));
}));

router.get("/org/units/:id", requireUser, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, id));
  if (!unit) throw new HttpError(404, "Unit not found");
  const pos = await db.select().from(positions).where(eq(positions.orgUnitId, id)).orderBy(asc(positions.title));
  const holders = pos.length
    ? await db.select({
      id: positionAssignments.id, positionId: positionAssignments.positionId, personId: people.id,
      fullName: people.fullName, email: people.email, startDate: positionAssignments.startDate,
      endDate: positionAssignments.endDate, active: positionAssignments.active,
    }).from(positionAssignments).innerJoin(people, eq(people.id, positionAssignments.personId))
      .where(inArray(positionAssignments.positionId, pos.map((p) => p.id)))
    : [];
  const members = await db.select({
    id: people.id, fullName: people.fullName, email: people.email, academicRank: people.academicRank, jobTitle: people.jobTitle,
  }).from(people).where(and(eq(people.orgUnitId, id), eq(people.active, true))).orderBy(asc(people.fullName));
  const snap = await orgSnapshot();
  const route = routeApproval(snap, id, -1);
  const routeNames = route.approverIds.length
    ? await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, route.approverIds))
    : [];
  res.json({
    unit,
    positions: pos.map((p) => ({ ...p, holders: holders.filter((h) => h.positionId === p.id) })),
    members,
    approvalRoute: { level: route.level, unitId: route.unitId, people: routeNames },
  });
}));

function unitPatch(body: any) {
  const set: Record<string, unknown> = {};
  if ("type" in body) {
    if (!(ORG_UNIT_TYPES as readonly string[]).includes(body.type)) throw new HttpError(400, "Invalid unit type");
    set.type = body.type;
  }
  for (const f of ["name", "nameAr", "code", "rorId", "description", "website"] as const) if (f in body) set[f] = str(body[f], 500);
  if ("parentId" in body) set.parentId = body.parentId ? intParam(body.parentId) : null;
  if ("active" in body) set.active = Boolean(body.active);
  return set;
}

router.post("/admin/org/units", requireAdmin, asyncHandler(async (req, res) => {
  const set = unitPatch(req.body ?? {});
  if (!set.name || !set.type) throw new HttpError(400, "Name and type are required");
  const [u] = await db.insert(orgUnits).values(set as typeof orgUnits.$inferInsert).returning();
  res.status(201).json(u);
}));

router.put("/admin/org/units/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const set = unitPatch(req.body ?? {});
  if (set.parentId) {
    const snap = await orgSnapshot();
    if (descendants(snap, id).includes(set.parentId as number)) throw new HttpError(400, "A unit cannot be moved under itself or its descendants");
  }
  const [u] = await db.update(orgUnits).set({ ...set, updatedAt: new Date() }).where(eq(orgUnits.id, id)).returning();
  if (!u) throw new HttpError(404, "Unit not found");
  res.json(u);
}));

router.delete("/admin/org/units/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const [child] = await db.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, id)).limit(1);
  const [member] = await db.select({ id: people.id }).from(people).where(eq(people.orgUnitId, id)).limit(1);
  if (child || member) throw new HttpError(409, "Move sub-units and members first, or mark the unit inactive");
  const pos = await db.select({ id: positions.id }).from(positions).where(eq(positions.orgUnitId, id));
  if (pos.length) await db.delete(positionAssignments).where(inArray(positionAssignments.positionId, pos.map((p) => p.id)));
  await db.delete(positions).where(eq(positions.orgUnitId, id));
  await db.delete(orgUnits).where(eq(orgUnits.id, id));
  res.json({ ok: true });
}));

router.post("/admin/org/units/:id/positions", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const title = str(req.body?.title, 200);
  if (!id || !title) throw new HttpError(400, "Unit and title are required");
  const [p] = await db.insert(positions).values({
    orgUnitId: id, title,
    isApprover: req.body?.isApprover !== false,
    approvalScope: req.body?.approvalScope === "subtree" ? "subtree" : "unit",
  }).returning();
  res.status(201).json(p);
}));

router.put("/admin/positions/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const set: Record<string, unknown> = {};
  if ("title" in req.body) set.title = str(req.body.title, 200);
  if ("isApprover" in req.body) set.isApprover = Boolean(req.body.isApprover);
  if ("approvalScope" in req.body) set.approvalScope = req.body.approvalScope === "subtree" ? "subtree" : "unit";
  const [p] = await db.update(positions).set(set).where(eq(positions.id, id)).returning();
  res.json(p);
}));

router.delete("/admin/positions/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  await db.delete(positionAssignments).where(eq(positionAssignments.positionId, id));
  await db.delete(positions).where(eq(positions.id, id));
  res.json({ ok: true });
}));

/** Add one or more people to a position (several holders share approval duty). */
router.post("/admin/positions/:id/assignments", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const ids: number[] = (Array.isArray(req.body?.personIds) ? req.body.personIds : [req.body?.personId])
    .map(intParam).filter((x: number | null): x is number => Boolean(x));
  if (!id || !ids.length) throw new HttpError(400, "Position and person are required");
  const existing = await db.select({ personId: positionAssignments.personId }).from(positionAssignments)
    .where(and(eq(positionAssignments.positionId, id), eq(positionAssignments.active, true)));
  const fresh = ids.filter((p) => !existing.some((e) => e.personId === p));
  if (fresh.length) {
    await db.insert(positionAssignments).values(fresh.map((personId) => ({
      positionId: id, personId, startDate: str(req.body?.startDate, 10), endDate: str(req.body?.endDate, 10),
    })));
  }
  res.status(201).json({ added: fresh.length });
}));

router.put("/admin/assignments/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const set: Record<string, unknown> = {};
  if ("active" in req.body) set.active = Boolean(req.body.active);
  if ("startDate" in req.body) set.startDate = str(req.body.startDate, 10);
  if ("endDate" in req.body) set.endDate = str(req.body.endDate, 10);
  await db.update(positionAssignments).set(set).where(eq(positionAssignments.id, id));
  res.json({ ok: true });
}));

router.delete("/admin/assignments/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  await db.delete(positionAssignments).where(eq(positionAssignments.id, id));
  res.json({ ok: true });
}));

// ── People ──────────────────────────────────────────────────────────────────

router.get("/people", requireUser, asyncHandler(async (req, res) => {
  const q = str(req.query.q, 100);
  const unitId = intParam(req.query.unitId);
  const includeInactive = req.query.inactive === "1";
  const snap = await orgSnapshot();
  const conds = [];
  if (!includeInactive) conds.push(eq(people.active, true));
  if (q) conds.push(sql`(${people.fullName} ilike ${"%" + q + "%"} or ${people.email} ilike ${"%" + q + "%"} or ${people.fullNameAr} ilike ${"%" + q + "%"})`);
  if (unitId) conds.push(inArray(people.orgUnitId, descendants(snap, unitId)));
  const rows = await db.select().from(people).where(conds.length ? and(...conds) : undefined).orderBy(asc(people.fullName)).limit(1000);
  const outCounts = await db.select({ personId: researchOutputAuthors.personId, n: sql<number>`count(*)::int` })
    .from(researchOutputAuthors).groupBy(researchOutputAuthors.personId);
  const actCounts = await db.select({ personId: activities.personId, n: sql<number>`count(*)::int` })
    .from(activities).groupBy(activities.personId);
  const oc = new Map(outCounts.map((x) => [x.personId, x.n]));
  const ac = new Map(actCounts.map((x) => [x.personId, x.n]));
  res.json(rows.map((p) => ({
    ...p, unitName: p.orgUnitId ? snap.units.get(p.orgUnitId)?.name ?? null : null,
    outputCount: oc.get(p.id) ?? 0, activityCount: ac.get(p.id) ?? 0,
  })));
}));

async function uniqueSlug(name: string, exceptId?: number) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: people.id }).from(people).where(eq(people.slug, slug)).limit(1);
    if (!hit || hit.id === exceptId) return slug;
  }
}

function adminPersonPatch(body: any) {
  const set: Record<string, unknown> = profilePatch(body);
  for (const f of ["fullName", "academicRank", "jobTitle", "staffNumber"] as const) if (f in body) set[f] = str(body[f], 300);
  if ("email" in body) set.email = str(body.email, 300)?.toLowerCase();
  if ("orgUnitId" in body) set.orgUnitId = body.orgUnitId ? intParam(body.orgUnitId) : null;
  if ("systemRole" in body) {
    if (!(SYSTEM_ROLES as readonly string[]).includes(body.systemRole)) throw new HttpError(400, "Invalid role");
    set.systemRole = body.systemRole;
  }
  if ("active" in body) set.active = Boolean(body.active);
  return set;
}

router.post("/admin/people", requireAdmin, asyncHandler(async (req, res) => {
  const set = adminPersonPatch(req.body ?? {});
  if (!set.fullName || !set.email || !String(set.email).includes("@")) throw new HttpError(400, "Full name and a valid email are required");
  const [dup] = await db.select({ id: people.id }).from(people).where(sql`lower(${people.email}) = ${set.email}`).limit(1);
  if (dup) throw new HttpError(409, "A person with this email already exists");
  const [p] = await db.insert(people).values({ ...(set as any), slug: await uniqueSlug(String(set.fullName)) }).returning();
  res.status(201).json(p);
}));

router.put("/admin/people/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const set = adminPersonPatch(req.body ?? {});
  if (set.fullName) set.slug = await uniqueSlug(String(set.fullName), id);
  const [p] = await db.update(people).set({ ...set, updatedAt: new Date() }).where(eq(people.id, id)).returning();
  if (!p) throw new HttpError(404, "Person not found");
  res.json(p);
}));

/**
 * Bulk staff import. Body: { rows: [{ fullName, email, unitCode?, academicRank?, jobTitle?, orcid?, staffNumber? }] }
 * Existing emails are updated, new ones created.
 */
router.post("/admin/people/import", requireAdmin, asyncHandler(async (req, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [];
  const units = await db.select({ id: orgUnits.id, code: orgUnits.code, name: orgUnits.name }).from(orgUnits);
  const findUnit = (v: unknown) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return undefined;
    return units.find((u) => u.code?.toLowerCase() === s || u.name.toLowerCase() === s)?.id;
  };
  let created = 0, updated = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    try {
      const email = str(r.email, 300)?.toLowerCase();
      const fullName = str(r.fullName ?? r.name, 300);
      if (!email || !email.includes("@") || !fullName) throw new Error("fullName and email are required");
      const set = adminPersonPatch({ ...r, email, fullName });
      const unitId = findUnit(r.unitCode ?? r.unit);
      if ((r.unitCode || r.unit) && !unitId) throw new Error(`unknown unit "${r.unitCode ?? r.unit}"`);
      if (unitId) set.orgUnitId = unitId;
      delete set.systemRole;
      const [hit] = await db.select({ id: people.id }).from(people).where(sql`lower(${people.email}) = ${email}`).limit(1);
      if (hit) {
        await db.update(people).set({ ...set, updatedAt: new Date() }).where(eq(people.id, hit.id));
        updated++;
      } else {
        await db.insert(people).values({ ...(set as any), slug: await uniqueSlug(fullName) });
        created++;
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${(err as Error).message}`);
    }
  }
  res.json({ created, updated, errors });
}));

export function isApproverOf(snap: Awaited<ReturnType<typeof orgSnapshot>>, actor: Person, target: Person) {
  return actor.systemRole === "admin" || routeApproval(snap, target.orgUnitId, target.id).approverIds.includes(actor.id);
}

export default router;
