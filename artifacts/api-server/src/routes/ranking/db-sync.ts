/**
 * ETL: Excel files → PostgreSQL
 * Reads all ranking data sources and populates the database.
 * Call POST /api/ranking/sync to trigger.
 */
import { db } from "@workspace/db";
import {
  arabRankings, worldRankings,
  qsRanks, qsScores, qsRatios, qsSustainability,
  qsEmploymentOutcomes, qsAcademicRep, qsEmployerRep,
  qsIrn, qsFaculty, qsHub, qsCitations, syncLog,
} from "@workspace/db/schema";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseRankingFile } from "./data-loader.js";

// Resolve DATA_DIR robustly: works whether server runs from
// /artifacts/api-server (../../Data) or from /workspace root (./Data)
function resolveDataDir(): string {
  // Derive __dirname safely for both ESM and tsx CJS
  let thisDir = "";
  try {
    thisDir = fileURLToPath(new URL(".", import.meta.url));
  } catch {
    thisDir = process.cwd();
  }

  const candidates = [
    path.resolve(process.cwd(), "../../Data"),    // server cwd = artifacts/api-server
    path.resolve(process.cwd(), "./Data"),         // cwd = workspace root
    path.resolve(thisDir, "../../../../Data"),     // relative to this file's location
    "/home/runner/workspace/Data",                 // absolute fallback
  ];
  return candidates.find((d) => fs.existsSync(d)) ?? candidates[0];
}

const DATA_DIR = resolveDataDir();
const QS_DIR = path.join(DATA_DIR, "Qs Analytical data");
const ARAB_DIR = path.join(DATA_DIR, "Rankings Result", "Arab Rankings");
const WORLD_DIR = path.join(DATA_DIR, "Rankings Result", "World Rankings");

type Row = Record<string, unknown>;

function readExcelRows(filePath: string, sheetIndex = 0): Row[] {
  try {
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[sheetIndex];
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null }) as Row[];
  } catch {
    return [];
  }
}

function readAllSheets(filePath: string): Record<string, Row[]> {
  try {
    const wb = XLSX.readFile(filePath);
    const result: Record<string, Row[]> = {};
    wb.SheetNames.forEach((name) => {
      result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) as Row[];
    });
    return result;
  } catch {
    return {};
  }
}

const isNizwa = (r: unknown) =>
  JSON.stringify(r).toLowerCase().includes("nizwa");

function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n !== null ? Math.round(n) : null;
}

