import XLSX from "xlsx";
import path from "path";
import fs from "fs";

// process.cwd() = /home/runner/workspace/artifacts/api-server when server runs
const DATA_DIR = path.resolve(process.cwd(), "../../Data");
const QS_DIR = path.join(DATA_DIR, "Qs Analytical data");
const WORLD_DIR = path.join(DATA_DIR, "Rankings Result", "World Rankings");
const ARAB_DIR = path.join(DATA_DIR, "Rankings Result", "Arab Rankings");

function readExcel(filePath: string): Record<string, unknown[]> {
  try {
    const wb = XLSX.readFile(filePath);
    const result: Record<string, unknown[]> = {};
    wb.SheetNames.forEach((name) => {
      result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
    });
    return result;
  } catch {
    return {};
  }
}

function readExcelRaw(filePath: string): Record<string, unknown[][]> {
  try {
    const wb = XLSX.readFile(filePath);
    const result: Record<string, unknown[][]> = {};
    wb.SheetNames.forEach((name) => {
      result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        defval: null,
        header: 1,
      }) as unknown[][];
    });
    return result;
  } catch {
    return {};
  }
}

export const QS_WEIGHTS: Record<string, number> = {
  "Academic Reputation": 30,
  "Employer Reputation": 15,
  "Faculty Student": 10,
  "Citations per Faculty": 20,
  "International Faculty": 5,
  "International Students": 5,
  "International Research Network": 5,
  "Employment Outcomes": 5,
  Sustainability: 5,
};

export interface IndicatorScore {
  indicator: string;
  score: number;
  rank: number;
  countryAvg: number;
  weight: number;
  year: string;
}

export interface TrendPoint {
  year: string;
  score: number;
  rank?: number;
}

export interface ArabRankPoint {
  year: string;
  arabRank: string | number;
  overallScore?: number;
}

export interface WorldRankPoint {
  year: string;
  worldRank: string | number;
  indicators?: Record<string, { score: number; rank: string | number }>;
}

export interface NizwaData {
  overallRank: number;
  overallRankRange: string;
  overallScore: number;
  countryAvgScore: number;
  year: string;
  indicators: IndicatorScore[];
  trends: Record<string, TrendPoint[]>;
  arabRankHistory: ArabRankPoint[];
  worldRankHistory: WorldRankPoint[];
  ratios: Record<string, number>;
  facultyData: Record<string, unknown>[];
  sustainabilityData: Record<string, unknown>[];
  citationsData: Record<string, unknown>[];
  irnScores: Record<string, unknown>[];
  employmentOutcome: number;
  academicRepScore: number;
  employerRepScore: number;
}

const isNizwa = (r: unknown) =>
  JSON.stringify(r).toLowerCase().includes("nizwa");

// ── Load Arab Rankings History — reads from actual Excel files only ──────────
function loadArabRankHistory(): ArabRankPoint[] {
  if (!fs.existsSync(ARAB_DIR)) return [];

  const files = fs
    .readdirSync(ARAB_DIR)
    .filter((f) => f.endsWith(".xlsx"))
    .sort();

  const history: ArabRankPoint[] = [];

  files.forEach((f) => {
    const yearMatch = f.match(/^(\d{4})/);
    if (!yearMatch) return;
    const year = yearMatch[1];
    try {
      const entries = parseRankingFile(path.join(ARAB_DIR, f));
      const nizwa = entries.find((e) =>
        e.name.toLowerCase().includes("nizwa")
      );
      if (nizwa) history.push({ year, arabRank: nizwa.rank });
    } catch {
      // file unreadable — skip this year
    }
  });

  return history.sort((a, b) => a.year.localeCompare(b.year));
}

// ── Load World Rankings History — reads from actual Excel files only ─────────
function loadWorldRankHistory(): WorldRankPoint[] {
  if (!fs.existsSync(WORLD_DIR)) return [];

  const files = fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".xlsx"))
    .sort();

  const history: WorldRankPoint[] = [];

  files.forEach((f) => {
    const yearMatch = f.match(/^(\d{4})/);
    if (!yearMatch) return;
    const year = yearMatch[1];
    try {
      const entries = parseRankingFile(path.join(WORLD_DIR, f));
      const nizwa = entries.find((e) =>
        e.name.toLowerCase().includes("nizwa")
      );
      if (nizwa) history.push({ year, worldRank: nizwa.rank });
    } catch {
      // file unreadable — skip this year
    }
  });

  return history.sort((a, b) => a.year.localeCompare(b.year));
}

// ── Main Data Loader ──────────────────────────────────────────────────────
let cachedData: NizwaData | null = null;
let cacheTime = 0;
const CACHE_TTL = 300000; // 5 minutes

