import { Router, type Request } from "express";
import {
  db, submissions, approvalEvents, people, researchOutputs, researchOutputAuthors, activities, orgUnits,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireUser, currentPerson, type Person } from "../../lib/auth";
import { requireService, isEnabled } from "../../lib/services";
import { orgSnapshot, routeApproval, canApprove } from "../../lib/approval";
import * as wf from "../../lib/workflow";
import { providerByKey } from "../../lib/harvest";
import { asyncHandler, HttpError, intParam, normalizeDoi, str } from "../../lib/util";
import { isApproverOf } from "./admin";

const router = Router();

const kindService = (kind: string) => (kind === "activity" ? "activities" : "research_repository");

async function me(req: Request): Promise<Person> {
  return (await currentPerson(req))!;
}

async function personById(id: number): Promise<Person> {
  const [p] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!p) throw new HttpError(404, "Person not found");
  return p;
}

// ── My portfolio ────────────────────────────────────────────────────────────

router.get("/submissions/mine", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const personId = intParam(req.query.personId) ?? actor.id;
  if (personId !== actor.id) {
    const target = await personById(personId);
    if (!isApproverOf(await orgSnapshot(), actor, target)) throw new HttpError(403, "Not allowed");
  }
  const conds = [eq(submissions.personId, personId)];
  const status = str(req.query.status, 20);
  if (status) conds.push(inArray(submissions.status, status.split(",") as any));
  const kind = str(req.query.kind, 20);
  if (kind) conds.push(eq(submissions.kind, kind as any));
  const rows = await db.select().from(submissions).where(and(...conds)).orderBy(desc(submissions.updatedAt)).limit(1000);
  res.json(rows);
}));

router.get("/submissions/:id", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const [s] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!s) throw new HttpError(404, "Not found");
  const snap = await orgSnapshot();
  if (s.personId !== actor.id && !canApprove(snap, actor, s)) throw new HttpError(403, "Not allowed");
  const events = await db.select({
    id: approvalEvents.id, action: approvalEvents.action, fromStatus: approvalEvents.fromStatus,
    toStatus: approvalEvents.toStatus, comment: approvalEvents.comment, createdAt: approvalEvents.createdAt,
    actorName: people.fullName,
  }).from(approvalEvents).leftJoin(people, eq(people.id, approvalEvents.actorId))
    .where(eq(approvalEvents.submissionId, id)).orderBy(asc(approvalEvents.createdAt));
  const route = routeApproval(snap, s.orgUnitId, s.personId);
  const approvers = route.approverIds.length
    ? await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, route.approverIds))
    : [];
  res.json({ submission: s, events, route: { ...route, people: approvers } });
}));

/** Create a submission (manual entry). Approvers/admins may submit on behalf of someone. */
router.post("/submissions", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const kind = req.body?.kind === "activity" ? "activity" : "output";
  if (!(await isEnabled(kindService(kind)))) throw new HttpError(404, "This service is disabled");
  let person = actor;
  const forId = intParam(req.body?.personId);
  if (forId && forId !== actor.id) {
    person = await personById(forId);
    if (!isApproverOf(await orgSnapshot(), actor, person)) throw new HttpError(403, "You can only submit for staff you approve for");
  }
  const s = await wf.createSubmission({
    kind, person, actor, status: req.body?.draft ? "candidate" : "pending",
    source: req.body?.source === "doi_lookup" ? "doi_lookup" : "manual",
    payload: req.body?.payload ?? {},
  });
  res.status(201).json(s);
}));

router.put("/submissions/:id", requireUser, asyncHandler(async (req, res) => {
  res.json(await wf.updatePayload(intParam(req.params.id) ?? 0, await me(req), req.body?.payload ?? {}));
}));

router.post("/submissions/:id/claim", requireUser, asyncHandler(async (req, res) => {
  res.json(await wf.claim(intParam(req.params.id) ?? 0, await me(req)));
}));

router.post("/submissions/claim-bulk", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const ids: number[] = (req.body?.ids ?? []).map(intParam).filter(Boolean);
  const action = req.body?.action === "dismiss" ? "dismiss" : "claim";
  let done = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      if (action === "claim") await wf.claim(id, actor);
      else await wf.dismiss(id, actor);
      done++;
    } catch (err) {
      errors.push(`#${id}: ${(err as Error).message}`);
    }
  }
  res.json({ done, errors });
}));

router.post("/submissions/:id/dismiss", requireUser, asyncHandler(async (req, res) => {
  res.json(await wf.dismiss(intParam(req.params.id) ?? 0, await me(req), str(req.body?.comment)));
}));

router.post("/submissions/:id/resubmit", requireUser, asyncHandler(async (req, res) => {
  res.json(await wf.resubmit(intParam(req.params.id) ?? 0, await me(req), req.body?.payload));
}));

router.delete("/submissions/:id", requireUser, asyncHandler(async (req, res) => {
  await wf.withdraw(intParam(req.params.id) ?? 0, await me(req));
  res.json({ ok: true });
}));

/** Metadata look-up by DOI (OpenAlex, falling back to Crossref) to pre-fill the form. */
router.get("/lookup/doi", requireUser, asyncHandler(async (req, res) => {
  const doi = normalizeDoi(req.query.doi);
  if (!doi) throw new HttpError(400, "Enter a valid DOI, e.g. 10.1000/xyz123");
  const actor = await me(req);
  for (const key of ["openalex", "crossref"]) {
    const p = providerByKey(key);
    try {
      const w = await p?.lookupDoi?.(doi);
      if (w) {
        const { matchAuthorPosition } = await import("../../lib/harvest");
        res.json({ ...w, authorPosition: matchAuthorPosition(w, actor) });
        return;
      }
    } catch {
      /* try next provider */
    }
  }
  throw new HttpError(404, "DOI not found in OpenAlex or Crossref");
}));

