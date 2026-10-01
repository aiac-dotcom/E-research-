import {
  db, submissions, approvalEvents, researchOutputs, researchOutputAuthors, activities, people,
  OUTPUT_TYPES, OA_STATUSES, ACTIVITY_TYPES, CREDIT_ROLES,
  type AuthorEntry, type SubmissionStatus, type SubmissionSource, type SubmissionKind,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Person } from "./auth";
import { HttpError, dedupeKey, normalizeDoi, normalizeOrcid, normalizeTitle, str, strArray } from "./util";
import { isEnabled } from "./services";
import { canApprove, orgSnapshot } from "./approval";

type Sub = typeof submissions.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const oneOf = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (v as T[number]) : fallback;

function intOrNull(v: unknown, min = -Infinity, max = Infinity): number | null {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : null;
}

function isoDate(v: unknown): string | null {
  const s = str(v, 30);
  if (!s) return null;
  const m = s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  return `${m[1]}-${(m[2] ?? "1").padStart(2, "0")}-${(m[3] ?? "1").padStart(2, "0")}`;
}

export function cleanOutputPayload(raw: any) {
  const title = str(raw?.title, 1000);
  if (!title) throw new HttpError(400, "Title is required");
  const publicationDate = isoDate(raw.publicationDate);
  const year = intOrNull(raw.publicationYear, 1900, 2100) ?? (publicationDate ? Number(publicationDate.slice(0, 4)) : null);
  const authors: AuthorEntry[] = (Array.isArray(raw.authors) ? raw.authors : strArray(raw.authors, 500).map((name) => ({ name })))
    .slice(0, 500)
    .map((a: any, i: number) => ({
      name: str(a?.name, 300) ?? "",
      orcid: normalizeOrcid(a?.orcid),
      position: intOrNull(a?.position, 1) ?? i + 1,
      personId: intOrNull(a?.personId, 1),
      institutions: strArray(a?.institutions, 10),
      countries: strArray(a?.countries, 10),
    }))
    .filter((a: AuthorEntry) => a.name);
  return {
    type: oneOf(OUTPUT_TYPES, raw.type, "journal_article"),
    title,
    abstract: str(raw.abstract, 20000),
    publicationYear: year,
    publicationDate,
    venue: str(raw.venue, 500),
    publisher: str(raw.publisher, 300),
    volume: str(raw.volume, 50),
    issue: str(raw.issue, 50),
    pages: str(raw.pages, 50),
    doi: normalizeDoi(raw.doi),
    isbn: str(raw.isbn, 40),
    issn: str(raw.issn, 40),
    url: str(raw.url, 1000),
    language: str(raw.language, 20),
    oaStatus: oneOf(OA_STATUSES, raw.oaStatus, "unknown"),
    keywords: strArray(raw.keywords, 25),
    sdgs: (Array.isArray(raw.sdgs) ? raw.sdgs : strArray(raw.sdgs)).map(Number).filter((n: number) => n >= 1 && n <= 17),
    authors,
    collabCountries: strArray(raw.collabCountries, 100).map((c) => c.toUpperCase().slice(0, 2)),
    citationCount: intOrNull(raw.citationCount, 0) ?? 0,
    externalIds: Object.fromEntries(
      Object.entries(raw.externalIds ?? {}).filter(([, v]) => typeof v === "string").slice(0, 20),
    ) as Record<string, string>,
    authorPosition: intOrNull(raw.authorPosition, 1),
    isCorresponding: Boolean(raw.isCorresponding),
    creditRoles: strArray(raw.creditRoles).filter((r) => (CREDIT_ROLES as readonly string[]).includes(r)),
    visibility: raw.visibility === "internal" ? "internal" as const : "public" as const,
    harvestedFrom: strArray(raw.harvestedFrom, 10),
  };
}

