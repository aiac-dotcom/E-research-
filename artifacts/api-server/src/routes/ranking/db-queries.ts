/**
 * DB → API shape
 * Replaces data-loader.ts functions — all data comes from PostgreSQL.
 */
import { db } from "@workspace/db";
import {
  arabRankings, worldRankings,
  qsRanks, qsScores, qsRatios, qsSustainability,
  qsEmploymentOutcomes, qsAcademicRep, qsEmployerRep,
  qsIrn, qsFaculty, qsHub, qsCitations, syncLog,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type {
  NizwaData, IndicatorScore, TrendPoint, ArabRankPoint, WorldRankPoint, PeerUniversity,
  ArabRankEntry, HubYearData,
} from "./data-loader.js";
import { QS_WEIGHTS, PEER_FULL_NAMES, PEER_COUNTRIES } from "./data-loader.js";
import { memoizeAsync } from "./cache.js";

const NIZWA_PEER = "Nizwa";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLatestNizwaYear(): Promise<string> {
  const row = await db
    .select({ year: qsRanks.year })
    .from(qsRanks)
    .where(and(eq(qsRanks.peer, NIZWA_PEER), eq(qsRanks.indicator, "Overall")))
    .orderBy(desc(qsRanks.year))
    .limit(1);
  return row[0]?.year ?? "2026";
}

// ── NizwaData from DB ─────────────────────────────────────────────────────────

async function loadNizwaDataFromDBImpl(): Promise<NizwaData> {
  const year = await getLatestNizwaYear();

  // Ranks + scores for current year
  const [rankRows, scoreRows] = await Promise.all([
    db.select().from(qsRanks).where(eq(qsRanks.peer, NIZWA_PEER)),
    db.select().from(qsScores).where(eq(qsScores.peer, NIZWA_PEER)),
  ]);

  const currentRanks = rankRows.filter((r) => r.year === year);
  const currentScores = scoreRows.filter((r) => r.year === year);

  const overallRankRow = currentRanks.find((r) => r.indicator === "Overall");
  const overallScoreRow = currentScores.find((r) => r.indicator === "Overall");
  const overallRankNum = overallRankRow?.rank ?? 9999;
  const overallScore = overallScoreRow?.score ?? 0;
  const countryAvgScore = overallScoreRow?.avgCountryScore ?? 0;

  const indicators: IndicatorScore[] = currentScores
    .filter((s) => s.indicator !== "Overall")
    .map((s) => {
      const r = currentRanks.find((r) => r.indicator === s.indicator);
      return {
        indicator: s.indicator,
        score: s.score ?? 0,
        rank: r?.rank ?? 9999,
        countryAvg: s.avgCountryScore ?? 0,
        weight: QS_WEIGHTS[s.indicator] ?? 0,
        year: s.year,
      };
    });

  // Build multi-year trends (score + rank by indicator)
  const trends: Record<string, TrendPoint[]> = {};
  const indicatorNames = [...new Set(rankRows.map((r) => r.indicator))];
  for (const indName of indicatorNames) {
    const trendMap: Record<string, TrendPoint> = {};
    for (const r of rankRows.filter((r) => r.indicator === indName)) {
      trendMap[r.year] = { year: r.year, score: 0, rank: r.rank ?? undefined };
    }
    for (const s of scoreRows.filter((s) => s.indicator === indName)) {
      if (!trendMap[s.year]) trendMap[s.year] = { year: s.year, score: 0 };
      trendMap[s.year].score = s.score ?? 0;
    }
    trends[indName] = Object.values(trendMap).sort((a, b) => a.year.localeCompare(b.year));
  }

  // Ratio trends
  const ratioRows = await db.select().from(qsRatios).where(eq(qsRatios.peer, NIZWA_PEER));
  const ratioNames = [...new Set(ratioRows.map((r) => r.indicator))];
  for (const name of ratioNames) {
    trends[`ratio_${name}`] = ratioRows
      .filter((r) => r.indicator === name)
      .map((r) => ({ year: r.year, score: r.ratioValue ?? 0 }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }

  const ratios: Record<string, number> = {};
  ratioRows.filter((r) => r.year === year).forEach((r) => {
    ratios[r.indicator] = r.ratioValue ?? 0;
  });

  // Supporting data
  const [sustainRows, eoRows, acadRepRows, empRepRows, irnRows, facultyRows, citRows] =
    await Promise.all([
      db.select().from(qsSustainability).where(eq(qsSustainability.peer, NIZWA_PEER)),
      db.select().from(qsEmploymentOutcomes).where(eq(qsEmploymentOutcomes.peer, NIZWA_PEER)),
      db.select().from(qsAcademicRep).where(eq(qsAcademicRep.peer, NIZWA_PEER)),
      db.select().from(qsEmployerRep).where(eq(qsEmployerRep.peer, NIZWA_PEER)),
      db.select().from(qsIrn).where(eq(qsIrn.peer, NIZWA_PEER)),
      db.select().from(qsFaculty).where(eq(qsFaculty.peer, NIZWA_PEER)),
      db.select().from(qsCitations).where(eq(qsCitations.peer, NIZWA_PEER)),
    ]);

  const currentEO = eoRows.filter((r) => r.year === year);

  const employmentOutcome =
    currentEO.find((r) => r.indicator === "Score")?.value ?? 0;

  // Academic & employer rep — use the published QS scores from the WURT file
  // (qs_academic_rep / qs_employer_rep contain raw per-subject-area nomination
  // values that are NOT the normalized 0-100 indicator scores shown publicly).
  const academicRepScore =
    currentScores.find((r) => r.indicator === "Academic Reputation")?.score ?? 0;
  const employerRepScore =
    currentScores.find((r) => r.indicator === "Employer Reputation")?.score ?? 0;

  // Arab & World rank history
  const arabRankHistory = await getArabRankHistoryFromDB();
  const worldRankHistory = await getWorldRankHistoryFromDB();

  // Convert sustainabilityRows to raw Record<string, unknown>[] for compatibility
  const sustainabilityData = sustainRows.map((r) => ({
    INDICATOR: r.indicator,
    SCORE: r.score,
    COUNTRY_AVERAGE_SCORE: r.countryAvgScore,
    WORLD_AVERAGE_SCORE: r.worldAvgScore,
    RANKINGSYEAR: r.year,
  }));

  const facultyData = facultyRows.map((r) => ({
    INDICATOR: r.indicator,
    VALUE: r.value,
    RANKINGSYEAR: r.year,
  }));

  const irnScores = irnRows.map((r) => ({
    SUBJECT_AREA: r.subjectArea,
    IRN_SCORE: r.score,
    IRN_RANK: r.rank,
    RANKINGSYEAR: r.year,
  }));

  const citationsData = citRows.map((r) => r.rowData);

  return {
    overallRank: overallRankNum,
    overallRankRange: overallRankNum > 0 ? `${overallRankNum}` : "",
    overallScore: overallScore ?? 0,
    countryAvgScore: countryAvgScore ?? 0,
    year,
    indicators,
    trends,
    arabRankHistory,
    worldRankHistory,
    ratios,
    facultyData,
    sustainabilityData,
    citationsData,
    irnScores,
    employmentOutcome: employmentOutcome ?? 0,
    academicRepScore: academicRepScore ?? 0,
    employerRepScore: employerRepScore ?? 0,
  };
}

// ── Arab / World rank history ─────────────────────────────────────────────────

async function getArabRankHistoryFromDBImpl(): Promise<ArabRankPoint[]> {
  const rows = await db
    .select({ year: arabRankings.year, rank: arabRankings.rank })
    .from(arabRankings)
    .where(sql`lower(${arabRankings.universityName}) like '%nizwa%'`);
  return rows
    .map((r) => ({ year: r.year, arabRank: r.rank ?? "" }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

async function getWorldRankHistoryFromDBImpl(): Promise<WorldRankPoint[]> {
  const rows = await db
    .select({ year: worldRankings.year, rank: worldRankings.rank })
    .from(worldRankings)
    .where(sql`lower(${worldRankings.universityName}) like '%nizwa%'`);
  return rows
    .map((r) => ({ year: r.year, worldRank: r.rank ?? "" }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// ── Comparison data ───────────────────────────────────────────────────────────

async function loadComparisonDataFromDBImpl(): Promise<PeerUniversity[]> {
  const year = await getLatestNizwaYear();
  const prevYear = String(parseInt(year) - 1);

  const [allRanks, allScores] = await Promise.all([
    db.select().from(qsRanks),
    db.select().from(qsScores),
  ]);

  const peers = [...new Set(allRanks.map((r) => r.peer))].sort();

  const CORE_INDICATORS = [
    "Academic Reputation", "Employer Reputation", "Faculty Student",
    "Citations per Faculty", "International Faculty", "International Students",
    "International Research Network", "Employment Outcomes", "Sustainability",
  ];

  // Get arab ranks for current year to attach arabRank to each peer
  const arabRows = await db
    .select({ universityName: arabRankings.universityName, rank: arabRankings.rank })
    .from(arabRankings)
    .where(eq(arabRankings.year, year));

  return peers.map((peer) => {
    const peerRanks = allRanks.filter((r) => r.peer === peer && r.year === year);
    const peerScores = allScores.filter((r) => r.peer === peer && r.year === year);
    const peerRanksPrev = allRanks.filter((r) => r.peer === peer && r.year === prevYear);

    const overallRankRow = peerRanks.find((r) => r.indicator === "Overall");
    const overallScoreRow = peerScores.find((r) => r.indicator === "Overall");
    const overallRankPrev = peerRanksPrev.find((r) => r.indicator === "Overall");

    const indicators = CORE_INDICATORS.map((ind) => ({
      indicator: ind,
      score: peerScores.find((r) => r.indicator === ind)?.score ?? 0,
      rank: peerRanks.find((r) => r.indicator === ind)?.rank ?? 9999,
      weight: QS_WEIGHTS[ind] ?? 0,
    }));

    const fullName = PEER_FULL_NAMES[peer] ?? peer;
    const STOP_WORDS = new Set([
      "university", "univ", "of", "and", "the", "for", "in", "king",
      "prince", "college", "institute", "technologies", "sciences",
    ]);
    const arabEntry = arabRows.find(
      (a) =>
        a.universityName.toLowerCase().includes(peer.toLowerCase()) ||
        fullName
          .toLowerCase()
          .split(/[\s.,&()]+/)
          .some((w) => w.length >= 5 && !STOP_WORDS.has(w) && a.universityName.toLowerCase().includes(w))
    );

    return {
      peer,
      fullName,
      country:
        PEER_COUNTRIES[peer] ??
        (allRanks.find((r) => r.peer === peer)?.countryTerritory ?? ""),
      overallRank: overallRankRow?.rank ?? 9999,
      overallScore: overallScoreRow?.score ?? 0,
      worldRank2025: overallRankPrev?.rank ?? undefined,
      arabRank: arabEntry?.rank ?? undefined,
      indicators,
    };
  });
}

// ── Arab browser — full ranking for a year ────────────────────────────────────

async function getFullArabRankingForYearFromDBImpl(year: string): Promise<ArabRankEntry[]> {
  const rows = await db
    .select()
    .from(arabRankings)
    .where(eq(arabRankings.year, year));

  return rows
    .map((r) => ({
      rank: r.rankNumeric ?? (r.rank ?? ""),
      name: r.universityName,
      country: r.country ?? "",
      scores: (r.scores as Record<string, number>) ?? {},
      ranks: {},
    }))
    .sort((a, b) => {
      const ra = typeof a.rank === "number" ? a.rank : 9999;
      const rb = typeof b.rank === "number" ? b.rank : 9999;
      return ra - rb;
    }) as ArabRankEntry[];
}

// ── World browser — full ranking for a year ───────────────────────────────────

async function getFullWorldRankingForYearFromDBImpl(year: string): Promise<ArabRankEntry[]> {
  const rows = await db
    .select()
    .from(worldRankings)
    .where(eq(worldRankings.year, year));

  return rows
    .map((r) => ({
      rank: r.rankNumeric ?? (r.rank ?? ""),
      name: r.universityName,
      country: r.country ?? "",
      scores: (r.scores as Record<string, number>) ?? {},
      ranks: {},
    }))
    .sort((a, b) => {
      const ra = typeof a.rank === "number" ? a.rank : 9999;
      const rb = typeof b.rank === "number" ? b.rank : 9999;
      return ra - rb;
    }) as ArabRankEntry[];
}

// ── Available years from DB ───────────────────────────────────────────────────

async function getArabAvailableYearsFromDBImpl(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ year: arabRankings.year })
    .from(arabRankings);
  return rows.map((r) => r.year).sort().reverse();
}

async function getWorldAvailableYearsFromDBImpl(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ year: worldRankings.year })
    .from(worldRankings);
  return rows.map((r) => r.year).sort().reverse();
}

// ── HUB data from DB ──────────────────────────────────────────────────────────

async function getHubDataFromDBImpl(): Promise<HubYearData[]> {
  const rows = await db.select().from(qsHub);

  const yearMap: Record<string, Partial<HubYearData>> = {};
  for (const r of rows) {
    if (!yearMap[r.year]) yearMap[r.year] = { year: r.year };
    const d = yearMap[r.year];
    switch (r.category) {
      case "Faculty Staff":                   d.facultyTotal = r.valueFte; break;
      case "International Faculty Staff":     d.facultyInternational = r.valueFte; break;
      case "Faculty Staff with PhD":          d.facultyPhD = r.valueFte; break;
      case "Students - Overall":              d.studentsTotal = r.valueFte; break;
      case "International Students - Overall":d.studentsInternational = r.valueFte; break;
      case "Graduate/Postgraduate Students":  d.studentsGrad = r.valueFte; break;
    }
  }

  return Object.values(yearMap)
    .map((d) => {
      const fac = d.facultyTotal ?? null;
      const stu = d.studentsTotal ?? null;
      const ratio = fac && stu && fac > 0 ? Math.round((stu / fac) * 10) / 10 : null;
      return {
        year: d.year!,
        facultyTotal: d.facultyTotal ?? null,
        facultyInternational: d.facultyInternational ?? null,
        facultyPhD: d.facultyPhD ?? null,
        studentsTotal: d.studentsTotal ?? null,
        studentsInternational: d.studentsInternational ?? null,
        studentsGrad: d.studentsGrad ?? null,
        studentsFacultyRatio: ratio,
      };
    })
    .sort((a, b) => parseInt(a.year) - parseInt(b.year));
}

// ── Sync history ──────────────────────────────────────────────────────────────

export async function getLastSyncInfo() {
  const rows = await db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.syncedAt))
    .limit(20);
  return rows;
}

export async function isDBPopulated(): Promise<boolean> {
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(qsRanks);
  return (count[0]?.n ?? 0) > 0;
}

// ── Cached exports ────────────────────────────────────────────────────────────
// All ranking reads are served from an in-memory cache that is invalidated on
// sync (see cache.ts + index.ts). Data is static between uploads, so each result
// is computed once and reused until the next sync.

export const loadNizwaDataFromDB = memoizeAsync("nizwa", loadNizwaDataFromDBImpl);
export const loadComparisonDataFromDB = memoizeAsync("compare", loadComparisonDataFromDBImpl);
export const getArabRankHistoryFromDB = memoizeAsync("arabHistory", getArabRankHistoryFromDBImpl);
export const getWorldRankHistoryFromDB = memoizeAsync("worldHistory", getWorldRankHistoryFromDBImpl);
export const getFullArabRankingForYearFromDB = memoizeAsync("arabFull", getFullArabRankingForYearFromDBImpl);
export const getFullWorldRankingForYearFromDB = memoizeAsync("worldFull", getFullWorldRankingForYearFromDBImpl);
export const getArabAvailableYearsFromDB = memoizeAsync("arabYears", getArabAvailableYearsFromDBImpl);
export const getWorldAvailableYearsFromDB = memoizeAsync("worldYears", getWorldAvailableYearsFromDBImpl);
export const getHubDataFromDB = memoizeAsync("hub", getHubDataFromDBImpl);