export function loadNizwaData(): NizwaData {
  const now = Date.now();
  if (cachedData && now - cacheTime < CACHE_TTL) return cachedData;

  type Row = Record<string, unknown>;

  const wurt = readExcel(path.join(QS_DIR, "wurt_ranks_scores.xlsx"));
  const ratiosFile = readExcel(path.join(QS_DIR, "underlying_ratios.xlsx"));
  const facultyFile = readExcel(path.join(QS_DIR, "faculty_student_data.xlsx"));
  const sustainFile = readExcel(path.join(QS_DIR, "sustainability_wurt.xlsx"));
  const citationsFile = readExcel(path.join(QS_DIR, "citations_original_normalized.xlsx"));
  const irnFile = readExcel(path.join(QS_DIR, "wurn_irn.xlsx"));
  const acadRepScoresFile = readExcel(path.join(QS_DIR, "reputation_academic_scores.xlsx"));
  const empRepScoresFile = readExcel(path.join(QS_DIR, "reputation_employer_scores.xlsx"));
  const eoFile = readExcel(path.join(QS_DIR, "underlying_scores_eo.xlsx"));

  const ranks: Row[] = ((wurt["WURT_ranks"] as Row[]) || []).filter(isNizwa);
  const scores: Row[] = ((wurt["WURT_Scores"] as Row[]) || []).filter(isNizwa);

  const overallRankRow = ranks.find((r) => r["RANKINGINDICATOR"] === "Overall");
  const overallRankNum = (overallRankRow?.["RANK"] as number) ?? 761;
  const overallScoreRow = scores.find((r) => r["RANKINGINDICATOR"] === "Overall");
  const overallScore = (overallScoreRow?.["Score"] as number) ?? 0;
  const countryAvgScore = (overallScoreRow?.["AVERAGE_COUNTRY_SCORE"] as number) ?? 0;
  const year = (overallRankRow?.["RANKINGSYEAR"] as string) ?? "2026";

  const indicators: IndicatorScore[] = scores.map((s) => {
    const ind = s["RANKINGINDICATOR"] as string;
    const rankRow = ranks.find((r) => r["RANKINGINDICATOR"] === ind);
    return {
      indicator: ind,
      score: (s["Score"] as number) ?? 0,
      rank: (rankRow?.["RANK"] as number) ?? 9999,
      countryAvg: (s["AVERAGE_COUNTRY_SCORE"] as number) ?? 0,
      weight: QS_WEIGHTS[ind] ?? 0,
      year: (s["RANKINGSYEAR"] as string) ?? year,
    };
  });

  // Build multi-year indicator trends from WURT data
  const allRankRows: Row[] = (wurt["WURT_ranks"] as Row[]) || [];
  const allScoreRows: Row[] = (wurt["WURT_Scores"] as Row[]) || [];
  const trends: Record<string, TrendPoint[]> = {};

  const indicatorNames = [
    ...new Set(allRankRows.map((r) => r["RANKINGINDICATOR"] as string)),
  ];
  indicatorNames.forEach((indName) => {
    const trendByYear: Record<string, TrendPoint> = {};
    allRankRows
      .filter((r) => isNizwa(r) && r["RANKINGINDICATOR"] === indName)
      .forEach((r) => {
        const y = r["RANKINGSYEAR"] as string;
        trendByYear[y] = { year: y, score: 0, rank: r["RANK"] as number };
      });
    allScoreRows
      .filter((r) => isNizwa(r) && r["RANKINGINDICATOR"] === indName)
      .forEach((r) => {
        const y = r["RANKINGSYEAR"] as string;
        if (!trendByYear[y]) trendByYear[y] = { year: y, score: 0 };
        trendByYear[y].score = (r["Score"] as number) ?? 0;
      });
    trends[indName] = Object.values(trendByYear).sort((a, b) =>
      a.year.localeCompare(b.year)
    );
  });

  // Ratio trends
  const ratiosAll: Row[] = ((ratiosFile["underlying_ratios"] as Row[]) || []).filter(isNizwa);
  const ratioNames = [...new Set(ratiosAll.map((r) => r["INDICATOR"] as string))];
  ratioNames.forEach((name) => {
    const pts = ratiosAll
      .filter((r) => r["INDICATOR"] === name)
      .map((r) => ({ year: r["RANKINGSYEAR"] as string, score: (r["RATIO_VALUE"] as number) ?? 0 }))
      .sort((a, b) => a.year.localeCompare(b.year));
    trends[`ratio_${name}`] = pts;
  });

  const ratios: Record<string, number> = {};
  ratiosAll
    .filter((r) => r["RANKINGSYEAR"] === "2026")
    .forEach((r) => {
      ratios[r["INDICATOR"] as string] = (r["RATIO_VALUE"] as number) ?? 0;
    });

  // Employment outcomes
  const eoRows: Row[] = ((eoFile[Object.keys(eoFile)[0]] as Row[]) || []).filter(isNizwa);
  const employmentOutcome = (eoRows.find((r) => r["INDICATOR"] === "Score")?.[
    "SUM(DATA)"
  ] as number) ?? 73.5;

  // Academic rep score
  const acadRepScoreRows: Row[] = ((acadRepScoresFile[Object.keys(acadRepScoresFile)[0]] as Row[]) || []).filter(isNizwa);
  const academicRepScore = (acadRepScoreRows.find((r) => r["INDICATOR"] === "Combined")?.[
    "VALUE"
  ] as number) ?? 0;

  // Employer rep score
  const empRepScoreRows: Row[] = ((empRepScoresFile[Object.keys(empRepScoresFile)[0]] as Row[]) || []).filter(isNizwa);
  const employerRepScore = (empRepScoreRows.find((r) => r["INDICATOR"] === "Score")?.[
    "VALUE"
  ] as number) ?? 0;

  // IRN scores
  const irnScores: Row[] = ((irnFile["irn_scores_subjectarea"] as Row[]) || []).filter(isNizwa);

  // Faculty data - handle sheet name with trailing space
  const facultySheetName = Object.keys(facultyFile).find((k) => k.includes("faculty")) ?? Object.keys(facultyFile)[0];
  const facultyAll: Row[] = ((facultyFile[facultySheetName] as Row[]) || []).filter(isNizwa);

  cachedData = {
    overallRank: overallRankNum,
    overallRankRange: "761-770",
    overallScore,
    countryAvgScore,
    year,
    indicators,
    trends,
    arabRankHistory: loadArabRankHistory(),
    worldRankHistory: loadWorldRankHistory(),
    ratios,
    facultyData: facultyAll as Record<string, unknown>[],
    sustainabilityData: ((sustainFile[Object.keys(sustainFile)[0]] as Row[]) || []).filter(isNizwa) as Record<string, unknown>[],
    citationsData: ((citationsFile[Object.keys(citationsFile)[0]] as Row[]) || []).filter(isNizwa) as Record<string, unknown>[],
    irnScores: irnScores as Record<string, unknown>[],
    employmentOutcome,
    academicRepScore,
    employerRepScore,
  };

  cacheTime = now;
  return cachedData;
}