export function cleanActivityPayload(raw: any) {
  const title = str(raw?.title, 500);
  if (!title) throw new HttpError(400, "Title is required");
  const amount = raw.amount === "" || raw.amount == null ? null : Number(raw.amount);
  return {
    type: oneOf(ACTIVITY_TYPES, raw.type, "other"),
    title,
    role: str(raw.role, 200),
    description: str(raw.description, 10000),
    startDate: isoDate(raw.startDate),
    endDate: isoDate(raw.endDate),
    location: str(raw.location, 300),
    country: str(raw.country, 100),
    organisation: str(raw.organisation, 300),
    url: str(raw.url, 1000),
    funder: str(raw.funder, 300),
    amount: amount !== null && Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null,
    currency: str(raw.currency, 10)?.toUpperCase() ?? null,
    reference: str(raw.reference, 200),
    scope: (["internal", "national", "regional", "international"].includes(raw.scope) ? raw.scope : null) as
      "internal" | "national" | "regional" | "international" | null,
    metadata: typeof raw.metadata === "object" && raw.metadata ? raw.metadata : {},
    visibility: raw.visibility === "internal" ? "internal" as const : "public" as const,
  };
}

export function cleanPayload(kind: SubmissionKind, raw: unknown) {
  return kind === "output" ? cleanOutputPayload(raw) : cleanActivityPayload(raw);
}

async function logEvent(tx: Tx | typeof db, submissionId: number, actorId: number | null, action: string,
  fromStatus: string | null, toStatus: string | null, comment?: string | null) {
  await tx.insert(approvalEvents).values({ submissionId, actorId, action, fromStatus, toStatus, comment: comment ?? null });
}

export async function createSubmission(opts: {
  kind: SubmissionKind;
  person: Person;
  actor: Person | null;
  status: "candidate" | "pending";
  source: SubmissionSource;
  payload: unknown;
  targetId?: number | null;
}): Promise<Sub> {
  const payload = cleanPayload(opts.kind, opts.payload);
  const year = "publicationYear" in payload ? payload.publicationYear : null;
  const doi = "doi" in payload ? payload.doi : null;
  const [row] = await db.insert(submissions).values({
    kind: opts.kind,
    status: opts.status,
    source: opts.source,
    personId: opts.person.id,
    orgUnitId: opts.person.orgUnitId,
    targetId: opts.targetId ?? null,
    payload,
    title: payload.title,
    doi,
    dedupeKey: opts.kind === "output" ? dedupeKey(payload.title, year, doi) : `a:${normalizeTitle(payload.title)}|${(payload as any).startDate ?? ""}`,
    submittedBy: opts.actor?.id ?? null,
    submittedAt: opts.status === "pending" ? new Date() : null,
  }).returning();
  await logEvent(db, row.id, opts.actor?.id ?? null, opts.status === "candidate" ? "harvested" : "submitted", null, opts.status);
  if (opts.status === "pending" && !(await isEnabled("approvals"))) {
    return approve(row, opts.actor, "Auto-approved (approval workflow disabled)", true);
  }
  return row;
}

async function load(id: number): Promise<Sub> {
  const [s] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  if (!s) throw new HttpError(404, "Submission not found");
  return s;
}

function assertOwnerOrAdmin(sub: Sub, actor: Person) {
  if (sub.personId !== actor.id && actor.systemRole !== "admin") throw new HttpError(403, "Not your submission");
}

async function setStatus(sub: Sub, actor: Person | null, to: SubmissionStatus, action: string, comment?: string | null, extra: Partial<Sub> = {}) {
  const [row] = await db.update(submissions).set({ status: to, updatedAt: new Date(), ...extra })
    .where(and(eq(submissions.id, sub.id), eq(submissions.status, sub.status))).returning();
  if (!row) throw new HttpError(409, "Submission changed meanwhile; reload and try again");
  await logEvent(db, sub.id, actor?.id ?? null, action, sub.status, to, comment);
  return row;
}

/** Person confirms a harvested candidate is theirs → goes to the manager. */
export async function claim(id: number, actor: Person) {
  const sub = await load(id);
  assertOwnerOrAdmin(sub, actor);
  if (sub.status !== "candidate") throw new HttpError(409, "Only candidates can be claimed");
  const row = await setStatus(sub, actor, "pending", "claimed", null, { submittedAt: new Date(), submittedBy: actor.id });
  if (!(await isEnabled("approvals"))) return approve(row, actor, "Auto-approved (approval workflow disabled)", true);
  return row;
}