/** Request a change to an approved record; goes through approval again. */
router.post(["/outputs/:id/edit-request", "/activities/:id/edit-request"], requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const kind = req.path.startsWith("/activities") ? "activity" : "output";
  if (kind === "output") {
    const [link] = await db.select().from(researchOutputAuthors)
      .where(and(eq(researchOutputAuthors.outputId, id), eq(researchOutputAuthors.personId, actor.id)));
    if (!link && actor.systemRole !== "admin") throw new HttpError(403, "You are not linked to this output");
  } else {
    const [a] = await db.select().from(activities).where(eq(activities.id, id));
    if (!a || (a.personId !== actor.id && actor.systemRole !== "admin")) throw new HttpError(403, "Not your activity");
  }
  const s = await wf.createSubmission({ kind, person: actor, actor, status: "pending", source: "manual", payload: req.body?.payload ?? {}, targetId: id });
  res.status(201).json(s);
}));

// ── Approvals ───────────────────────────────────────────────────────────────

router.get("/approvals", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const snap = await orgSnapshot();
  const status = req.query.status === "history" ? "history" : "pending";
  if (status === "history") {
    const rows = await db.select({ s: submissions, personName: people.fullName }).from(submissions)
      .innerJoin(people, eq(people.id, submissions.personId))
      .where(and(eq(submissions.reviewedBy, actor.id), inArray(submissions.status, ["approved", "rejected", "returned"])))
      .orderBy(desc(submissions.reviewedAt)).limit(300);
    res.json(rows.map((r) => ({ ...r.s, personName: r.personName })));
    return;
  }
  const rows = await db.select({ s: submissions, personName: people.fullName, personEmail: people.email, unitName: orgUnits.name })
    .from(submissions)
    .innerJoin(people, eq(people.id, submissions.personId))
    .leftJoin(orgUnits, eq(orgUnits.id, submissions.orgUnitId))
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.submittedAt));
  const mine = rows.filter((r) => {
    if (actor.systemRole === "admin") return true;
    return routeApproval(snap, r.s.orgUnitId, r.s.personId).approverIds.includes(actor.id);
  });
  res.json(mine.map((r) => ({
    ...r.s, personName: r.personName, personEmail: r.personEmail, unitName: r.unitName,
    route: routeApproval(snap, r.s.orgUnitId, r.s.personId).level,
  })));
}));

router.post("/approvals/:id", requireUser, requireService("approvals"), asyncHandler(async (req, res) => {
  const decision = req.body?.decision;
  if (!["approve", "reject", "return"].includes(decision)) throw new HttpError(400, "decision must be approve, reject or return");
  res.json(await wf.review(intParam(req.params.id) ?? 0, await me(req), decision, str(req.body?.comment)));
}));

router.post("/approvals-bulk", requireUser, requireService("approvals"), asyncHandler(async (req, res) => {
  const actor = await me(req);
  const ids: number[] = (req.body?.ids ?? []).map(intParam).filter(Boolean);
  const decision = req.body?.decision === "reject" ? "reject" : req.body?.decision === "return" ? "return" : "approve";
  let done = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await wf.review(id, actor, decision, str(req.body?.comment));
      done++;
    } catch (err) {
      errors.push(`#${id}: ${(err as Error).message}`);
    }
  }
  res.json({ done, errors });
}));

// ── Admin maintenance on permanent records ─────────────────────────────────

router.patch(["/admin/outputs/:id", "/admin/activities/:id"], requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  if (actor.systemRole !== "admin") throw new HttpError(403, "Administrator role required");
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ("featured" in req.body) set.featured = Boolean(req.body.featured);
  if ("visibility" in req.body) set.visibility = req.body.visibility === "internal" ? "internal" : "public";
  const table = req.path.startsWith("/admin/outputs") ? researchOutputs : activities;
  await db.update(table).set(set).where(eq(table.id, id));
  res.json({ ok: true });
}));

router.delete(["/admin/outputs/:id", "/admin/activities/:id"], requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  if (actor.systemRole !== "admin") throw new HttpError(403, "Administrator role required");
  const id = intParam(req.params.id);
  if (!id) throw new HttpError(400, "Invalid id");
  if (req.path.startsWith("/admin/outputs")) {
    await db.delete(researchOutputAuthors).where(eq(researchOutputAuthors.outputId, id));
    await db.delete(researchOutputs).where(eq(researchOutputs.id, id));
    await db.update(submissions).set({ resultId: null }).where(and(eq(submissions.kind, "output"), eq(submissions.resultId, id)));
  } else {
    await db.delete(activities).where(eq(activities.id, id));
    await db.update(submissions).set({ resultId: null }).where(and(eq(submissions.kind, "activity"), eq(submissions.resultId, id)));
  }
  res.json({ ok: true });
}));

/** Remove the link between a person and an output (e.g. claimed in error). */
router.delete("/outputs/:id/authors/:personId", requireUser, asyncHandler(async (req, res) => {
  const actor = await me(req);
  const id = intParam(req.params.id);
  const personId = intParam(req.params.personId);
  if (!id || !personId) throw new HttpError(400, "Invalid id");
  if (actor.systemRole !== "admin" && actor.id !== personId) throw new HttpError(403, "Not allowed");
  await db.delete(researchOutputAuthors).where(and(eq(researchOutputAuthors.outputId, id), eq(researchOutputAuthors.personId, personId)));
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(researchOutputAuthors).where(eq(researchOutputAuthors.outputId, id));
  if (!left?.n) await db.delete(researchOutputs).where(eq(researchOutputs.id, id));
  res.json({ ok: true });
}));

export default router;
