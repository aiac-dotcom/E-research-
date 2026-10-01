import type { AuthorEntry, OaStatus, OutputType } from "@workspace/db";

export type ProviderKey = "openalex" | "crossref" | "orcid" | "semantic_scholar" | "scopus" | "wos";

export type HarvestedWork = {
  provider: ProviderKey;
  providers?: ProviderKey[];
  externalId: string;
  type: OutputType;
  title: string;
  abstract?: string | null;
  publicationYear?: number | null;
  publicationDate?: string | null;
  venue?: string | null;
  publisher?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  isbn?: string | null;
  issn?: string | null;
  url?: string | null;
  language?: string | null;
  oaStatus: OaStatus;
  keywords: string[];
  sdgs: number[];
  authors: AuthorEntry[];
  collabCountries: string[];
  citationCount?: number | null;
  externalIds: Record<string, string>;
};

export type AuthorCandidate = {
  provider: ProviderKey;
  id: string;
  name: string;
  orcid?: string | null;
  affiliation?: string | null;
  worksCount?: number | null;
  citedByCount?: number | null;
  topics?: string[];
  url?: string | null;
};

/** Identifiers known for a person; providers use whichever they understand. */
export type PersonIds = {
  fullName: string;
  nameVariants?: string[];
  orcid?: string | null;
  openalexAuthorId?: string | null;
  semanticScholarId?: string | null;
  scopusAuthorId?: string | null;
  wosResearcherId?: string | null;
};

export interface Provider {
  key: ProviderKey;
  name: string;
  /** Requires a paid subscription / institutional key. */
  paid: boolean;
  /** Identifier field on the person record used by this provider. */
  idField: keyof PersonIds | null;
  configured(): boolean;
  configHint: string;
  searchAuthors?(name: string): Promise<AuthorCandidate[]>;
  worksByAuthorId?(id: string): Promise<HarvestedWork[]>;
  lookupDoi?(doi: string): Promise<HarvestedWork | null>;
}

export const env = (k: string) => (process.env[k] ?? "").trim();

const UA = () => `E-Research-Platform/1.0 (mailto:${env("HARVEST_CONTACT_EMAIL") || "admin@example.org"})`;

export async function fetchJson<T = any>(url: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA(), ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${new URL(url).host} responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

export function stripTags(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export function yearOf(date: string | null | undefined): number | null {
  const m = date?.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export function splitName(full: string): { given: string; family: string } {
  const parts = full.replace(/\b(Prof|Dr|Mr|Mrs|Ms)\.?\s+/gi, "").trim().split(/\s+/);
  if (parts.length === 1) return { given: "", family: parts[0] };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}
