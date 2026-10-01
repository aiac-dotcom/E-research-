import type { OutputType } from "@workspace/db";
import { normalizeDoi } from "../util";
import { env, fetchJson, type HarvestedWork, type Provider } from "./types";

const BASE = "https://api.semanticscholar.org/graph/v1";
const headers = (): Record<string, string> => (env("SEMANTIC_SCHOLAR_API_KEY") ? { "x-api-key": env("SEMANTIC_SCHOLAR_API_KEY") } : {});

function mapType(types: string[] | null | undefined): OutputType {
  const t = types ?? [];
  if (t.includes("Conference")) return "conference_paper";
  if (t.includes("Review")) return "review_article";
  if (t.includes("Book")) return "book";
  if (t.includes("BookSection")) return "book_chapter";
  if (t.includes("Dataset")) return "dataset";
  if (t.includes("JournalArticle")) return "journal_article";
  return "other";
}

export const semanticScholar: Provider = {
  key: "semantic_scholar",
  name: "Semantic Scholar",
  paid: false,
  idField: "semanticScholarId",
  configured: () => true,
  configHint: "Free. Anonymous access is heavily rate-limited; request a free SEMANTIC_SCHOLAR_API_KEY.",

  async searchAuthors(name: string) {
    const data = await fetchJson(
      `${BASE}/author/search?query=${encodeURIComponent(name)}&fields=name,affiliations,paperCount,citationCount,externalIds,url&limit=15`,
      headers(),
    );
    return (data.data ?? []).map((a: any) => ({
      provider: "semantic_scholar" as const,
      id: a.authorId,
      name: a.name,
      orcid: a.externalIds?.ORCID ?? null,
      affiliation: (a.affiliations ?? []).join("; ") || null,
      worksCount: a.paperCount,
      citedByCount: a.citationCount,
      url: a.url,
    }));
  },

  async worksByAuthorId(id: string): Promise<HarvestedWork[]> {
    const fields = "title,year,venue,externalIds,citationCount,publicationTypes,authors,abstract,publicationDate,journal,openAccessPdf,url";
    const out: HarvestedWork[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = await fetchJson(`${BASE}/author/${encodeURIComponent(id)}/papers?fields=${fields}&limit=100&offset=${offset}`, headers());
      for (const p of data.data ?? []) {
        const doi = normalizeDoi(p.externalIds?.DOI);
        out.push({
          provider: "semantic_scholar",
          externalId: p.paperId,
          type: mapType(p.publicationTypes),
          title: p.title ?? "(untitled)",
          abstract: p.abstract ?? null,
          publicationYear: p.year ?? null,
          publicationDate: p.publicationDate ?? null,
          venue: p.journal?.name ?? p.venue ?? null,
          volume: p.journal?.volume ?? null,
          pages: p.journal?.pages?.trim() ?? null,
          doi,
          url: doi ? `https://doi.org/${doi}` : p.url ?? null,
          oaStatus: p.openAccessPdf?.url ? "green" : "unknown",
          keywords: [],
          sdgs: [],
          authors: (p.authors ?? []).map((a: any, i: number) => ({ name: a.name, position: i + 1 })),
          collabCountries: [],
          citationCount: p.citationCount ?? null,
          externalIds: { s2: p.paperId },
        });
      }
      if (!data.next) break;
    }
    return out;
  },
};