// ── Full University Names ─────────────────────────────────────────────────
export const PEER_FULL_NAMES: Record<string, string> = {
  KAU: "King Abdulaziz University",
  KFUPM: "King Fahd Univ. of Petroleum & Minerals",
  Nizwa: "University of Nizwa",
  QU: "Qatar University",
  SQU: "Sultan Qaboos University",
  Sohar: "Sohar University",
};

export const PEER_COUNTRIES: Record<string, string> = {
  KAU: "Saudi Arabia",
  KFUPM: "Saudi Arabia",
  Nizwa: "Oman",
  QU: "Qatar",
  SQU: "Oman",
  Sohar: "Oman",
};

// Hardcoded 2026 Arab Rankings as fallback
const PEER_ARAB_RANKS_2026: Record<string, number | string> = {
  KFUPM: 1,
  QU: 2,
  KAU: 7,
  SQU: 8,
  Nizwa: 58,
  Sohar: "101-150",
};

export interface PeerUniversity {
  peer: string;
  fullName: string;
  country: string;
  overallRank: number;
  overallScore: number;
  worldRank2025?: number | string;
  arabRank?: number | string;
  indicators: Array<{
    indicator: string;
    score: number;
    rank: number;
    weight: number;
  }>;
}

let cachedComparison: PeerUniversity[] | null = null;
let comparisonCacheTime = 0;

