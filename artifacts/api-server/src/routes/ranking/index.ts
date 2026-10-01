import { Router, type Request, type Response, type NextFunction } from "express";
import { requireLogin as requireAuth } from "../../lib/auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { QS_WEIGHTS, invalidateAllCaches } from "./data-loader.js";
import {
  loadNizwaDataFromDB, loadComparisonDataFromDB,
  getArabAvailableYearsFromDB, getWorldAvailableYearsFromDB,
  getFullArabRankingForYearFromDB, getFullWorldRankingForYearFromDB,
  getHubDataFromDB, getLastSyncInfo, isDBPopulated,
  getArabRankHistoryFromDB, getWorldRankHistoryFromDB,
} from "./db-queries.js";
import { syncAllData } from "./db-sync.js";
import { clearRankingCache } from "./cache.js";
import { anthropic, isAnthropicConfigured } from "@workspace/integrations-anthropic-ai";
import { requireService } from "../../lib/services";

const DATA_DIR = path.resolve(process.cwd(), "../../Data");
const ARAB_DIR = path.join(DATA_DIR, "Rankings Result", "Arab Rankings");
const WORLD_DIR = path.join(DATA_DIR, "Rankings Result", "World Rankings");

const upload = multer({ dest: path.join(DATA_DIR, "_uploads_tmp") });


// ── Auto-sync on startup if DB is empty ──────────────────────────────────────
let autoSyncRunning = false;
isDBPopulated()
  .then((populated) => {
    if (!populated && !autoSyncRunning) {
      autoSyncRunning = true;
      console.log("[Ranking] DB empty — auto-syncing Excel files into DB...");
      syncAllData()
        .then((result) => {
          clearRankingCache();
          console.log("[Ranking] Auto-sync complete:", result.tables);
          if (result.errors.length > 0) {
            console.warn("[Ranking] Sync warnings:", result.errors);
          }
        })
        .catch((err) => console.error("[Ranking] Auto-sync failed:", err))
        .finally(() => { autoSyncRunning = false; });
    } else if (populated) {
      console.log("[Ranking] DB already populated — skipping auto-sync");
    }
  })
  .catch((err) => console.error("[Ranking] Could not check DB:", err));

const router = Router();