function rankToInt(v: unknown): number | null {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function batchInsert<T extends object>(table: Parameters<typeof db.insert>[0], rows: T[], chunkSize = 500) {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, chunkSize)) {
    await db.insert(table).values(batch as Parameters<typeof db.insert<typeof table>["values"]>[0]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  tables: Record<string, number>;
  errors: string[];
  durationMs: number;
}

export async function syncAllData(): Promise<SyncResult> {
  const start = Date.now();
  const tables: Record<string, number> = {};
  const errors: string[] = [];

  // ── 1. Arab Rankings ───────────────────────────────────────────────────────
  try {
    await db.delete(arabRankings);
    const arabRows: (typeof arabRankings.$inferInsert)[] = [];

    if (fs.existsSync(ARAB_DIR)) {
      const files = fs.readdirSync(ARAB_DIR).filter((f) => f.endsWith(".xlsx")).sort();
      for (const f of files) {
        const yearMatch = f.match(/^(\d{4})/);
        if (!yearMatch) continue;
        const year = yearMatch[1];
        try {
          const entries = parseRankingFile(path.join(ARAB_DIR, f));
          for (const e of entries) {
            arabRows.push({
              year,
              rank: String(e.rank),
              rankNumeric: rankToInt(e.rank),
              universityName: e.name,
              country: e.country || null,
              scores: e.scores as Record<string, number>,
            });
          }
        } catch (err) {
          errors.push(`Arab ${year}: ${String(err)}`);
        }
      }
    }

    await batchInsert(arabRankings, arabRows);
    tables.arabRankings = arabRows.length;
    await db.insert(syncLog).values({ source: "arab_rankings", rowsLoaded: arabRows.length });
  } catch (err) {
    errors.push(`Arab rankings: ${String(err)}`);
  }

  // ── 2. World Rankings ──────────────────────────────────────────────────────
  try {
    await db.delete(worldRankings);
    const worldRows: (typeof worldRankings.$inferInsert)[] = [];

    if (fs.existsSync(WORLD_DIR)) {
      const files = fs.readdirSync(WORLD_DIR).filter((f) => f.endsWith(".xlsx")).sort();
      for (const f of files) {
        const yearMatch = f.match(/^(\d{4})/);
        if (!yearMatch) continue;
        const year = yearMatch[1];
        try {
          const entries = parseRankingFile(path.join(WORLD_DIR, f));
          for (const e of entries) {
            worldRows.push({
              year,
              rank: String(e.rank),
              rankNumeric: rankToInt(e.rank),
              universityName: e.name,
              country: e.country || null,
              scores: e.scores as Record<string, number>,
            });
          }
        } catch (err) {
          errors.push(`World ${year}: ${String(err)}`);
        }
      }
    }

    await batchInsert(worldRankings, worldRows);
    tables.worldRankings = worldRows.length;
    await db.insert(syncLog).values({ source: "world_rankings", rowsLoaded: worldRows.length });
  } catch (err) {
    errors.push(`World rankings: ${String(err)}`);
  }

  // ── 3. WURT Ranks + Scores ─────────────────────────────────────────────────
  try {
    const wurtFile = path.join(QS_DIR, "wurt_ranks_scores.xlsx");
    const wurt = readAllSheets(wurtFile);
    const rankSheet = (wurt["WURT_ranks"] || []) as Row[];
    const scoreSheet = (wurt["WURT_Scores"] || []) as Row[];

    await db.delete(qsRanks);
    const rankRows: (typeof qsRanks.$inferInsert)[] = rankSheet
      .filter((r) => r["PEER"] && r["RANKINGSYEAR"] && r["RANKINGINDICATOR"])
      .map((r) => ({
        peer: String(r["PEER"]),
        year: String(r["RANKINGSYEAR"]),
        indicator: String(r["RANKINGINDICATOR"]),
        rank: toInt(r["RANK"]),
        countryTerritory: r["COUNTRY_TERRITORY"] ? String(r["COUNTRY_TERRITORY"]) : null,
      }));
    await batchInsert(qsRanks, rankRows);
    tables.qsRanks = rankRows.length;

    await db.delete(qsScores);
    const scoreRows: (typeof qsScores.$inferInsert)[] = scoreSheet
      .filter((r) => r["PEER"] && r["RANKINGSYEAR"] && r["RANKINGINDICATOR"])
      .map((r) => ({
        peer: String(r["PEER"]),
        year: String(r["RANKINGSYEAR"]),
        indicator: String(r["RANKINGINDICATOR"]),
        score: toNum(r["Score"]),
        avgCountryScore: toNum(r["AVERAGE_COUNTRY_SCORE"]),
      }));
    await batchInsert(qsScores, scoreRows);
    tables.qsScores = scoreRows.length;

    await db.insert(syncLog).values({ source: "wurt_ranks_scores", rowsLoaded: rankRows.length + scoreRows.length });
  } catch (err) {
    errors.push(`WURT: ${String(err)}`);
  }

  // ── 4. Underlying Ratios ───────────────────────────────────────────────────
  try {
    const ratioFile = path.join(QS_DIR, "underlying_ratios.xlsx");
    const all = readAllSheets(ratioFile);
    const sheet = (all["underlying_ratios"] || all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsRatios);
    const rows: (typeof qsRatios.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && r["RANKINGSYEAR"])
      .map((r) => {
        // detect peer: try explicit PEER column, fall back to INSTITUTION, then "Nizwa" if isNizwa
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          ratioValue: toNum(r["RATIO_VALUE"]),
        };
      })
      .filter(Boolean) as (typeof qsRatios.$inferInsert)[];

    await batchInsert(qsRatios, rows);
    tables.qsRatios = rows.length;
    await db.insert(syncLog).values({ source: "underlying_ratios", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Ratios: ${String(err)}`);
  }

  // ── 5. Sustainability ──────────────────────────────────────────────────────
  try {
    const sustainFile = path.join(QS_DIR, "sustainability_wurt.xlsx");
    const all = readAllSheets(sustainFile);
    const sheet = (all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsSustainability);
    const rows: (typeof qsSustainability.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && (r["RANKINGS_YEAR"] || r["RANKINGSYEAR"]))
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGS_YEAR"] ?? r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          score: toNum(r["SCORE"]),
          countryAvgScore: toNum(r["COUNTRY_AVERAGE_SCORE"]),
          worldAvgScore: toNum(r["WORLD_AVERAGE_SCORE"]),
        };
      })
      .filter(Boolean) as (typeof qsSustainability.$inferInsert)[];

    await batchInsert(qsSustainability, rows);
    tables.qsSustainability = rows.length;
    await db.insert(syncLog).values({ source: "sustainability_wurt", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Sustainability: ${String(err)}`);
  }

  // ── 6. Employment Outcomes ─────────────────────────────────────────────────
  try {
    const eoFile = path.join(QS_DIR, "underlying_scores_eo.xlsx");
    const all = readAllSheets(eoFile);
    const sheet = (all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsEmploymentOutcomes);
    const rows: (typeof qsEmploymentOutcomes.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && (r["RANKINGS_YEAR"] || r["RANKINGSYEAR"]))
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGS_YEAR"] ?? r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          value: toNum(r["SUM(DATA)"] ?? r["VALUE"] ?? r["SCORE"]),
        };
      })
      .filter(Boolean) as (typeof qsEmploymentOutcomes.$inferInsert)[];

    await batchInsert(qsEmploymentOutcomes, rows);
    tables.qsEmploymentOutcomes = rows.length;
    await db.insert(syncLog).values({ source: "underlying_scores_eo", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Employment Outcomes: ${String(err)}`);
  }

  // ── 7. Academic Reputation Scores ─────────────────────────────────────────
  try {
    const acadFile = path.join(QS_DIR, "reputation_academic_scores.xlsx");
    const all = readAllSheets(acadFile);
    const sheet = (all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsAcademicRep);
    const rows: (typeof qsAcademicRep.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && r["RANKINGSYEAR"])
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          value: toNum(r["VALUE"]),
        };
      })
      .filter(Boolean) as (typeof qsAcademicRep.$inferInsert)[];

    await batchInsert(qsAcademicRep, rows);
    tables.qsAcademicRep = rows.length;
    await db.insert(syncLog).values({ source: "reputation_academic_scores", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Academic Rep: ${String(err)}`);
  }

  // ── 8. Employer Reputation Scores ─────────────────────────────────────────
  try {
    const empFile = path.join(QS_DIR, "reputation_employer_scores.xlsx");
    const all = readAllSheets(empFile);
    const sheet = (all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsEmployerRep);
    const rows: (typeof qsEmployerRep.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && r["RANKINGSYEAR"])
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          value: toNum(r["VALUE"]),
        };
      })
      .filter(Boolean) as (typeof qsEmployerRep.$inferInsert)[];

    await batchInsert(qsEmployerRep, rows);
    tables.qsEmployerRep = rows.length;
    await db.insert(syncLog).values({ source: "reputation_employer_scores", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Employer Rep: ${String(err)}`);
  }

  // ── 9. IRN Scores (irn_scores_subjectarea sheet) ──────────────────────────
  try {
    const irnFile = path.join(QS_DIR, "wurn_irn.xlsx");
    const all = readAllSheets(irnFile);
    // Sheet is "irn_scores_subjectarea"; fall back to second sheet or first
    const sheet = (all["irn_scores_subjectarea"] || all[Object.keys(all)[1]] || all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsIrn);
    const rows: (typeof qsIrn.$inferInsert)[] = sheet
      .filter((r) => r["RANKINGSYEAR"])
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          // columns: SUBJECTAREA, SCALED_SCORE
          subjectArea: r["SUBJECTAREA"] ? String(r["SUBJECTAREA"]) : null,
          score: toNum(r["SCALED_SCORE"] ?? r["IRN_SCORE"] ?? r["SCORE"] ?? r["VALUE"]),
          rank: toInt(r["IRN_RANK"] ?? r["RANK"]),
        };
      })
      .filter(Boolean) as (typeof qsIrn.$inferInsert)[];

    await batchInsert(qsIrn, rows);
    tables.qsIrn = rows.length;
    await db.insert(syncLog).values({ source: "wurn_irn", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`IRN: ${String(err)}`);
  }

  // ── 10. Faculty / Student Data ─────────────────────────────────────────────
  try {
    const facFile = path.join(QS_DIR, "faculty_student_data.xlsx");
    const all = readAllSheets(facFile);
    const sheetName = Object.keys(all).find((k) => k.toLowerCase().includes("faculty")) ?? Object.keys(all)[0];
    const sheet = (all[sheetName] || []) as Row[];

    await db.delete(qsFaculty);
    const rows: (typeof qsFaculty.$inferInsert)[] = sheet
      .filter((r) => r["INDICATOR"] && r["RANKINGSYEAR"])
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          indicator: String(r["INDICATOR"]),
          // columns: FTE, FULL-TIME, PART-TIME, HEADCOUNT; use FTE as primary value
          value: toNum(r["FTE"] ?? r["VALUE"] ?? r["RATIO_VALUE"]),
        };
      })
      .filter(Boolean) as (typeof qsFaculty.$inferInsert)[];

    await batchInsert(qsFaculty, rows);
    tables.qsFaculty = rows.length;
    await db.insert(syncLog).values({ source: "faculty_student_data", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Faculty: ${String(err)}`);
  }

  // ── 11. Citations ──────────────────────────────────────────────────────────
  try {
    const citFile = path.join(QS_DIR, "citations_original_normalized.xlsx");
    const all = readAllSheets(citFile);
    const sheet = (all[Object.keys(all)[0]] || []) as Row[];

    await db.delete(qsCitations);
    const rows: (typeof qsCitations.$inferInsert)[] = sheet
      .filter((r) => r["RANKINGSYEAR"])
      .map((r) => {
        const peerVal = r["PEER"] || r["INSTITUTION"] || r["UNIVERSITY_NAME"];
        const peer = peerVal ? String(peerVal) : isNizwa(r) ? "Nizwa" : null;
        if (!peer) return null;
        return {
          peer,
          year: String(r["RANKINGSYEAR"]),
          rowData: r as Record<string, unknown>,
        };
      })
      .filter(Boolean) as (typeof qsCitations.$inferInsert)[];

    await batchInsert(qsCitations, rows);
    tables.qsCitations = rows.length;
    await db.insert(syncLog).values({ source: "citations_original_normalized", rowsLoaded: rows.length });
  } catch (err) {
    errors.push(`Citations: ${String(err)}`);
  }

  // ── 12. HUB Data ───────────────────────────────────────────────────────────
  try {
    const hubFile = path.join(DATA_DIR, "all Qs data In HUB from cycle 2017.xlsx");
    if (fs.existsSync(hubFile)) {
      const wb = XLSX.readFile(hubFile);
      const sh = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null }) as (string | number | null)[][];

      // Row 0: years; each year occupies 4 cols (Full Time, Part Time, HC, FTE)
      // FTE col = year_col_index + 3
      const yearRow = raw[0];
      const years: { year: string; colFTE: number }[] = [];
      for (let c = 1; c < yearRow.length; c++) {
        const val = yearRow[c];
        if (val !== null && val !== undefined && parseInt(String(val)) <= 2026) {
          years.push({ year: String(val), colFTE: c + 3 });
        }
      }

      const HUB_CATEGORIES = [
        "Faculty Staff",
        "International Faculty Staff",
        "Faculty Staff with PhD",
        "Students - Overall",
        "International Students - Overall",
        "Graduate/Postgraduate Students",
      ];

      await db.delete(qsHub);
      const hubRows: (typeof qsHub.$inferInsert)[] = [];

      for (const cat of HUB_CATEGORIES) {
        const dataRow = raw.find(
          (r) =>
            typeof r[0] === "string" &&
            r[0].endsWith("↔") &&
            r[0].replace("↔", "").trim() === cat
        );
        if (!dataRow) continue;
        for (const { year, colFTE } of years) {
          const val = dataRow[colFTE];
          hubRows.push({ year, category: cat, valueFte: typeof val === "number" ? val : null });
        }
      }

      await batchInsert(qsHub, hubRows);
      tables.qsHub = hubRows.length;
      await db.insert(syncLog).values({ source: "hub_data", rowsLoaded: hubRows.length });
    } else {
      tables.qsHub = 0;
    }
  } catch (err) {
    errors.push(`HUB: ${String(err)}`);
  }

  return { tables, errors, durationMs: Date.now() - start };
}