export function loadComparisonData(): PeerUniversity[] {
  const now = Date.now();
  if (cachedComparison && now - comparisonCacheTime < CACHE_TTL) return cachedComparison;

  type Row = Record<string, unknown>;
  const wurt = readExcel(path.join(QS_DIR, "wurt_ranks_scores.xlsx"));
  const allRanks: Row[] = (wurt["WURT_ranks"] as Row[]) || [];
  const allScores: Row[] = (wurt["WURT_Scores"] as Row[]) || [];

  const peers = [
    ...new Set(allRanks.map((r) => r["PEER"] as string)),
  ].sort();

  const CORE_INDICATORS = [
    "Academic Reputation",
    "Employer Reputation",
    "Faculty Student",
    "Citations per Faculty",
    "International Faculty",
    "International Students",
    "International Research Network",
    "Employment Outcomes",
    "Sustainability",
  ];

  cachedComparison = peers.map((peer) => {
    const peerRanks = allRanks.filter(
      (r) => r["PEER"] === peer && r["RANKINGSYEAR"] === "2026"
    );
    const peerScores = allScores.filter(
      (r) => r["PEER"] === peer && r["RANKINGSYEAR"] === "2026"
    );

    const overallRankRow = peerRanks.find(
      (r) => r["RANKINGINDICATOR"] === "Overall"
    );
    const overallScoreRow = peerScores.find(
      (r) => r["RANKINGINDICATOR"] === "Overall"
    );

    const indicators = CORE_INDICATORS.map((ind) => {
      const rankRow = peerRanks.find((r) => r["RANKINGINDICATOR"] === ind);
      const scoreRow = peerScores.find((r) => r["RANKINGINDICATOR"] === ind);
      return {
        indicator: ind,
        score: (scoreRow?.["Score"] as number) ?? 0,
        rank: (rankRow?.["RANK"] as number) ?? 9999,
        weight: QS_WEIGHTS[ind] ?? 0,
      };
    });

    const arabList = loadArabRankingComparison();
    const fullName = PEER_FULL_NAMES[peer] ?? peer;

    // Stop words that are too generic to use as identifiers
    const STOP_WORDS = new Set([
      "university", "univ", "of", "and", "the", "for", "in", "king",
      "prince", "college", "institute", "technologies", "sciences",
    ]);
    const arabEntry = arabList.find((a) =>
      // 1. direct short-name match (e.g. "KFUPM", "nizwa", "sohar")
      a.name.toLowerCase().includes(peer.toLowerCase()) ||
      // 2. unique word match from full name (min 5 chars, not a stop word)
      fullName
        .toLowerCase()
        .split(/[\s.,&()]+/)
        .some(
          (w) => w.length >= 5 && !STOP_WORDS.has(w) && a.name.toLowerCase().includes(w)
        )
    );

    // 2025 world rank from same WURT data
    const peerRanks2025 = allRanks.filter(
      (r) => r["PEER"] === peer && r["RANKINGSYEAR"] === "2025"
    );
    const overallRankRow2025 = peerRanks2025.find(
      (r) => r["RANKINGINDICATOR"] === "Overall"
    );

    return {
      peer,
      fullName,
      country: PEER_COUNTRIES[peer] ?? (allRanks.find((r) => r["PEER"] === peer)?.["COUNTRY_TERRITORY"] as string) ?? "",
      overallRank: (overallRankRow?.["RANK"] as number) ?? 9999,
      overallScore: (overallScoreRow?.["Score"] as number) ?? 0,
      worldRank2025: (overallRankRow2025?.["RANK"] as number | string) ?? undefined,
      arabRank: arabEntry?.arabRank2026 ?? PEER_ARAB_RANKS_2026[peer],
      indicators,
    };
  });

  comparisonCacheTime = now;
  return cachedComparison;
}

// ── Arab Rankings Comparison ─────────────────────────────────────────────
export interface ArabUniversity {
  name: string;
  country: string;
  arabRank2026: number | string;
  scores: Record<string, number>;
  ranks: Record<string, string | number>;
}

export function loadArabRankingComparison(): ArabUniversity[] {
  const f = path.join(ARAB_DIR, "2026 QS World University Rankings - Arab.xlsx");
  if (!fs.existsSync(f)) return [];

  try {
    const wb = XLSX.readFile(f);
    const sheetName = wb.SheetNames[0];
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      defval: null,
      header: 1,
    }) as unknown[][];

    // Row 1 = indicator names, Row 2 = SCORE/RANK labels
    // Data starts at row 3
    const indNames = raw[1] as (string | null)[];
    const scoreRankLabels = raw[2] as (string | null)[];

    // Build column map: col index → { indicator, type }
    const colMap: { indicator: string; type: "SCORE" | "RANK" | "META" }[] = [];
    let currentInd = "";
    indNames.forEach((name, idx) => {
      if (name && typeof name === "string" && name !== "Index") {
        currentInd = name;
      }
      const label = scoreRankLabels[idx];
      if (label === "SCORE") {
        colMap[idx] = { indicator: currentInd, type: "SCORE" };
      } else if (label === "RANK") {
        colMap[idx] = { indicator: currentInd, type: "RANK" };
      } else {
        colMap[idx] = { indicator: currentInd, type: "META" };
      }
    });

    const ARAB_INDICATORS = [
      "Academic Reputation",
      "Employer Reputation",
      "Faculty Student",
      "International Research Network",
      "Citations per Paper",
      "International Faculty",
      "International Students",
    ];

    // Parse data rows
    const universities: ArabUniversity[] = [];
    for (let i = 3; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      const nameIdx = 3; // "Institution Name" is always col 3
      const rankIdx = 1; // 2026 rank col
      const countryIdx = 4;

      const name = row[nameIdx] as string;
      const country = row[countryIdx] as string;
      const arabRank = row[rankIdx] as number | string;

      if (!name || typeof name !== "string") continue;

      const scores: Record<string, number> = {};
      const ranks: Record<string, string | number> = {};

      colMap.forEach((col, idx) => {
        if (!col || !ARAB_INDICATORS.includes(col.indicator)) return;
        const val = row[idx];
        if (col.type === "SCORE" && val !== null && val !== undefined) {
          scores[col.indicator] = typeof val === "number" ? val : parseFloat(String(val)) || 0;
        }
        if (col.type === "RANK" && val !== null && val !== undefined) {
          ranks[col.indicator] = val as string | number;
        }
      });

      universities.push({ name, country, arabRank2026: arabRank, scores, ranks });
    }

    return universities;
  } catch {
    return [];
  }
}

