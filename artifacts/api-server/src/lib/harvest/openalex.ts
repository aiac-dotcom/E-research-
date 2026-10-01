import type { OaStatus, OutputType } from "@workspace/db";
import { normalizeDoi, normalizeOrcid } from "../util";
import { env, fetchJson, type AuthorCandidate, type HarvestedWork, type Provider } from "./types";

const BASE = "https://api.openalex.org";

function url(path: string, params: Record<string, string>) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (env("OPENALEX_API_KEY")) u.searchParams.set("api_key", env("OPENALEX_API_KEY"));
  if (env("HARVEST_CONTACT_EMAIL")) u.searchParams.set("mailto", env("HARVEST_CONTACT_EMAIL"));
  return u.toString();
}

const shortId = (id: string) => id.replace(/^https?:\/\/openalex\.org\//i, "");

function abstractFromIndex(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  return words.join(" ").trim() || null;
}

function mapType(w: any): OutputType {
  const t = String(w.type ?? "");
  const srcType = w.primary_location?.source?.type;
  if (t === "article") return srcType === "conference" ? "conference_paper" : "journal_article";
  const map: Record<string, OutputType> = {
    book: "book", "book-chapter": "book_chapter", dataset: "dataset", preprint: "preprint",
    review: "review_article", dissertation: "thesis", report: "report", editorial: "editorial",
    standard: "report", "peer-review": "other", erratum: "other", letter: "other",
  };
  return map[t] ?? "other";
}

export function mapOpenAlexWork(w: any): HarvestedWork {
  const authors = (w.authorships ?? []).map((a: any, i: number) => ({
    name: a.author?.display_name ?? a.raw_author_name ?? "",
    orcid: normalizeOrcid(a.author?.orcid),
    position: i + 1,
    institutions: (a.institutions ?? []).map((x: any) => x.display_name).filter(Boolean),
    countries: a.countries ?? [],
  }));
  const countries = [...new Set<string>(authors.flatMap((a: any) => a.countries))];
  const doi = normalizeDoi(w.doi);
  const loc = w.primary_location ?? {};
  const b = w.biblio ?? {};
  return {
    provider: "openalex",
    externalId: shortId(w.id),
    type: mapType(w),
    title: w.display_name ?? w.title ?? "(untitled)",
    abstract: abstractFromIndex(w.abstract_inverted_index),
    publicationYear: w.publication_year ?? null,
    publicationDate: w.publication_date ?? null,
    venue: loc.source?.display_name ?? null,
    publisher: loc.source?.host_organization_name ?? null,
    volume: b.volume ?? null,
    issue: b.issue ?? null,
    pages: b.first_page ? (b.last_page ? `${b.first_page}-${b.last_page}` : b.first_page) : null,
    doi,
    issn: loc.source?.issn_l ?? null,
    url: doi ? `https://doi.org/${doi}` : loc.landing_page_url ?? null,
    language: w.language ?? null,
    oaStatus: (["gold", "diamond", "green", "hybrid", "bronze", "closed"].includes(w.open_access?.oa_status)
      ? w.open_access.oa_status : "unknown") as OaStatus,
    keywords: (w.keywords ?? []).map((k: any) => k.display_name).filter(Boolean).slice(0, 12),
    sdgs: (w.sustainable_development_goals ?? [])
      .map((s: any) => Number(String(s.id).split("/").pop()))
      .filter((n: number) => n >= 1 && n <= 17),
    authors,
    collabCountries: countries,
    citationCount: w.cited_by_count ?? 0,
    externalIds: { openalex: shortId(w.id), ...(w.ids?.pmid ? { pmid: String(w.ids.pmid).split("/").pop()! } : {}) },
  };
}

export const openalex: Provider = {
  key: "openalex",
  name: "OpenAlex",
  paid: false,
  idField: "openalexAuthorId",
  configured: () => true,
  configHint: "Free. Set OPENALEX_API_KEY (free key from openalex.org) for a dedicated daily budget, and INSTITUTION_ROR to rank local authors first.",

  async searchAuthors(name: string): Promise<AuthorCandidate[]> {
    const params: Record<string, string> = { search: name, "per-page": "15" };
    const data = await fetchJson(url("/authors", params));
    const ror = env("INSTITUTION_ROR").replace(/^https?:\/\/ror\.org\//, "");
    const results: AuthorCandidate[] = (data.results ?? []).map((a: any) => ({
      provider: "openalex" as const,
      id: shortId(a.id),
      name: a.display_name,
      orcid: normalizeOrcid(a.orcid),
      affiliation: a.last_known_institutions?.[0]?.display_name ?? a.affiliations?.[0]?.institution?.display_name ?? null,
      worksCount: a.works_count,
      citedByCount: a.cited_by_count,
      topics: (a.topics ?? []).slice(0, 3).map((t: any) => t.display_name),
      url: a.id,
      _local: ror && JSON.stringify(a.affiliations ?? a.last_known_institutions ?? []).includes(ror),
    }));
    return results.sort((x: any, y: any) => Number(y._local) - Number(x._local)).map(({ _local, ...r }: any) => r);
  },

  async worksByAuthorId(id: string): Promise<HarvestedWork[]> {
    const out: HarvestedWork[] = [];
    const orcid = normalizeOrcid(id);
    const filter = orcid ? `author.orcid:${orcid}` : `author.id:${shortId(id)}`;
    let cursor = "*";
    for (let page = 0; page < 10 && cursor; page++) {
      const data = await fetchJson(url("/works", { filter, "per-page": "100", cursor }));
      out.push(...(data.results ?? []).map(mapOpenAlexWork));
      cursor = data.meta?.next_cursor ?? "";
    }
    return out;
  },

  async lookupDoi(doi: string) {
    try {
      return mapOpenAlexWork(await fetchJson(url(`/works/doi:${doi}`, {})));
    } catch {
      return null;
    }
  },
};
