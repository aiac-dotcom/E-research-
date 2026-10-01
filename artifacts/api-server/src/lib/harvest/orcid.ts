import type { OutputType } from "@workspace/db";
import { normalizeDoi, normalizeOrcid } from "../util";
import { env, fetchJson, splitName, type HarvestedWork, type Provider } from "./types";

const BASE = "https://pub.orcid.org/v3.0";

let token: { value: string; exp: number } | null = null;

/** Optional: a /read-public token raises ORCID rate limits. Anonymous access also works. */
async function authHeader(): Promise<Record<string, string>> {
  if (!env("ORCID_CLIENT_ID") || !env("ORCID_CLIENT_SECRET")) return {};
  if (!token || token.exp < Date.now()) {
    const res = await fetch("https://orcid.org/oauth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("ORCID_CLIENT_ID"), client_secret: env("ORCID_CLIENT_SECRET"),
        grant_type: "client_credentials", scope: "/read-public",
      }),
    });
    if (!res.ok) return {};
    const j: any = await res.json();
    token = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 };
  }
  return { Authorization: `Bearer ${token.value}` };
}

function mapType(t: string): OutputType {
  const map: Record<string, OutputType> = {
    "journal-article": "journal_article", "conference-paper": "conference_paper", book: "book",
    "book-chapter": "book_chapter", preprint: "preprint", "data-set": "dataset", software: "software",
    patent: "patent", "dissertation-thesis": "thesis", report: "report", "edited-book": "book",
  };
  return map[t] ?? "other";
}

export const orcid: Provider = {
  key: "orcid",
  name: "ORCID",
  paid: false,
  idField: "orcid",
  configured: () => true,
  configHint: "Free public API. Optionally set ORCID_CLIENT_ID / ORCID_CLIENT_SECRET (free public API credentials) for higher limits.",

  async searchAuthors(name: string) {
    const { given, family } = splitName(name);
    const q = given ? `given-names:${given} AND family-name:${family}` : `family-name:${family}`;
    const extra = env("INSTITUTION_NAME") ? ` AND affiliation-org-name:"${env("INSTITUTION_NAME")}"` : "";
    const data = await fetchJson(`${BASE}/expanded-search/?q=${encodeURIComponent(q + extra)}&rows=15`, await authHeader());
    let rows = data["expanded-result"] ?? [];
    if (!rows.length && extra) {
      const retry = await fetchJson(`${BASE}/expanded-search/?q=${encodeURIComponent(q)}&rows=15`, await authHeader());
      rows = retry["expanded-result"] ?? [];
    }
    return rows.map((r: any) => ({
      provider: "orcid" as const,
      id: r["orcid-id"],
      name: [r["given-names"], r["family-names"]].filter(Boolean).join(" "),
      orcid: r["orcid-id"],
      affiliation: (r["institution-name"] ?? []).slice(0, 3).join("; ") || null,
      url: `https://orcid.org/${r["orcid-id"]}`,
    }));
  },

  async worksByAuthorId(id: string): Promise<HarvestedWork[]> {
    const oid = normalizeOrcid(id);
    if (!oid) return [];
    const [data, person] = await Promise.all([
      fetchJson(`${BASE}/${oid}/works`, await authHeader()),
      fetchJson(`${BASE}/${oid}/personal-details`, await authHeader()).catch(() => null),
    ]);
    const ownerName = person?.name
      ? [person.name["given-names"]?.value, person.name["family-name"]?.value].filter(Boolean).join(" ")
      : "";
    return (data.group ?? []).map((g: any): HarvestedWork => {
      const s = g["work-summary"]?.[0] ?? {};
      const ids = (g["external-ids"]?.["external-id"] ?? s["external-ids"]?.["external-id"] ?? []) as any[];
      const doi = normalizeDoi(ids.find((x) => x["external-id-type"] === "doi")?.["external-id-value"]);
      const year = Number(s["publication-date"]?.year?.value) || null;
      const month = s["publication-date"]?.month?.value;
      return {
        provider: "orcid",
        externalId: `${oid}/${s["put-code"]}`,
        type: mapType(s.type),
        title: s.title?.title?.value ?? "(untitled)",
        publicationYear: year,
        publicationDate: year && month ? `${year}-${month}-${s["publication-date"]?.day?.value ?? "01"}` : null,
        venue: s["journal-title"]?.value ?? null,
        doi,
        isbn: ids.find((x) => x["external-id-type"] === "isbn")?.["external-id-value"] ?? null,
        url: doi ? `https://doi.org/${doi}` : s.url?.value ?? null,
        oaStatus: "unknown",
        keywords: [],
        sdgs: [],
        authors: ownerName ? [{ name: ownerName, orcid: oid, position: 1 }] : [],
        collabCountries: [],
        externalIds: { orcid_put_code: String(s["put-code"]) },
      };
    });
  },
};