// ── HUB Submission Data ───────────────────────────────────────────────────
export interface HubYearData {
  year: string;
  facultyTotal: number | null;
  facultyInternational: number | null;
  facultyPhD: number | null;
  studentsTotal: number | null;
  studentsInternational: number | null;
  studentsGrad: number | null;
  studentsFacultyRatio: number | null;
}

export function loadHubData(): HubYearData[] {
  const f = path.join(DATA_DIR, "all Qs data In HUB from cycle 2017.xlsx");
  if (!fs.existsSync(f)) return [];
  try {
    const wb = XLSX.readFile(f);
    const sh = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null }) as (string | number | null)[][];

    // Row 0 = years (null, 2027, null, null, null, 2026, null, null, null, ...)
    // Each year block = 4 cols: Full Time, Part Time, HC, FTE
    // FTE is at offset 3 within each block
    const yearRow = raw[0];
    const years: { year: string; colFTE: number }[] = [];
    for (let c = 1; c < yearRow.length; c++) {
      const val = yearRow[c];
      if (val !== null && val !== undefined) {
        // The FTE col is at offset 3 (Full Time=+0, Part Time=+1, HC=+2, FTE=+3)
        years.push({ year: String(val), colFTE: c + 3 });
      }
    }

    // Find rows by label — only match data rows (those with ↔ suffix)
    const findFTE = (label: string): Record<string, number | null> => {
      const row = raw.find((r) =>
        typeof r[0] === "string" &&
        r[0].endsWith("↔") &&
        r[0].replace("↔", "").trim() === label.trim()
      );
      if (!row) return {};
      const result: Record<string, number | null> = {};
      years.forEach(({ year, colFTE }) => {
        const val = row[colFTE];
        result[year] = typeof val === "number" ? val : null;
      });
      return result;
    };

    const facultyTotalFTE = findFTE("Faculty Staff");
    const facultyIntlFTE = findFTE("International Faculty Staff");
    const facultyPhDFTE = findFTE("Faculty Staff with PhD");
    const studentsTotalFTE = findFTE("Students - Overall");
    const studentsIntlFTE = findFTE("International Students - Overall");
    const studentsGradFTE = findFTE("Graduate/Postgraduate Students");

    // Build one entry per year (exclude 2027 as future projection)
    return years
      .filter(({ year }) => parseInt(year) <= 2026)
      .map(({ year }) => {
        const fac = facultyTotalFTE[year] ?? null;
        const stu = studentsTotalFTE[year] ?? null;
        const ratio = fac && stu && fac > 0 ? Math.round((stu / fac) * 10) / 10 : null;
        return {
          year,
          facultyTotal: facultyTotalFTE[year] ?? null,
          facultyInternational: facultyIntlFTE[year] ?? null,
          facultyPhD: facultyPhDFTE[year] ?? null,
          studentsTotal: stu,
          studentsInternational: studentsIntlFTE[year] ?? null,
          studentsGrad: studentsGradFTE[year] ?? null,
          studentsFacultyRatio: ratio,
        };
      })
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  } catch {
    return [];
  }
}

// ── Year Discovery ─────────────────────────────────────────────────────────
export function loadArabAvailableYears(): string[] {
  if (!fs.existsSync(ARAB_DIR)) return ["2026"];
  try {
    const years = fs.readdirSync(ARAB_DIR)
      .filter((f) => f.endsWith(".xlsx"))
      .map((f) => { const m = f.match(/(\d{4})/); return m ? m[1] : null; })
      .filter(Boolean) as string[];
    return [...new Set(years)].sort().reverse();
  } catch { return ["2026"]; }
}

