import type { OutputType } from "@workspace/db";
import { normalizeDoi } from "../util";
import { env, fetchJson, splitName, type HarvestedWork, type Provider } from "./types";

const BASE = "https://api.elsevier.com/content";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "X-ELS-APIKey": env("SCOPUS_API_KEY") };
  if (env("SCOPUS_INSTTOKEN")) h["X-ELS-Insttoken"] = env("SCOPUS_INSTTOKEN");
  return h;
}

function mapType(sub: string): OutputType {
  const map: Record<string, OutputType> = {
    Article: "journal_article", "Conference Paper": "conference_paper", Review: "review_article",
    Book: "book", "Book Chapter": "book_chapter", Editorial: "editorial", Letter: "other", "Data Paper": "dataset",
  };
  return map[sub] ?? "other";
}

/** Elsevier Scopus Search / Author Search APIs. Requires an institutional subscription. */
export const scopus: Provider = {
  key: "scopus",
  name: "Scopus (Elsevier)",
  paid: true,
  idField: "scopusAuthorId",
  configured: () => Boolean(env("SCOPUS_API_KEY")),
  configHint: "Paid / subscription. Set SCOPUS_API_KEY (dev.elsevier.com) and, off-campus, SCOPUS_INSTTOKEN. SCOPUS_AFFILIATION_ID narrows author search.",

  async searchAuthors(name: string) {
    const { given, family } = splitName(name);
    let q = `AUTHLASTNAME(${family})` + (given ? ` AND AUTHFIRST(${given})` : "");
    if (env("SCOPUS_AFFILIATION_ID")) q += ` AND AF-ID(${env("SCOPUS_AFFILIATION_ID")})`;
    const data = await fetchJson(`${BASE}/search/author?query=${encodeURIComponent(q)}&count=15`, headers());
    return (data["search-results"]?.entry ?? []).filter((e: any) => e["dc:identifier"]).map((e: any) => ({
      provider: "scopus" as const,
      id: String(e["dc:identifier"]).replace("AUTHOR_ID:", ""),
      name: [e["preferred-name"]?.["given-name"], e["preferred-name"]?.surname].filter(Boolean).join(" "),
      orcid: e.orcid ?? null,
      affiliation: e["affiliation-current"]?.["affiliation-name"] ?? null,
      worksCount: Number(e["document-count"]) || null,
      topics: (Array.isArray(e["subject-area"]) ? e["subject-area"] : [e["subject-area"]]).filter(Boolean).slice(0, 3).map((s: any) => s.$),
    }));
  },

  async worksByAuthorId(id: string): Promise<HarvestedWork[]> {
    const out: HarvestedWork[] = [];
    for (let start = 0; start < 2000; start += 25) {
      const data = await fetchJson(
        `${BASE}/search/scopus?query=${encodeURIComponent(`AU-ID(${id})`)}&count=25&start=${start}`,
        headers(),
      );
      const entries = data["search-results"]?.entry ?? [];
      for (const e of entries) {
        if (e.error) continue;
        const doi = normalizeDoi(e["prism:doi"]);
        const date = e["prism:coverDate"] ?? null;
        out.push({
          provider: "scopus",
          externalId: e.eid,
          type: mapType(e.subtypeDescription),
          title: e["dc:title"] ?? "(untitled)",
          publicationYear: date ? Number(String(date).slice(0, 4)) : null,
          publicationDate: date,
          venue: e["prism:publicationName"] ?? null,
          volume: e["prism:volume"] ?? null,
          issue: e["prism:issueIdentifier"] ?? null,
          pages: e["prism:pageRange"] ?? null,
          doi,
          issn: e["prism:issn"] ?? null,
          url: doi ? `https://doi.org/${doi}` : null,
          oaStatus: e.openaccessFlag === true || e.openaccess === "1" ? "gold" : "unknown",
          keywords: [],
          sdgs: [],
          authors: e["dc:creator"] ? [{ name: e["dc:creator"], position: 1 }] : [],
          collabCountries: [],
          citationCount: Number(e["citedby-count"]) || 0,
          externalIds: { scopus_eid: e.eid },
        });
      }
      const total = Number(data["search-results"]?.["opensearch:totalResults"] ?? 0);
      if (start + 25 >= total || !entries.length) break;
    }
    return out;
  },
};
