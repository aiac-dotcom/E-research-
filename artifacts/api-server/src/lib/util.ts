import type { Request, Response, NextFunction, RequestHandler } from "express";

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

/** Normalises a DOI to the bare lowercase form, e.g. "10.1000/xyz". */
export function normalizeDoi(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().toLowerCase().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

/** Normalises an ORCID iD to 0000-0000-0000-000X, or null. */
export function normalizeOrcid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.toUpperCase().match(/(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])/);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null;
}

export function normalizeTitle(t: string): string {
  return t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();
}

/** Dedupe key: DOI if present, else normalised title + year. */
export function dedupeKey(title: string, year: number | null | undefined, doi?: string | null): string {
  if (doi) return `doi:${doi}`;
  return `t:${normalizeTitle(title).slice(0, 200)}|${year ?? ""}`;
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function intParam(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function str(v: unknown, max = 5000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function strArray(v: unknown, maxItems = 50): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, maxItems);
  if (typeof v === "string") return v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, maxItems);
  return [];
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