export function loadWorldAvailableYears(): string[] {
  if (!fs.existsSync(WORLD_DIR)) return ["2026"];
  try {
    const years = fs.readdirSync(WORLD_DIR)
      .filter((f) => f.endsWith(".xlsx"))
      .map((f) => { const m = f.match(/(\d{4})/); return m ? m[1] : null; })
      .filter(Boolean) as string[];
    return [...new Set(years)].sort().reverse();
  } catch { return ["2026"]; }
}

// ── Full Arab Ranking for a Given Year ────────────────────────────────────
export interface ArabRankEntry {
  rank: number | string;
  name: string;
  country: string;
  scores: Record<string, number>;
  ranks: Record<string, string | number>;
}

export function loadFullArabRankingForYear(year: string): ArabRankEntry[] {
  if (!fs.existsSync(ARAB_DIR)) return [];
  const files = fs.readdirSync(ARAB_DIR).filter((f) => f.endsWith(".xlsx") && f.includes(year));
  if (files.length === 0) return [];

  const filePath = path.join(ARAB_DIR, files[0]);
  const ARAB_INDICATORS = [
    "Academic Reputation", "Employer Reputation", "Faculty Student",
    "International Research Network", "Citations per Paper",
    "International Faculty", "International Students",
  ];

  try {
    const wb = XLSX.readFile(filePath);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      defval: null, header: 1,
    }) as unknown[][];

    if (raw.length < 4) return [];

    const row1 = raw[1] as (string | null)[];
    const row2 = raw[2] as (string | null)[];

    // New multi-header format (2025, 2026)
    if (row2 && row2.some((v) => v === "SCORE" || v === "RANK")) {
      const colMap: { indicator: string; type: "SCORE" | "RANK" | "META" }[] = [];
      let currentInd = "";
      row1.forEach((name, idx) => {
        if (name && typeof name === "string" && name !== "Index") currentInd = name;
        const label = row2[idx];
        if (label === "SCORE") colMap[idx] = { indicator: currentInd, type: "SCORE" };
        else if (label === "RANK") colMap[idx] = { indicator: currentInd, type: "RANK" };
        else colMap[idx] = { indicator: currentInd || "", type: "META" };
      });

      return raw.slice(3)
        .filter((row) => {
          const name = (row as unknown[])[3];
          return name && typeof name === "string";
        })
        .map((row) => {
          const r = row as unknown[];
          const scores: Record<string, number> = {};
          const ranks: Record<string, string | number> = {};
          colMap.forEach((col, idx) => {
            if (!col || !ARAB_INDICATORS.includes(col.indicator)) return;
            const val = r[idx];
            if (col.type === "SCORE" && val != null) scores[col.indicator] = typeof val === "number" ? val : parseFloat(String(val)) || 0;
            if (col.type === "RANK" && val != null) ranks[col.indicator] = val as string | number;
          });
          return { rank: r[1] as number | string, name: r[3] as string, country: r[4] as string, scores, ranks };
        });
    }

    // Older format — single header row
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Record<string, unknown>[];
    return rows
      .filter((r) => r && Object.values(r).some((v) => typeof v === "string" && (v as string).length > 3))
      .map((r) => {
        const vals = Object.values(r);
        const name = (vals.find((v) => typeof v === "string" && (v as string).length > 3) as string) ?? "";
        const rank = (vals.find((v) => typeof v === "number" && (v as number) > 0 && (v as number) < 500) as number) ?? 0;
        const country = (vals.find((v) => typeof v === "string" && (v as string).length >= 2 && v !== name) as string) ?? "";
        return { rank, name, country, scores: {}, ranks: {} };
      });
  } catch { return []; }
}

// ── Nizwa World Rank Full History — reads all actual Excel files only ─────────
export function loadWorldNizwaFullHistory(): WorldRankPoint[] {
  if (!fs.existsSync(WORLD_DIR)) return [];

  const files = fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".xlsx"))
    .sort();

  const history: WorldRankPoint[] = [];

  files.forEach((f) => {
    const yearMatch = f.match(/^(\d{4})/);
    if (!yearMatch) return;
    const year = yearMatch[1];
    try {
      const entries = parseRankingFile(path.join(WORLD_DIR, f));
      const nizwa = entries.find((e) =>
        e.name.toLowerCase().includes("nizwa")
      );
      if (nizwa) history.push({ year, worldRank: nizwa.rank });
    } catch {
      // file unreadable — skip this year
    }
  });

  return history.sort((a, b) => a.year.localeCompare(b.year));
}

// ── Invalidate Caches (call after file upload) ─────────────────────────────
export function invalidateAllCaches() {
  cachedData = null;
  cacheTime = 0;
  cachedComparison = null;
  comparisonCacheTime = 0;
}

