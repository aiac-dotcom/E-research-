import { db, researchOutputs, researchOutputAuthors, activities, people, orgUnits } from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { descendants, orgSnapshot } from "./approval";
import { csvEscape, intParam, str } from "./util";

export const OPEN_OA = ["gold", "diamond", "green", "hybrid", "bronze"];

export type OutputFilters = {
  q?: string | null; type?: string | null; yearFrom?: number | null; yearTo?: number | null;
  unitId?: number | null; personId?: number | null; oa?: string | null; sdg?: number | null;
  featured?: boolean; publicOnly?: boolean; sort?: string | null; page?: number; pageSize?: number;
};

export function filtersFromQuery(q: Record<string, unknown>): OutputFilters {
  return {
    q: str(q.q, 200), type: str(q.type, 40), yearFrom: intParam(q.yearFrom), yearTo: intParam(q.yearTo),
    unitId: intParam(q.unitId), personId: intParam(q.personId), oa: str(q.oa, 10), sdg: intParam(q.sdg),
    featured: q.featured === "1", sort: str(q.sort, 20),
    page: intParam(q.page) ?? 1, pageSize: Math.min(intParam(q.pageSize) ?? 25, 200),
  };
}

async function outputConditions(f: OutputFilters): Promise<SQL[]> {
  const c: SQL[] = [];
  if (f.publicOnly) c.push(eq(researchOutputs.visibility, "public"));
  if (f.q) {
    const like = `%${f.q}%`;
    c.push(sql`(${researchOutputs.title} ilike ${like} or ${researchOutputs.venue} ilike ${like} or ${researchOutputs.doi} ilike ${like}
      or array_to_string(${researchOutputs.keywords}, ' ') ilike ${like} or ${researchOutputs.authors}::text ilike ${like})`);
  }
  if (f.type) c.push(inArray(researchOutputs.type, f.type.split(",") as any));
  if (f.yearFrom) c.push(gte(researchOutputs.publicationYear, f.yearFrom));
  if (f.yearTo) c.push(lte(researchOutputs.publicationYear, f.yearTo));
  if (f.oa === "open") c.push(inArray(researchOutputs.oaStatus, OPEN_OA as any));
  else if (f.oa) c.push(eq(researchOutputs.oaStatus, f.oa as any));
  if (f.sdg) c.push(sql`${f.sdg} = any(${researchOutputs.sdgs})`);
  if (f.featured) c.push(eq(researchOutputs.featured, true));
  if (f.personId) {
    c.push(sql`exists (select 1 from ${researchOutputAuthors} roa where roa.output_id = ${researchOutputs.id} and roa.person_id = ${f.personId})`);
  }
  if (f.unitId) {
    const ids = descendants(await orgSnapshot(), f.unitId);
    c.push(sql`exists (select 1 from ${researchOutputAuthors} roa where roa.output_id = ${researchOutputs.id}
      and roa.org_unit_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))`);
  }
  return c;
}

export async function searchOutputs(f: OutputFilters) {
  const conds = await outputConditions(f);
  const where = conds.length ? and(...conds) : undefined;
  const order = f.sort === "citations" ? [desc(researchOutputs.citationCount)]
    : f.sort === "title" ? [asc(researchOutputs.title)]
      : [sql`${researchOutputs.publicationYear} desc nulls last`, desc(researchOutputs.id)];
  const pageSize = f.pageSize ?? 25;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(researchOutputs).where(where).orderBy(...order).limit(pageSize).offset(((f.page ?? 1) - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(researchOutputs).where(where),
  ]);
  return { total, page: f.page ?? 1, pageSize, items: await withInternalAuthors(rows, f.publicOnly) };
}

export async function withInternalAuthors<T extends { id: number }>(rows: T[], publicOnly = false) {
  if (!rows.length) return [];
  const links = await db.select({
    outputId: researchOutputAuthors.outputId, personId: people.id, fullName: people.fullName, slug: people.slug,
    profilePublic: people.profilePublic, unitName: orgUnits.name,
  }).from(researchOutputAuthors)
    .innerJoin(people, eq(people.id, researchOutputAuthors.personId))
    .leftJoin(orgUnits, eq(orgUnits.id, researchOutputAuthors.orgUnitId))
    .where(inArray(researchOutputAuthors.outputId, rows.map((r) => r.id)));
  return rows.map((r) => ({
    ...r,
    internalAuthors: links.filter((l) => l.outputId === r.id && (!publicOnly || l.profilePublic))
      .map(({ outputId, ...l }) => l),
  }));
}