// ── POST /api/ranking/sync — trigger full ETL from Excel → DB ─────────────
router.post("/ranking/sync", requireAuth, async (_req, res) => {
  try {
    if (autoSyncRunning) {
      res.json({ status: "already_running", message: "Auto-sync is already in progress" });
      return;
    }
    autoSyncRunning = true;
    const result = await syncAllData();
    clearRankingCache();
    autoSyncRunning = false;
    res.json({
      status: "success",
      tables: result.tables,
      errors: result.errors,
      durationMs: result.durationMs,
      totalRows: Object.values(result.tables).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    autoSyncRunning = false;
    console.error("[Ranking] Sync error:", err);
    res.status(500).json({ error: "Sync failed", detail: String(err) });
  }
});

// ── GET /api/ranking/sync-status ──────────────────────────────────────────
router.get("/ranking/sync-status", requireAuth, async (_req, res) => {
  const populated = await isDBPopulated();
  const history = await getLastSyncInfo();
  res.json({ populated, syncing: autoSyncRunning, history });
});

// ── GET /api/ranking/overview ─────────────────────────────────────────────
router.get("/ranking/overview", requireAuth, async (_req, res) => {
  const data = await loadNizwaDataFromDB();

  const strengths = data.indicators
    .filter((i) => i.score >= i.countryAvg || i.rank <= 200)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((i) => ({
      indicator: i.indicator,
      score: i.score,
      rank: i.rank,
      countryAvg: i.countryAvg,
      status: "strength" as const,
    }));

  const weaknesses = data.indicators
    .filter((i) => i.score < i.countryAvg && i.rank > 200)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((i) => ({
      indicator: i.indicator,
      score: i.score,
      rank: i.rank,
      countryAvg: i.countryAvg,
      status: "weakness" as const,
    }));

  res.json({
    university: "University of Nizwa",
    country: "Oman",
    rankingSystem: "QS World University Rankings",
    year: data.year,
    overallRank: data.overallRank,
    overallScore: Math.round((data.overallScore ?? 0) * 10) / 10,
    countryAvgScore: Math.round((data.countryAvgScore ?? 0) * 10) / 10,
    strengths,
    weaknesses,
    indicators: data.indicators,
    sustainabilityScore:
      (data.sustainabilityData.find((r) => r["INDICATOR"] === "Overall")?.["SCORE"] as number) ?? 0,
    sustainabilityCountryAvg:
      (data.sustainabilityData.find((r) => r["INDICATOR"] === "Overall")?.["COUNTRY_AVERAGE_SCORE"] as number) ?? 0,
    employmentOutcome: data.employmentOutcome,
    academicRepScore: Math.round((data.academicRepScore ?? 0) * 10) / 10,
    employerRepScore: Math.round((data.employerRepScore ?? 0) * 10) / 10,
  });
});

// ── GET /api/ranking/trends ───────────────────────────────────────────────
router.get("/ranking/trends", requireAuth, async (_req, res) => {
  const data = await loadNizwaDataFromDB();
  res.json({
    trends: data.trends,
    ratios: data.ratios,
    irnScores: data.irnScores,
    arabRankHistory: data.arabRankHistory,
    worldRankHistory: data.worldRankHistory,
    facultyData: data.facultyData,
    sustainabilityData: data.sustainabilityData,
  });
});

// ── GET /api/ranking/faculty ──────────────────────────────────────────────
router.get("/ranking/faculty", requireAuth, async (_req, res) => {
  const data = await loadNizwaDataFromDB();
  res.json({
    faculty: data.facultyData,
    sustainability: data.sustainabilityData,
    citations: data.citationsData,
  });
});

// ── GET /api/ranking/predictions ─────────────────────────────────────────
router.get("/ranking/predictions", requireAuth, async (_req, res) => {
  const data = await loadNizwaDataFromDB();

  const predictions: Array<{
    indicator: string;
    currentScore: number;
    currentRank: number;
    predicted2027Score: number;
    predicted2027Rank: number;
    trend: "improving" | "declining" | "stable";
    confidence: number;
    recommendation: string;
  }> = [];

  data.indicators.forEach((ind) => {
    const trendData = data.trends[ind.indicator] || [];
    let trend: "improving" | "declining" | "stable" = "stable";
    let predictedScore = ind.score;
    let predictedRank = ind.rank;
    let recommendation = "";
    let confidence = 70;

    if (trendData.length >= 2) {
      const last = trendData[trendData.length - 1];
      const prev = trendData[trendData.length - 2];
      const delta = last.score - prev.score;
      if (delta > 0.5) {
        trend = "improving";
        predictedScore = Math.min(100, ind.score + delta * 0.8);
        predictedRank = Math.max(1, ind.rank - 20);
        confidence = 75;
      } else if (delta < -0.5) {
        trend = "declining";
        predictedScore = Math.max(0, ind.score + delta * 0.8);
        predictedRank = ind.rank + 20;
        confidence = 65;
      } else {
        confidence = 80;
      }
    }

    const gap = ind.countryAvg - ind.score;
    if (ind.indicator === "Academic Reputation") {
      recommendation =
        gap > 0
          ? "Increase international conference participation, publish in Q1 journals, and grow QS academic survey nominations."
          : "Maintain current momentum by expanding research collaborations.";
    } else if (ind.indicator === "Citations per Faculty") {
      recommendation =
        "Target high-impact journals. Current citations per faculty ratio is low — focus on interdisciplinary research in engineering and life sciences.";
    } else if (ind.indicator === "Employer Reputation") {
      recommendation =
        gap > 0
          ? "Build stronger industry partnerships and alumni career tracking to improve employer survey responses."
          : "Leverage existing employer goodwill to expand internship programs.";
    } else if (ind.indicator === "International Faculty") {
      recommendation =
        ind.score >= 95
          ? "Excellent — maintain international faculty diversity as a key differentiator."
          : "Recruit international faculty from top universities to boost this score.";
    } else if (ind.indicator === "Faculty Student") {
      recommendation =
        "Current ratio is competitive. Avoid rapid enrollment growth without proportional faculty hiring.";
    } else if (ind.indicator === "Sustainability") {
      recommendation =
        "Implement a comprehensive sustainability strategy covering environmental, social, and governance dimensions. Score is significantly below world average.";
    } else if (ind.indicator === "International Research Network") {
      recommendation =
        "Expand formal research collaborations beyond current partners. Joint publications with European and Asian universities will improve IRN score.";
    } else if (ind.indicator === "Employment Outcomes") {
      recommendation =
        ind.score >= 70
          ? "Strong employment outcomes — promote this to prospective students."
          : "Track graduate employment more systematically and submit comprehensive data to QS.";
    } else {
      recommendation =
        gap > 0
          ? `Score is ${gap.toFixed(1)} below the Oman country average. Focused improvement needed.`
          : "Score is above country average — maintain and promote this strength.";
    }

    predictions.push({
      indicator: ind.indicator,
      currentScore: Math.round(ind.score * 10) / 10,
      currentRank: ind.rank,
      predicted2027Score: Math.round(predictedScore * 10) / 10,
      predicted2027Rank: predictedRank,
      trend,
      confidence,
      recommendation,
    });
  });

  const rankImprovementPotential = data.indicators.reduce((sum, ind) => {
    const gap = Math.max(0, ind.countryAvg - ind.score);
    return sum + (gap * (QS_WEIGHTS[ind.indicator] ?? 0)) / 100;
  }, 0);

  res.json({
    predictions,
    rankImprovementPotential: Math.round(rankImprovementPotential * 10) / 10,
    estimatedReachableRank: Math.max(
      400,
      data.overallRank - Math.round(rankImprovementPotential * 15)
    ),
    currentRank: data.overallRank,
  });
});

// ── POST /api/ranking/whatif ──────────────────────────────────────────────
router.post("/ranking/whatif", requireAuth, async (req, res) => {
  const data = await loadNizwaDataFromDB();
  const { changes } = req.body as { changes: Record<string, number> };

  if (!changes || typeof changes !== "object") {
    res.status(400).json({ error: "changes object required" });
    return;
  }

  let baseWeightedScore = 0;
  let newWeightedScore = 0;
  const impactBreakdown: Array<{
    indicator: string;
    originalScore: number;
    newScore: number;
    weight: number;
    scoreImpact: number;
    estimatedRankChange: number;
  }> = [];

  data.indicators.forEach((ind) => {
    const weight = (QS_WEIGHTS[ind.indicator] ?? 0) / 100;
    const origScore = ind.score;
    const newScore =
      changes[ind.indicator] !== undefined
        ? Math.min(100, Math.max(0, changes[ind.indicator]))
        : origScore;

    baseWeightedScore += origScore * weight;
    newWeightedScore += newScore * weight;

    if (newScore !== origScore) {
      const scoreDelta = newScore - origScore;
      const rankChangePerPoint = data.overallRank > 600 ? 8 : 5;
      const estimatedRankChange = -Math.round(scoreDelta * weight * 100 * rankChangePerPoint);
      impactBreakdown.push({
        indicator: ind.indicator,
        originalScore: Math.round(origScore * 10) / 10,
        newScore: Math.round(newScore * 10) / 10,
        weight: QS_WEIGHTS[ind.indicator] ?? 0,
        scoreImpact: Math.round(scoreDelta * weight * 1000) / 10,
        estimatedRankChange,
      });
    }
  });

  const totalScoreDelta = newWeightedScore - baseWeightedScore;
  const rankChangeFactor = data.overallRank > 600 ? 12 : 8;
  const estimatedRankChange = -Math.round(totalScoreDelta * rankChangeFactor);
  const estimatedNewRank = Math.max(1, data.overallRank + estimatedRankChange);

  res.json({
    currentRank: data.overallRank,
    currentScore: Math.round(baseWeightedScore * 10) / 10,
    simulatedScore: Math.round(newWeightedScore * 10) / 10,
    estimatedNewRank,
    estimatedRankChange,
    rankImprovement: estimatedRankChange < 0,
    impactBreakdown,
    feasibilityNotes: impactBreakdown.map((b) => ({
      indicator: b.indicator,
      feasibility:
        b.newScore - b.originalScore <= 5
          ? "Short-term (1-2 years)"
          : b.newScore - b.originalScore <= 15
          ? "Medium-term (3-4 years)"
          : "Long-term (5+ years)",
    })),
  });
});

// ── GET /api/ranking/compare ──────────────────────────────────────────────
router.get("/ranking/compare", requireAuth, async (_req, res) => {
  const [universities, arabTopData] = await Promise.all([
    loadComparisonDataFromDB(),
    getFullArabRankingForYearFromDB("2026"),
  ]);

  const sorted = [...universities].sort((a, b) => a.overallRank - b.overallRank);

  const CORE = [
    "Academic Reputation", "Employer Reputation", "Faculty Student",
    "Citations per Faculty", "International Faculty", "International Students",
    "International Research Network", "Employment Outcomes", "Sustainability",
  ];

  const indicatorLeaders: Record<string, { peer: string; score: number; rank: number }> = {};
  CORE.forEach((ind) => {
    const best = sorted.reduce((prev, curr) => {
      const ps = prev.indicators.find((i) => i.indicator === ind)?.score ?? 0;
      const cs = curr.indicators.find((i) => i.indicator === ind)?.score ?? 0;
      return cs > ps ? curr : prev;
    });
    const bestInd = best.indicators.find((i) => i.indicator === ind);
    indicatorLeaders[ind] = {
      peer: best.peer,
      score: bestInd?.score ?? 0,
      rank: bestInd?.rank ?? 9999,
    };
  });

  res.json({
    universities: sorted,
    arabRankings: arabTopData.slice(0, 50),
    indicatorLeaders,
    omanOnly: sorted.filter((u) => u.country === "Oman"),
  });
});

// ── GET /api/ranking/hub ──────────────────────────────────────────────────
router.get("/ranking/hub", requireAuth, async (_req, res) => {
  const data = await getHubDataFromDB();
  res.json({ years: data });
});

// ── POST /api/ranking/analysis — AI deep analysis via Claude ──────────────
router.post("/ranking/analysis", requireAuth, requireService("ranking_ai"), async (req, res) => {
  if (!isAnthropicConfigured()) {
    res.status(503).json({ error: "AI analysis is not configured (set AI_INTEGRATIONS_ANTHROPIC_API_KEY)." });
    return;
  }
  const data = await loadNizwaDataFromDB();
  const { focusArea, question } = req.body as {
    focusArea?: string;
    question?: string;
  };

  const indicatorSummary = data.indicators
    .map(
      (i) =>
        `- ${i.indicator}: Score ${i.score} (Country Avg: ${i.countryAvg.toFixed(1)}), Rank ${i.rank}, Weight ${i.weight}%`
    )
    .join("\n");

  const sustainSummary = data.sustainabilityData
    .map(
      (r) =>
        `- ${r["INDICATOR"]}: Score ${r["SCORE"]} (Country Avg: ${r["COUNTRY_AVERAGE_SCORE"]}, World Avg: ${r["WORLD_AVERAGE_SCORE"]})`
    )
    .join("\n");

  const ratioSummary = Object.entries(data.ratios)
    .map(([k, v]) => `- ${k}: ${(v as number).toFixed(4)}`)
    .join("\n");

  const prompt = question
    ? `The analyst asks: "${question}"\n\nProvide a specific, data-driven answer based on the University of Nizwa QS data below.`
    : focusArea
    ? `Provide a deep expert analysis of the University of Nizwa's "${focusArea}" area in QS rankings, with specific recommendations.`
    : `Provide a comprehensive strategic ranking intelligence report for the University of Nizwa.`;

  const systemPrompt = `You are a world-class university ranking expert and strategic consultant specializing in QS World University Rankings. You have deep expertise in ranking methodology, strategic improvement planning, and higher education analytics.

You are analyzing data for the University of Nizwa, Oman (QS Rank: ${data.overallRank}, Score: ${data.overallScore}).

Key data:
## QS Indicators (${data.year})
${indicatorSummary}

## Sustainability Scores
${sustainSummary}

## Underlying Ratios
${ratioSummary}

## Employment Outcomes Score: ${data.employmentOutcome}
## Academic Reputation Score: ${(data.academicRepScore ?? 0).toFixed(1)}
## Employer Reputation Score: ${data.employerRepScore}

Provide analysis in structured markdown with:
1. Executive summary
2. Key strengths (with scores/ranks)
3. Critical weaknesses (with impact on ranking)
4. Priority improvement actions (ranked by impact × feasibility)
5. Realistic 3-year target rank with milestones
6. Specific, actionable recommendations (not generic advice)

Be specific, data-driven, and realistic. Reference actual scores and ranks.`;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = anthropic.messages.stream({
      model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Ranking analysis error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Analysis failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Analysis generation failed" })}\n\n`);
      res.end();
    }
  }
});

// ── GET /api/ranking/arab ─────────────────────────────────────────────────
router.get("/ranking/arab", requireAuth, async (req, res) => {
  const requestedYear = (req.query.year as string) ?? "2026";
  const availableYears = await getArabAvailableYearsFromDB();
  // Only query/cache valid years to bound the in-memory cache (see cache.ts).
  const year = availableYears.includes(requestedYear)
    ? requestedYear
    : (availableYears[0] ?? "2026");
  const [fullRanking, arabRankHistory, compData] = await Promise.all([
    getFullArabRankingForYearFromDB(year),
    getArabRankHistoryFromDB(),
    loadComparisonDataFromDB(),
  ]);

  const nizwaEntry = fullRanking.find((u) => u.name?.toLowerCase().includes("nizwa"));
  const nizwaArabRank = nizwaEntry?.rank ?? null;

  res.json({
    year,
    availableYears,
    nizwaArabRankHistory: arabRankHistory,
    nizwaArabRank,
    totalUniversities: fullRanking.length,
    fullRanking,
    peers: compData.map((p) => ({
      peer: p.peer,
      fullName: p.fullName,
      country: p.country,
      arabRank: p.arabRank,
      worldRank: p.overallRank,
    })),
  });
});

// ── GET /api/ranking/world ────────────────────────────────────────────────
router.get("/ranking/world", requireAuth, async (_req, res) => {
  const [data, compData, availableYears, history] = await Promise.all([
    loadNizwaDataFromDB(),
    loadComparisonDataFromDB(),
    getWorldAvailableYearsFromDB(),
    getWorldRankHistoryFromDB(),
  ]);

  const indicatorBreakdown = data.indicators
    .filter((i) => i.indicator !== "Overall")
    .map((i) => ({ indicator: i.indicator, score: i.score, rank: i.rank }));

  const latestYear = history.at(-1);
  const prevYear = history.at(-2);

  res.json({
    availableYears,
    history,
    currentYear: latestYear?.year ?? null,
    nizwaWorldRank2026: latestYear?.worldRank ?? null,
    nizwaWorldRank2025: prevYear?.worldRank ?? null,
    indicatorBreakdown,
    peers: compData.map((p) => ({
      peer: p.peer,
      fullName: p.fullName,
      country: p.country,
      worldRank2026: p.overallRank,
      worldRank2025: p.worldRank2025,
      arabRank: p.arabRank,
      overallScore: p.overallScore,
    })),
  });
});

// ── POST /api/ranking/upload ──────────────────────────────────────────────
router.post(
  "/ranking/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const { type, year } = req.body as { type: string; year: string };
    const file = req.file;

    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
    if (!["arab", "world"].includes(type)) { res.status(400).json({ error: "type must be 'arab' or 'world'" }); return; }
    if (!year || !/^\d{4}$/.test(year)) { res.status(400).json({ error: "year must be a 4-digit number" }); return; }
    if (!file.originalname.endsWith(".xlsx")) { res.status(400).json({ error: "File must be an .xlsx file" }); return; }

    const destDir = type === "arab" ? ARAB_DIR : WORLD_DIR;
    const label = type === "arab" ? "QS World University Rankings - Arab" : "QS World University Rankings";
    const destName = `${year} ${label}.xlsx`;
    const destPath = path.join(destDir, destName);

    try {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(file.path, destPath);
      invalidateAllCaches();

      // Trigger background re-sync so the DB is updated with the new file
      if (!autoSyncRunning) {
        autoSyncRunning = true;
        syncAllData()
          .then((result) => {
            clearRankingCache();
            console.log("[Ranking] Post-upload sync complete:", result.tables);
          })
          .catch((err) => console.error("[Ranking] Post-upload sync failed:", err))
          .finally(() => { autoSyncRunning = false; });
      }

      res.json({
        success: true,
        message: `Saved as '${destName}'. Database sync started — data will refresh within seconds.`,
        year,
        type,
      });
    } catch (err) {
      try { fs.unlinkSync(file.path); } catch {}
      res.status(500).json({ error: "Failed to save file", detail: String(err) });
    }
  }
);

// ── GET /api/ranking/template/:type ──────────────────────────────────────
router.get("/ranking/template/:type", requireAuth, (req: Request, res: Response) => {
  const { type } = req.params;
  if (!["arab", "world"].includes(type)) {
    res.status(400).json({ error: "type must be 'arab' or 'world'" });
    return;
  }

  const dir = type === "arab" ? ARAB_DIR : WORLD_DIR;
  if (!fs.existsSync(dir)) { res.status(404).json({ error: "Rankings directory not found" }); return; }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".xlsx") && f.startsWith("2026"))
    .sort();

  if (files.length === 0) { res.status(404).json({ error: "No template file found for 2026" }); return; }

  const filePath = path.join(dir, files[0]);
  const label = type === "arab" ? "Arab" : "World";
  res.download(filePath, `Template_QS_${label}_Rankings.xlsx`);
});