export async function dismiss(id: number, actor: Person, comment?: string | null) {
  const sub = await load(id);
  assertOwnerOrAdmin(sub, actor);
  if (sub.status !== "candidate") throw new HttpError(409, "Only candidates can be dismissed");
  return setStatus(sub, actor, "dismissed", "dismissed", comment);
}

export async function resubmit(id: number, actor: Person, payload?: unknown) {
  const sub = await load(id);
  assertOwnerOrAdmin(sub, actor);
  if (sub.status !== "returned") throw new HttpError(409, "Only returned submissions can be resubmitted");
  if (payload) await updatePayload(id, actor, payload);
  const fresh = await load(id);
  const row = await setStatus(fresh, actor, "pending", "resubmitted", null, { submittedAt: new Date() });
  if (!(await isEnabled("approvals"))) return approve(row, actor, "Auto-approved (approval workflow disabled)", true);
  return row;
}

export async function updatePayload(id: number, actor: Person, raw: unknown) {
  const sub = await load(id);
  assertOwnerOrAdmin(sub, actor);
  if (!["candidate", "pending", "returned"].includes(sub.status)) throw new HttpError(409, "Approved or closed submissions cannot be edited");
  const payload = cleanPayload(sub.kind, raw);
  const year = "publicationYear" in payload ? payload.publicationYear : null;
  const doi = "doi" in payload ? payload.doi : null;
  const [row] = await db.update(submissions).set({
    payload, title: payload.title, doi, updatedAt: new Date(),
    dedupeKey: sub.kind === "output" ? dedupeKey(payload.title, year, doi) : sub.dedupeKey,
  }).where(eq(submissions.id, id)).returning();
  await logEvent(db, id, actor.id, "edited", sub.status, sub.status);
  return row;
}

export async function withdraw(id: number, actor: Person) {
  const sub = await load(id);
  assertOwnerOrAdmin(sub, actor);
  if (!["candidate", "pending", "returned"].includes(sub.status)) throw new HttpError(409, "Cannot withdraw this submission");
  await db.delete(approvalEvents).where(eq(approvalEvents.submissionId, id));
  await db.delete(submissions).where(eq(submissions.id, id));
}

export async function review(id: number, actor: Person, decision: "approve" | "reject" | "return", comment?: string | null) {
  const sub = await load(id);
  if (sub.status !== "pending") throw new HttpError(409, "Only pending submissions can be reviewed");
  const snap = await orgSnapshot();
  if (!canApprove(snap, actor, sub)) throw new HttpError(403, "You are not an approver for this submission");
  if (decision !== "approve" && !comment?.trim()) throw new HttpError(400, "A comment is required when rejecting or returning");
  if (decision === "approve") return approve(sub, actor, comment ?? null);
  return setStatus(sub, actor, decision === "reject" ? "rejected" : "returned", decision === "reject" ? "rejected" : "returned", comment, {
    reviewedBy: actor.id, reviewedAt: new Date(), reviewComment: comment ?? null,
  });
}