export async function allOutputsForExport(f: OutputFilters) {
  const conds = await outputConditions(f);
  return db.select().from(researchOutputs).where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${researchOutputs.publicationYear} desc nulls last`).limit(20000);
}

type Out = typeof researchOutputs.$inferSelect;

const BIB_TYPE: Record<string, string> = {
  journal_article: "article", review_article: "article", conference_paper: "inproceedings", book: "book",
  book_chapter: "incollection", thesis: "phdthesis", report: "techreport", preprint: "misc", dataset: "misc",
  software: "software", patent: "patent", editorial: "article", other: "misc",
};
const bibEsc = (s: string) => s.replace(/[{}\\]/g, "").replace(/([&%$#_])/g, "\\$1");

export function toBibtex(rows: Out[]): string {
  return rows.map((o) => {
    const first = (o.authors[0]?.name ?? "anon").split(/\s+/).pop()!.replace(/[^A-Za-z]/g, "").toLowerCase() || "anon";
    const key = `${first}${o.publicationYear ?? ""}_${o.id}`;
    const venueField = o.type === "conference_paper" || o.type === "book_chapter" ? "booktitle" : "journal";
    const f: [string, string | number | null | undefined][] = [
      ["title", o.title], ["author", o.authors.map((a) => a.name).join(" and ")], ["year", o.publicationYear],
      [venueField, o.venue], ["publisher", o.publisher], ["volume", o.volume], ["number", o.issue],
      ["pages", o.pages?.replace("-", "--")], ["doi", o.doi], ["isbn", o.isbn], ["issn", o.issn], ["url", o.url],
      ["keywords", o.keywords.join(", ")],
    ];
    const body = f.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `  ${k} = {${bibEsc(String(v))}}`).join(",\n");
    return `@${BIB_TYPE[o.type] ?? "misc"}{${key},\n${body}\n}`;
  }).join("\n\n") + "\n";
}

const RIS_TYPE: Record<string, string> = {
  journal_article: "JOUR", review_article: "JOUR", conference_paper: "CONF", book: "BOOK", book_chapter: "CHAP",
  thesis: "THES", report: "RPRT", preprint: "UNPB", dataset: "DATA", software: "COMP", patent: "PAT", editorial: "JOUR", other: "GEN",
};

export function toRis(rows: Out[]): string {
  return rows.map((o) => {
    const l = [`TY  - ${RIS_TYPE[o.type] ?? "GEN"}`, `TI  - ${o.title}`];
    for (const a of o.authors) l.push(`AU  - ${a.name}`);
    if (o.publicationYear) l.push(`PY  - ${o.publicationYear}`);
    if (o.venue) l.push(`T2  - ${o.venue}`);
    if (o.volume) l.push(`VL  - ${o.volume}`);
    if (o.issue) l.push(`IS  - ${o.issue}`);
    if (o.pages) l.push(`SP  - ${o.pages}`);
    if (o.publisher) l.push(`PB  - ${o.publisher}`);
    if (o.doi) l.push(`DO  - ${o.doi}`);
    if (o.issn) l.push(`SN  - ${o.issn}`);
    if (o.url) l.push(`UR  - ${o.url}`);
    for (const k of o.keywords) l.push(`KW  - ${k}`);
    if (o.abstract) l.push(`AB  - ${o.abstract.replace(/\s+/g, " ")}`);
    l.push("ER  - ");
    return l.join("\r\n");
  }).join("\r\n\r\n") + "\r\n";
}

export function toCsv(rows: Out[]): string {
  const cols = ["id", "type", "title", "authors", "publicationYear", "venue", "publisher", "volume", "issue", "pages",
    "doi", "isbn", "issn", "oaStatus", "citationCount", "keywords", "sdgs", "url"] as const;
  const lines = [cols.join(",")];
  for (const o of rows) {
    lines.push(cols.map((c) => csvEscape(c === "authors" ? o.authors.map((a) => a.name) : (o as any)[c])).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function searchActivities(f: { q?: string | null; type?: string | null; personId?: number | null; unitId?: number | null;
  yearFrom?: number | null; yearTo?: number | null; publicOnly?: boolean; featured?: boolean; limit?: number }) {
  const c: SQL[] = [];
  if (f.publicOnly) c.push(eq(activities.visibility, "public"));
  if (f.q) c.push(sql`(${activities.title} ilike ${"%" + f.q + "%"} or ${activities.organisation} ilike ${"%" + f.q + "%"} or ${activities.funder} ilike ${"%" + f.q + "%"})`);
  if (f.type) c.push(inArray(activities.type, f.type.split(",") as any));
  if (f.personId) c.push(eq(activities.personId, f.personId));
  if (f.featured) c.push(eq(activities.featured, true));
  if (f.yearFrom) c.push(sql`extract(year from ${activities.startDate}) >= ${f.yearFrom}`);
  if (f.yearTo) c.push(sql`extract(year from ${activities.startDate}) <= ${f.yearTo}`);
  if (f.unitId) c.push(inArray(activities.orgUnitId, descendants(await orgSnapshot(), f.unitId)));
  if (f.publicOnly) c.push(eq(people.profilePublic, true));
  const rows = await db.select({ a: activities, personName: people.fullName, personSlug: people.slug, unitName: orgUnits.name })
    .from(activities)
    .innerJoin(people, eq(people.id, activities.personId))
    .leftJoin(orgUnits, eq(orgUnits.id, activities.orgUnitId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(sql`${activities.startDate} desc nulls last`, desc(activities.id))
    .limit(Math.min(f.limit ?? 500, 5000));
  return rows.map((r) => ({ ...r.a, personName: r.personName, personSlug: r.personSlug, unitName: r.unitName }));
}
