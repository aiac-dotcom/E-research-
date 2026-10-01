import type { OutputType } from "@workspace/db";
import { normalizeDoi, normalizeOrcid } from "../util";
import { env, fetchJson, stripTags, type HarvestedWork, type Provider } from "./types";

const BASE = "https://api.crossref.org";

function mapType(t: string): OutputType {
  const map: Record<string, OutputType> = {
    "journal-article": "journal_article", "proceedings-article": "conference_paper", book: "book",
    monograph: "book", "edited-book": "book", "book-chapter": "book_chapter", "posted-content": "preprint",
    dataset: "dataset", report: "report", dissertation: "thesis", "reference-entry": "other",
  };
  return map[t] ?? "other";
}

function dateParts(m: any): { year: number | null; date: string | null } {
  const dp = (m.published ?? m["published-print"] ?? m["published-online"] ?? m.issued)?.["date-parts"]?.[0];
  if (!dp?.[0]) return { year: null, date: null };
  const [y, mo, d] = dp;
  return { year: y, date: mo ? `${y}-${String(mo).padStart(2, "0")}-${String(d ?? 1).padStart(2, "0")}` : null };
}

export function mapCrossref(m: any): HarvestedWork {
  const { year, date } = dateParts(m);
  const doi = normalizeDoi(m.DOI);
  return {
    provider: "crossref",
    externalId: doi ?? String(m.URL ?? ""),
    type: mapType(m.type),
    title: stripTags(m.title?.[0]) ?? "(untitled)",
    abstract: stripTags(m.abstract),
    publicationYear: year,
    publicationDate: date,
    venue: m["container-title"]?.[0] ?? m.event?.name ?? null,
    publisher: m.publisher ?? null,
    volume: m.volume ?? null,
    issue: m.issue ?? null,
    pages: m.page ?? null,
    doi,
    isbn: m.ISBN?.[0] ?? null,
    issn: m.ISSN?.[0] ?? null,
    url: doi ? `https://doi.org/${doi}` : m.URL ?? null,
    language: m.language ?? null,
    oaStatus: "unknown",
    keywords: (m.subject ?? []).slice(0, 12),
    sdgs: [],
    authors: (m.author ?? []).map((a: any, i: number) => ({
      name: [a.given, a.family].filter(Boolean).join(" ") || a.name || "",
      orcid: normalizeOrcid(a.ORCID),
      position: i + 1,
      institutions: (a.affiliation ?? []).map((x: any) => x.name).filter(Boolean),
    })),
    collabCountries: [],
    citationCount: m["is-referenced-by-count"] ?? null,
    externalIds: doi ? { doi } : {},
  };
}

const ua = () => ({ "User-Agent": `E-Research-Platform/1.0 (mailto:${env("HARVEST_CONTACT_EMAIL") || "admin@example.org"})` });

export const crossref: Provider = {
  key: "crossref",
  name: "Crossref",
  paid: false,
  idField: null,
  configured: () => true,
  configHint: "Free. Used for DOI look-ups and for name + affiliation searches (set INSTITUTION_NAME). Set HARVEST_CONTACT_EMAIL to join the polite pool.",

  /** Crossref has no author identities; "id" here is the search name. */
  async searchAuthors(name: string) {
    return [{
      provider: "crossref" as const,
      id: name,
      name,
      affiliation: env("INSTITUTION_NAME") || null,
      topics: ["Name + affiliation search (no author profile)"],
    }];
  },

  async worksByAuthorId(name: string) {
    const u = new URL(BASE + "/works");
    u.searchParams.set("query.author", name);
    if (env("INSTITUTION_NAME")) u.searchParams.set("query.affiliation", env("INSTITUTION_NAME"));
    u.searchParams.set("rows", "100");
    const data = await fetchJson(u.toString(), ua());
    const family = name.trim().split(/\s+/).pop()!.toLowerCase();
    // Keep only works where an author actually carries the family name.
    return (data.message?.items ?? [])
      .filter((m: any) => (m.author ?? []).some((a: any) => String(a.family ?? "").toLowerCase() === family))
      .map(mapCrossref);
  },

  async lookupDoi(doi: string) {
    try {
      const data = await fetchJson(`${BASE}/works/${encodeURIComponent(doi)}`, ua());
      return mapCrossref(data.message);
    } catch {
      return null;
    }
  },
};
