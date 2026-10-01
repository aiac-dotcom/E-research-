import type { OutputType } from "@workspace/db";
import { normalizeDoi } from "../util";
import { env, fetchJson, splitName, type HarvestedWork, type Provider } from "./types";

const BASE = "https://api.clarivate.com/apis/wos-starter/v1";
const headers = () => ({ "X-ApiKey": env("WOS_API_KEY") });

function mapType(types: string[] = []): OutputType {
  const t = types.map((x) => x.toLowerCase());
  if (t.some((x) => x.includes("proceedings"))) return "conference_paper";
  if (t.includes("review")) return "review_article";
  if (t.includes("book chapter")) return "book_chapter";
  if (t.includes("book")) return "book";
  if (t.includes("editorial material")) return "editorial";
  if (t.includes("article")) return "journal_article";
  return "other";
}

function mapDoc(d: any): HarvestedWork {
  const doi = normalizeDoi(d.identifiers?.doi);
  const wosCites = (d.citations ?? []).find((c: any) => c.db === "WOS")?.count;
  return {
    provider: "wos",
    externalId: d.uid,
    type: mapType(d.types),
    title: d.title ?? "(untitled)",
    publicationYear: d.source?.publishYear ?? null,
    venue: d.source?.sourceTitle ?? null,
    volume: d.source?.volume ?? null,
    issue: d.source?.issue ?? null,
    pages: d.source?.pages?.range ?? null,
    doi,
    issn: d.identifiers?.issn ?? d.identifiers?.eissn ?? null,
    isbn: d.identifiers?.isbn ?? null,
    url: doi ? `https://doi.org/${doi}` : d.links?.record ?? null,
    oaStatus: "unknown",
    keywords: d.keywords?.authorKeywords ?? [],
    sdgs: [],
    authors: (d.names?.authors ?? []).map((a: any, i: number) => ({ name: a.displayName ?? a.wosStandard, position: i + 1 })),
    collabCountries: [],
    citationCount: wosCites ?? null,
    externalIds: { wos_uid: d.uid },
  };
}

/** Clarivate Web of Science Starter API. Requires an API key (institutional / paid plans). */
export const wos: Provider = {
  key: "wos",
  name: "Web of Science (Clarivate)",
  paid: true,
  idField: "wosResearcherId",
  configured: () => Boolean(env("WOS_API_KEY")),
  configHint: "Paid / subscription. Set WOS_API_KEY (developer.clarivate.com, Web of Science Starter API). INSTITUTION_NAME narrows name searches.",

  async searchAuthors(name: string) {
    const { given, family } = splitName(name);
    let q = `AU=(${family}${given ? `, ${given[0]}*` : ""})`;
    if (env("INSTITUTION_NAME")) q += ` AND OG=(${env("INSTITUTION_NAME")})`;
    return [{
      provider: "wos" as const,
      id: `query:${q}`,
      name,
      affiliation: env("INSTITUTION_NAME") || null,
      topics: ["Author + organisation query (enter a ResearcherID on the profile for exact matching)"],
    }];
  },

  async worksByAuthorId(id: string): Promise<HarvestedWork[]> {
    const q = id.startsWith("query:") ? id.slice(6) : `AI=(${id})`;
    const out: HarvestedWork[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await fetchJson(`${BASE}/documents?db=WOS&limit=50&page=${page}&q=${encodeURIComponent(q)}`, headers());
      out.push(...(data.hits ?? []).map(mapDoc));
      const total = Number(data.metadata?.total ?? 0);
      if (page * 50 >= total || !(data.hits ?? []).length) break;
    }
    return out;
  },
};