/** Materialise an approved submission into the permanent tables (transactional). */
export async function approve(sub: Sub, actor: Person | null, comment: string | null, auto = false): Promise<Sub> {
  const [owner] = await db.select().from(people).where(eq(people.id, sub.personId)).limit(1);
  const coAuthorOrcids: { orcid: string; outputPayload: unknown }[] = [];
  const row = await db.transaction(async (tx) => {
    let resultId: number;
    if (sub.kind === "output") {
      const p = cleanOutputPayload(sub.payload);
      const { authorPosition, isCorresponding, creditRoles, harvestedFrom, ...fields } = p;
      void harvestedFrom;
      let outputId = sub.targetId ?? null;
      if (!outputId && fields.doi) {
        const [byDoi] = await tx.select({ id: researchOutputs.id }).from(researchOutputs).where(eq(researchOutputs.doi, fields.doi)).limit(1);
        outputId = byDoi?.id ?? null;
      }
      if (!outputId && !fields.doi) {
        const [byTitle] = await tx.select({ id: researchOutputs.id }).from(researchOutputs).where(and(
          sql`lower(regexp_replace(${researchOutputs.title}, '[^a-zA-Z0-9]+', ' ', 'g')) = ${normalizeTitle(fields.title)}`,
          fields.publicationYear ? eq(researchOutputs.publicationYear, fields.publicationYear) : sql`true`,
        )).limit(1);
        outputId = byTitle?.id ?? null;
      }
      if (outputId && sub.targetId) {
        await tx.update(researchOutputs).set({ ...fields, updatedAt: new Date() }).where(eq(researchOutputs.id, outputId));
      } else if (outputId) {
        // Same work already approved for a co-author: keep record, refresh citation count.
        await tx.update(researchOutputs).set({
          citationCount: sql`greatest(${researchOutputs.citationCount}, ${fields.citationCount})`, updatedAt: new Date(),
        }).where(eq(researchOutputs.id, outputId));
      } else {
        const [o] = await tx.insert(researchOutputs).values({
          ...fields, source: sub.source, citationSource: fields.citationCount ? sub.source : null,
          citationsUpdatedAt: fields.citationCount ? new Date() : null,
        }).returning({ id: researchOutputs.id });
        outputId = o.id;
      }
      await tx.insert(researchOutputAuthors).values({
        outputId, personId: sub.personId, authorPosition, isCorresponding, creditRoles,
        orgUnitId: owner?.orgUnitId ?? sub.orgUnitId, approvedBy: actor?.id ?? null,
      }).onConflictDoUpdate({
        target: [researchOutputAuthors.outputId, researchOutputAuthors.personId],
        set: { authorPosition, isCorresponding, creditRoles, approvedBy: actor?.id ?? null, approvedAt: new Date() },
      });
      for (const a of fields.authors) if (a.orcid && a.orcid !== owner?.orcid) coAuthorOrcids.push({ orcid: a.orcid, outputPayload: p });
      resultId = outputId;
    } else {
      const p = cleanActivityPayload(sub.payload);
      if (sub.targetId) {
        await tx.update(activities).set({ ...p, approvedBy: actor?.id ?? null, approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(activities.id, sub.targetId));
        resultId = sub.targetId;
      } else {
        const [a] = await tx.insert(activities).values({
          ...p, personId: sub.personId, orgUnitId: owner?.orgUnitId ?? sub.orgUnitId, approvedBy: actor?.id ?? null,
        }).returning({ id: activities.id });
        resultId = a.id;
      }
    }
    const [updated] = await tx.update(submissions).set({
      status: "approved", resultId, reviewedBy: actor?.id ?? null, reviewedAt: new Date(),
      reviewComment: comment, updatedAt: new Date(),
    }).where(and(eq(submissions.id, sub.id), eq(submissions.status, sub.status))).returning();
    if (!updated) throw new HttpError(409, "Submission changed meanwhile; reload and try again");
    await logEvent(tx, sub.id, actor?.id ?? null, auto ? "auto_approved" : "approved", sub.status, "approved", comment);
    return updated;
  });

  // Co-authors who are staff here get the work suggested as a candidate on their own profile.
  if (coAuthorOrcids.length) {
    const colleagues = await db.select().from(people).where(and(
      inArray(people.orcid, coAuthorOrcids.map((c) => c.orcid)), eq(people.active, true),
    ));
    for (const c of colleagues) {
      if (c.id === sub.personId) continue;
      const entry = coAuthorOrcids.find((x) => x.orcid === c.orcid)!;
      const p = entry.outputPayload as ReturnType<typeof cleanOutputPayload>;
      const key = dedupeKey(p.title, p.publicationYear, p.doi);
      const [exists] = await db.select({ id: submissions.id }).from(submissions)
        .where(and(eq(submissions.personId, c.id), eq(submissions.dedupeKey, key))).limit(1);
      if (exists) continue;
      const pos = p.authors.find((a) => a.orcid === c.orcid)?.position ?? null;
      await createSubmission({
        kind: "output", person: c, actor: null, status: "candidate", source: sub.source,
        payload: { ...p, authorPosition: pos, isCorresponding: false, creditRoles: [] },
      });
    }
  }
  return row;
}