// ── Country code → full name map ────────────────────────────────────────────
const COUNTRY_CODES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", AU: "Australia", DE: "Germany",
  FR: "France", CA: "Canada", JP: "Japan", CN: "China", NL: "Netherlands",
  SE: "Sweden", CH: "Switzerland", SG: "Singapore", HK: "Hong Kong",
  KR: "South Korea", NZ: "New Zealand", BE: "Belgium", DK: "Denmark",
  FI: "Finland", NO: "Norway", AT: "Austria", IE: "Ireland", IT: "Italy",
  ES: "Spain", PT: "Portugal", PL: "Poland", CZ: "Czech Republic",
  RU: "Russia", BR: "Brazil", AR: "Argentina", MX: "Mexico", IN: "India",
  OM: "Oman", SA: "Saudi Arabia", QA: "Qatar", AE: "United Arab Emirates",
  KW: "Kuwait", BH: "Bahrain", JO: "Jordan", EG: "Egypt", LB: "Lebanon",
  MA: "Morocco", TN: "Tunisia", IQ: "Iraq", SY: "Syria", YE: "Yemen",
  LY: "Libya", SD: "Sudan", DZ: "Algeria", TR: "Turkey", IR: "Iran",
  PK: "Pakistan", BD: "Bangladesh", MY: "Malaysia", ID: "Indonesia",
  TH: "Thailand", PH: "Philippines", TW: "Taiwan", ZA: "South Africa",
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ET: "Ethiopia",
};

function resolveCountry(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw).trim();
  return COUNTRY_CODES[s.toUpperCase()] ?? s;
}

// ── Score column name normaliser ────────────────────────────────────────────
const SCORE_COL_MAP: [string, string][] = [
  ["ar score", "Academic Reputation"],
  ["er score", "Employer Reputation"],
  ["fsr score", "Faculty Student"],
  ["cpf score", "Citations per Faculty"],
  ["cpp score", "Citations per Paper"],
  ["ifr score", "International Faculty"],
  ["isr score", "International Students"],
  ["irn score", "International Research Network"],
  ["eo score", "Employment Outcomes"],
  ["sus score", "Sustainability"],
  ["overall score", "Overall Score"],
  ["ppf score", "Papers per Faculty"],
  ["swp score", "Staff with PhD"],
];

function normaliseScoreCol(colName: string): string | null {
  const lower = colName.toLowerCase().trim();
  for (const [key, label] of SCORE_COL_MAP) {
    if (lower === key || lower.includes(key)) return label;
  }
  return null;
}

export interface BrowserEntry {
  rank: string | number;
  name: string;
  country: string;
  scores: Record<string, number>;
}