// ── GET /api/ranking/arab-browser?year=2026 ──────────────────────────────
router.get("/ranking/arab-browser", requireAuth, async (req, res) => {
  const requestedYear = String(req.query.year ?? "2026");
  const availableYears = await getArabAvailableYearsFromDB();
  // Only query/cache valid years to bound the in-memory cache (see cache.ts).
  const year = availableYears.includes(requestedYear)
    ? requestedYear
    : (availableYears[0] ?? "2026");
  const universities = await getFullArabRankingForYearFromDB(year);
  const countries = [...new Set(universities.map((u) => u.country).filter(Boolean))].sort();
  const indicatorKeys = universities.length > 0 ? Object.keys(universities[0].scores) : [];
  res.json({ year, availableYears, universities, countries, indicatorKeys });
});

// ── GET /api/ranking/world-browser?year=2026 ─────────────────────────────
router.get("/ranking/world-browser", requireAuth, async (req, res) => {
  const requestedYear = String(req.query.year ?? "2026");
  const availableYears = await getWorldAvailableYearsFromDB();
  // Only query/cache valid years to bound the in-memory cache (see cache.ts).
  const year = availableYears.includes(requestedYear)
    ? requestedYear
    : (availableYears[0] ?? "2026");
  const universities = await getFullWorldRankingForYearFromDB(year);
  const countries = [...new Set(universities.map((u) => u.country).filter(Boolean))].sort();
  const indicatorKeys = universities.length > 0 ? Object.keys(universities[0].scores) : [];
  res.json({ year, availableYears, universities, countries, indicatorKeys });
});

export default router;