// ── Universal ranking file parser ───────────────────────────────────────────
export function parseRankingFile(filePath: string): BrowserEntry[] {
  try {
    const wb = XLSX.readFile(filePath);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1, defval: null,
    }) as unknown[][];

    // Strategy A: find the row that has "ar score" in any cell
    let colRowIdx = -1;
    for (let i = 0; i < Math.min(8, raw.length); i++) {
      const row = raw[i] as (string | null)[];
      if (row.some((v) => typeof v === "string" && v.toLowerCase().trim() === "ar score")) {
        colRowIdx = i;
        break;
      }
    }

    // Strategy B: find row with "SCORE" appearing 4+ times (2018 World format)
    const IND_NAME_MAP: Record<string, string> = {
      "academic reputation": "Academic Reputation",
      "employer reputation": "Employer Reputation",
      "faculty student": "Faculty Student",
      "citations per faculty": "Citations per Faculty",
      "citations per paper": "Citations per Paper",
      "international faculty": "International Faculty",
      "international students": "International Students",
      "international research network": "International Research Network",
      "employment outcomes": "Employment Outcomes",
      "sustainability": "Sustainability",
      "overall score": "Overall Score",
      "papers per faculty": "Papers per Faculty",
      "staff with phd": "Staff with PhD",
    };
    if (colRowIdx === -1) {
      for (let i = 0; i < Math.min(8, raw.length); i++) {
        const row = raw[i] as (string | null)[];
        const scoreCount = row.filter((v) => typeof v === "string" && v.toUpperCase() === "SCORE").length;
        if (scoreCount >= 4) {
          // The indicator names are in the row ABOVE
          const indRow = (raw[i - 1] ?? []) as (string | null)[];
          const scoreRankRow = row;

          // Build score columns from indicator names + SCORE positions
          const scoreCols: { idx: number; name: string }[] = [];
          let currentInd = "";
          indRow.forEach((cell, idx) => {
            if (cell && typeof cell === "string" && cell.trim().length > 2 &&
                typeof cell !== "number" && !["rank","score"].includes(cell.toLowerCase())) {
              currentInd = cell.trim();
            }
            if (scoreRankRow[idx] === "SCORE" && currentInd) {
              const label = IND_NAME_MAP[currentInd.toLowerCase()] ?? currentInd;
              scoreCols.push({ idx, name: label });
            }
          });

          // Data starts at the row after the SCORE/RANK row
          const dataStart = i + 1;
          const dataRows = raw.slice(dataStart).filter((row) => {
            const r = row as unknown[];
            const first = r[0];
            return first != null && (typeof first === "number" || (typeof first === "string" && /\d/.test(first)));
          });

          return dataRows.map((row) => {
            const r = row as unknown[];
            // rank at col 0, name at col 2, country at col 3
            const rank = r[0];
            const name = r[2] as string ?? "";
            const country = resolveCountry(r[3]);
            const scores: Record<string, number> = {};
            scoreCols.forEach((sc) => {
              const val = r[sc.idx];
              if (val != null) scores[sc.name] = typeof val === "number" ? val : parseFloat(String(val)) || 0;
            });
            return { rank: rank as string | number, name: name.trim(), country, scores };
          }).filter((e) => e.name.length > 2);
        }
      }
      return []; // could not parse
    }

    // Strategy A continues — colRowIdx found
    const colRow = (raw[colRowIdx] as (string | null)[]).map((v) =>
      typeof v === "string" ? v.toLowerCase().trim() : ""
    );

    // Find rank column: prefer "rank display" but NOT "rank display2" (= prev year), not "ar rank"
    let rankIdx = colRow.findIndex((c) => c === "rank display");
    if (rankIdx === -1) rankIdx = colRow.findIndex((c) => c === "rank");
    if (rankIdx === -1) rankIdx = 0;

    // For Arab 2026/2024: col[2] = "Rank display" (current rank), col[1] = "rank display2" (prev)
    // Make sure we pick the CURRENT rank, not the previous
    const rankDisplayIdx = colRow.findIndex((c) => c === "rank display");
    const rankDisplay2Idx = colRow.findIndex((c) => c === "rank display2");
    if (rankDisplayIdx !== -1) rankIdx = rankDisplayIdx;
    else if (rankDisplay2Idx !== -1) rankIdx = Math.max(rankDisplay2Idx + 1, 1);

    const nameIdx = colRow.findIndex((c) => c.includes("institution") || c.includes("name"));
    // Prefer full country name over code
    const countryByName = colRow.findIndex((c) => c.includes("country") || c.includes("territory"));
    const countryByLocation = colRow.findIndex((c) => c === "location");
    const countryIdx = countryByName !== -1 ? countryByName : countryByLocation !== -1 ? countryByLocation : -1;

    // Score columns
    const scoreCols: { idx: number; name: string }[] = [];
    colRow.forEach((c, idx) => {
      const norm = normaliseScoreCol(c);
      if (norm) scoreCols.push({ idx, name: norm });
    });

    // Data starts at colRowIdx + 1 (skip the descriptor row itself)
    return raw.slice(colRowIdx + 1)
      .filter((row) => {
        const r = row as unknown[];
        if (nameIdx < 0) return false;
        const name = r[nameIdx];
        return name && typeof name === "string" && name.trim().length > 2 &&
          !name.toLowerCase().includes("institution") && !name.toLowerCase().includes("rank");
      })
      .map((row) => {
        const r = row as unknown[];
        const rawRank = r[rankIdx];
        const rank: string | number = typeof rawRank === "number"
          ? rawRank
          : String(rawRank ?? "").trim();
        const name = String(r[nameIdx] ?? "").trim();
        const country = resolveCountry(countryIdx >= 0 ? r[countryIdx] : "");
        const scores: Record<string, number> = {};
        scoreCols.forEach((sc) => {
          const val = r[sc.idx];
          if (val != null && val !== "") {
            const n = typeof val === "number" ? val : parseFloat(String(val));
            if (!isNaN(n)) scores[sc.name] = n;
          }
        });
        return { rank, name, country, scores };
      })
      .filter((e) => e.name.length > 2);
  } catch {
    return [];
  }
}

// ── Load full ranking for any year from either directory ────────────────────
function findFileForYear(dir: string, year: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xlsx") && f.includes(year));
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

export function loadFullWorldRankingForYear(year: string): BrowserEntry[] {
  const file = findFileForYear(WORLD_DIR, year);
  if (!file) return [];
  return parseRankingFile(file);
}

export function loadFullArabRankingForYearV2(year: string): BrowserEntry[] {
  const file = findFileForYear(ARAB_DIR, year);
  if (!file) return [];
  return parseRankingFile(file);
}
