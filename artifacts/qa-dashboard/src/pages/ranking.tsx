import { useState, useRef } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { KPICard } from "@/components/shared/KPICard";
import { CHART_COLORS } from "@/lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Minus, Target, Zap, AlertCircle,
  BrainCircuit, ArrowRight, RefreshCw, Trophy, Star, FlaskConical,
  GraduationCap, Globe, Users, BookOpen, GitCompare, Check, Printer,
  Database,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchRanking(path: string) {
  const r = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`Fetch error ${r.status}`);
  return r.json();
}

const QS_WEIGHTS: Record<string, number> = {
  "Academic Reputation": 30,
  "Employer Reputation": 15,
  "Faculty Student": 10,
  "Citations per Faculty": 20,
  "International Faculty": 5,
  "International Students": 5,
  "International Research Network": 5,
  "Employment Outcomes": 5,
  "Sustainability": 5,
};

const INDICATOR_ICONS: Record<string, React.ReactNode> = {
  "Academic Reputation": <GraduationCap className="w-4 h-4" />,
  "Employer Reputation": <Trophy className="w-4 h-4" />,
  "Faculty Student": <Users className="w-4 h-4" />,
  "Citations per Faculty": <FlaskConical className="w-4 h-4" />,
  "International Faculty": <Globe className="w-4 h-4" />,
  "International Students": <Globe className="w-4 h-4" />,
  "International Research Network": <BookOpen className="w-4 h-4" />,
  "Employment Outcomes": <Target className="w-4 h-4" />,
  "Sustainability": <Zap className="w-4 h-4" />,
  "International Students Diversity": <Star className="w-4 h-4" />,
};

const RANKING_SYSTEMS = [
  { id: "qs", label: "QS World Rankings", available: true },
  { id: "the", label: "THE World Rankings", available: false },
  { id: "nature", label: "Nature Index", available: false },
  { id: "arwu", label: "Shanghai (ARWU)", available: false },
];

// ─── Peer Colors ─────────────────────────────────────────────────────────
const PEER_COLORS: Record<string, string> = {
  Nizwa: CHART_COLORS.blue,
  SQU: CHART_COLORS.green,
  Sohar: CHART_COLORS.amber,
  KAU: "#8b5cf6",
  KFUPM: "#ec4899",
  QU: "#14b8a6",
};

const PEER_FLAGS: Record<string, string> = {
  "Oman": "🇴🇲",
  "Saudi Arabia": "🇸🇦",
  "Qatar": "🇶🇦",
};

// Types
interface PeerIndicator { indicator: string; score: number; rank: number; weight: number; }
interface PeerUniversity {
  peer: string; fullName: string; country: string;
  overallRank: number; overallScore: number;
  worldRank2025?: number | string;
  arabRank?: number | string;
  indicators: PeerIndicator[];
}
interface HubYearData {
  year: string;
  facultyTotal: number | null; facultyInternational: number | null; facultyPhD: number | null;
  studentsTotal: number | null; studentsInternational: number | null; studentsGrad: number | null;
  studentsFacultyRatio: number | null;
}
interface CompareData {
  universities: PeerUniversity[];
  arabRankings: Array<{ name: string; country: string; arabRank2026: number | string; scores: Record<string, number>; ranks: Record<string, string | number> }>;
  indicatorLeaders: Record<string, { peer: string; score: number; rank: number }>;
  omanOnly: PeerUniversity[];
}

interface IndicatorData {
  indicator: string; score: number; rank: number; countryAvg: number; weight: number; year: string;
}
interface OverviewData {
  university: string; country: string; rankingSystem: string; year: string;
  overallRank: number; overallScore: number; countryAvgScore: number;
  strengths: Array<{ indicator: string; score: number; rank: number; countryAvg: number }>;
  weaknesses: Array<{ indicator: string; score: number; rank: number; countryAvg: number }>;
  indicators: IndicatorData[];
  sustainabilityScore: number; sustainabilityCountryAvg: number;
  employmentOutcome: number; academicRepScore: number; employerRepScore: number;
}
interface PredictionItem {
  indicator: string; currentScore: number; currentRank: number;
  predicted2027Score: number; predicted2027Rank: number;
  trend: "improving" | "declining" | "stable"; confidence: number; recommendation: string;
}
interface PredictionsResponse {
  predictions: PredictionItem[]; rankImprovementPotential: number;
  estimatedReachableRank: number; currentRank: number;
}
interface WhatIfResult {
  currentRank: number; currentScore: number; simulatedScore: number;
  estimatedNewRank: number; estimatedRankChange: number; rankImprovement: boolean;
  impactBreakdown: Array<{
    indicator: string; originalScore: number; newScore: number;
    weight: number; scoreImpact: number; estimatedRankChange: number;
  }>;
  feasibilityNotes: Array<{ indicator: string; feasibility: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function rankColor(rank: number) {
  if (rank <= 100) return "text-green-600 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800";
  if (rank <= 300) return "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800";
  if (rank <= 700) return "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800";
  return "text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";
}

function RankBadge({ rank }: { rank: number | string }) {
  const n = typeof rank === "number" ? rank : parseInt(String(rank));
  const cls = isNaN(n) ? "text-muted-foreground bg-muted border-border" : rankColor(n);
  return <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>#{rank}</span>;
}

function TrendIcon({ trend }: { trend: "improving" | "declining" | "stable" }) {
  if (trend === "improving") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === "declining") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function ScoreVsAvg({ score, avg }: { score: number; avg: number }) {
  const pct = Math.min(100, score);
  const avgPct = Math.min(100, avg);
  return (
    <div className="relative h-2.5 bg-muted rounded-full overflow-visible mt-1">
      <div className="absolute left-0 top-0 h-2.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      <div className="absolute top-[-2px] w-0.5 h-[14px] bg-amber-400 rounded" style={{ left: `${avgPct}%` }} title={`Country avg: ${avg.toFixed(1)}`} />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── What-If Simulator ────────────────────────────────────────────────────
function WhatIfSimulator({ overview }: { overview: OverviewData }) {
  const [changes, setChanges] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    overview.indicators.forEach((i) => { if (QS_WEIGHTS[i.indicator]) init[i.indicator] = i.score; });
    return init;
  });
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  const coreIndicators = overview.indicators.filter((i) => QS_WEIGHTS[i.indicator]);

  const simulate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/ranking/whatif`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      setResult(await r.json());
    } finally { setLoading(false); }
  };

  const reset = () => {
    const init: Record<string, number> = {};
    coreIndicators.forEach((i) => { init[i.indicator] = i.score; });
    setChanges(init); setResult(null);
  };

  const anyChanged = coreIndicators.some((i) => (changes[i.indicator] ?? i.score) !== i.score);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Drag the sliders to simulate score improvements. The model estimates rank impact based on QS methodology weights.
      </p>
      <div className="space-y-3">
        {coreIndicators.map((ind) => {
          const val = changes[ind.indicator] ?? ind.score;
          const changed = Math.abs(val - ind.score) > 0.01;
          return (
            <div key={ind.indicator} className="grid grid-cols-[28px_1fr_180px_72px] gap-3 items-center p-3 rounded-lg bg-muted/30 border border-border/40">
              <span className="text-muted-foreground flex justify-center">{INDICATOR_ICONS[ind.indicator]}</span>
              <div>
                <p className="text-sm font-medium">{ind.indicator}</p>
                <p className="text-xs text-muted-foreground">Weight {QS_WEIGHTS[ind.indicator]}% · Current {ind.score.toFixed(1)} · Avg {ind.countryAvg.toFixed(1)}</p>
              </div>
              <Slider value={[val]} min={0} max={100} step={0.5}
                onValueChange={([v]) => setChanges((c) => ({ ...c, [ind.indicator]: v }))} />
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${changed ? (val > ind.score ? "text-green-600" : "text-red-600") : "text-foreground"}`}>
                  {val.toFixed(1)}
                </span>
                {changed && <span className={`text-xs ml-1 ${val > ind.score ? "text-green-600" : "text-red-600"}`}>{val > ind.score ? "+" : ""}{(val - ind.score).toFixed(1)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button onClick={simulate} disabled={!anyChanged || loading} className="gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Simulate Impact
        </Button>
        <Button variant="outline" onClick={reset} disabled={!anyChanged}>Reset</Button>
      </div>

      {result && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted/40 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Current Rank</p>
              <p className="text-3xl font-bold">#{result.currentRank}</p>
              <p className="text-xs text-muted-foreground mt-1">Score {result.currentScore.toFixed(1)}</p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className={`w-8 h-8 ${result.rankImprovement ? "text-green-500" : "text-red-500"}`} />
            </div>
            <div className={`p-4 rounded-lg ${result.rankImprovement ? "bg-green-50 dark:bg-green-950/40" : "bg-red-50 dark:bg-red-950/40"}`}>
              <p className="text-xs text-muted-foreground mb-1">Simulated Rank</p>
              <p className={`text-3xl font-bold ${result.rankImprovement ? "text-green-600" : "text-red-600"}`}>#{result.estimatedNewRank}</p>
              <p className={`text-sm mt-1 font-medium ${result.rankImprovement ? "text-green-600" : "text-red-600"}`}>
                {result.rankImprovement ? "▲" : "▼"} {Math.abs(result.estimatedRankChange)} positions
              </p>
            </div>
          </div>

          {result.impactBreakdown.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-3">Impact Breakdown</p>
              <div className="space-y-2">
                {result.impactBreakdown.map((b) => (
                  <div key={b.indicator} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30 border border-border/40">
                    <span className="font-medium w-52 truncate">{b.indicator}</span>
                    <span className="text-muted-foreground tabular-nums">{b.originalScore} → {b.newScore}</span>
                    <span className={`font-medium ${b.estimatedRankChange < 0 ? "text-green-600" : "text-red-600"}`}>
                      {b.estimatedRankChange < 0 ? "▲" : "▼"} {Math.abs(b.estimatedRankChange)} pos
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {result.feasibilityNotes?.find(f => f.indicator === b.indicator)?.feasibility ?? ""}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────
function AIAnalysisPanel({ overview }: { overview: OverviewData }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  const analyze = async (opts?: { question?: string; focusArea?: string }) => {
    setContent(""); setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/ranking/analysis`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts || {}),
      });
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.done) break;
              if (payload.content) {
                setContent((c) => c + payload.content);
                setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch { setContent("Analysis failed. Please try again."); }
    finally { setLoading(false); }
  };

  const FOCUS_AREAS = [
    "Academic Reputation", "Citations per Faculty", "Sustainability",
    "International Research Network", "Employment Outcomes", "Employer Reputation",
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a specific question (e.g. 'How can we reach top 500 in 3 years?')"
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          onKeyDown={(e) => e.key === "Enter" && !loading && analyze({ question: question || undefined })}
        />
        <Button onClick={() => analyze({ question: question || undefined })} disabled={loading} className="gap-2 shrink-0">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
          {content ? "Re-analyze" : "Generate Analysis"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Focus on:</span>
        {FOCUS_AREAS.map((area) => (
          <button key={area} onClick={() => { setFocusArea(area); analyze({ focusArea: area }); }} disabled={loading}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${focusArea === area ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary hover:text-primary"}`}>
            {area}
          </button>
        ))}
        <button onClick={() => { setFocusArea(""); analyze({}); }} disabled={loading}
          className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:text-primary transition-colors">
          Full Report
        </button>
      </div>

      {(content || loading) && (
        <div className="border border-border rounded-xl p-5 bg-muted/10 min-h-[200px]">
          {loading && !content && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Claude is analyzing University of Nizwa data…</span>
            </div>
          )}
          <div ref={contentRef} className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}

      {!content && !loading && (
        <div className="rounded-lg border border-border/50 bg-muted/10 p-6 text-center text-muted-foreground text-sm">
          <BrainCircuit className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Click "Generate Analysis" for a full AI-powered strategic report, or use the focus buttons for targeted analysis on specific indicators.</p>
          <p className="mt-1 text-xs">Powered by Claude · University of Nizwa QS 2026 data</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function RankingPage() {
  const [selectedSystem, setSelectedSystem] = useState("qs");
  const [expandedPred, setExpandedPred] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "predictions" | "whatif" | "compare" | "ai" | "hub">("overview");
  const [selectedPeers, setSelectedPeers] = useState<string[]>(["Nizwa", "SQU", "KFUPM", "QU"]);
  const [compareIndicator, setCompareIndicator] = useState("Academic Reputation");
  const [arabTab, setArabTab] = useState<"oman" | "all">("oman");
  const [compareMode, setCompareMode] = useState<"multi" | "h2h">("multi");
  const [h2hLeft, setH2hLeft] = useState("Nizwa");
  const [h2hRight, setH2hRight] = useState("SQU");

  const overviewQ = useQuery<OverviewData>({
    queryKey: ["ranking", "overview"],
    queryFn: () => fetchRanking("/ranking/overview"),
  });

  const trendsQ = useQuery<{
    trends: Record<string, { year: string; score: number; rank?: number }[]>;
    arabRankHistory: { year: string; arabRank: string | number }[];
    worldRankHistory: { year: string; worldRank: string | number }[];
    facultyData: Record<string, unknown>[];
    sustainabilityData: Record<string, unknown>[];
    ratios: Record<string, number>;
  }>({
    queryKey: ["ranking", "trends"],
    queryFn: () => fetchRanking("/ranking/trends"),
    enabled: activeTab === "trends" || activeTab === "overview",
  });

  const predictionsQ = useQuery<PredictionsResponse>({
    queryKey: ["ranking", "predictions"],
    queryFn: () => fetchRanking("/ranking/predictions"),
    enabled: activeTab === "predictions",
  });

  const compareQ = useQuery<CompareData>({
    queryKey: ["ranking", "compare"],
    queryFn: () => fetchRanking("/ranking/compare"),
    enabled: activeTab === "compare",
  });

  const hubQ = useQuery<{ years: HubYearData[] }>({
    queryKey: ["ranking", "hub"],
    queryFn: () => fetchRanking("/ranking/hub"),
    enabled: activeTab === "hub",
  });

  const overview = overviewQ.data;
  const loading = overviewQ.isLoading;
  const trendsLoading = trendsQ.isLoading;

  // Radar chart data
  const radarData = overview?.indicators
    .filter((i) => QS_WEIGHTS[i.indicator])
    .map((ind) => ({
      subject: ind.indicator.replace(" per ", "/").replace("International ", "Intl ").replace(" Reputation", " Rep"),
      label: ind.indicator,
      score: Math.round(ind.score * 10) / 10,
      countryAvg: Math.round(ind.countryAvg * 10) / 10,
    })) || [];

  // Bar chart: score vs country avg for main indicators
  const barData = overview?.indicators
    .filter((i) => QS_WEIGHTS[i.indicator])
    .map((ind) => ({
      name: ind.indicator.length > 22 ? ind.indicator.substring(0, 20) + "…" : ind.indicator,
      fullName: ind.indicator,
      score: Math.round(ind.score * 10) / 10,
      countryAvg: Math.round(ind.countryAvg * 10) / 10,
    })) || [];

  // Arab rank history — lower number = better rank
  const arabHistory = (trendsQ.data?.arabRankHistory || []).map((pt) => ({
    year: pt.year,
    arabRank: typeof pt.arabRank === "number" ? pt.arabRank : parseInt(String(pt.arabRank)) || null,
    label: String(pt.arabRank),
  }));

  // Sustainability sub-scores
  const sustainRows = trendsQ.data?.sustainabilityData || [];
  const sustainChartData = sustainRows
    .filter((r) => r["INDICATOR"] !== "Overall")
    .map((r) => ({
      name: String(r["INDICATOR"] ?? ""),
      score: (r["SCORE"] as number) ?? 0,
      countryAvg: (r["COUNTRY_AVERAGE_SCORE"] as number) ?? 0,
      worldAvg: (r["WORLD_AVERAGE_SCORE"] as number) ?? 0,
    }));

  // Faculty numbers
  const facultyRows = trendsQ.data?.facultyData || [];
  const totalStudents = (facultyRows.find((r) => r["INDICATOR"] === "Total Students")?.[
    "HEADCOUNT"
  ] as number) ?? 0;
  const totalFaculty = (facultyRows.find((r) => r["INDICATOR"] === "Total Academic Staff")?.[
    "HEADCOUNT"
  ] as number) ?? 0;
  const intlStudents = (facultyRows.find((r) => r["INDICATOR"] === "Total International Students")?.[
    "HEADCOUNT"
  ] as number) ?? 0;
  const intlFaculty = (facultyRows.find((r) => r["INDICATOR"] === "Total International Academic Staff")?.[
    "HEADCOUNT"
  ] as number) ?? 0;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "trends", label: "Trends & History" },
    { id: "predictions", label: "Predictions" },
    { id: "whatif", label: "What-If Simulator" },
    { id: "compare", label: "Compare Universities" },
    { id: "hub", label: "HUB Submission Data" },
    { id: "ai", label: "AI Analysis" },
  ] as const;

  // Compare tab derived data
  const compareData = compareQ.data;
  const compareLoading = compareQ.isLoading;
  const allPeers = compareData?.universities ?? [];
  const filteredPeers = allPeers.filter((u) => selectedPeers.includes(u.peer));

  // Radar data for selected peers
  const CORE_INDICATORS = [
    "Academic Reputation", "Employer Reputation", "Faculty Student",
    "Citations per Faculty", "International Faculty", "International Students",
    "International Research Network", "Employment Outcomes", "Sustainability",
  ];

  const radarCompareData = CORE_INDICATORS.map((ind) => {
    const pt: Record<string, unknown> = {
      subject: ind.replace(" per ", "/").replace("International ", "Intl ").replace(" Reputation", " Rep"),
      fullName: ind,
    };
    filteredPeers.forEach((u) => {
      pt[u.peer] = u.indicators.find((i) => i.indicator === ind)?.score ?? 0;
    });
    return pt;
  });

  // Bar data for selected indicator comparison
  const indicatorBarData = allPeers.map((u) => ({
    name: u.peer,
    fullName: u.fullName,
    score: u.indicators.find((i) => i.indicator === compareIndicator)?.score ?? 0,
    rank: u.indicators.find((i) => i.indicator === compareIndicator)?.rank ?? 9999,
    isNizwa: u.peer === "Nizwa",
  })).sort((a, b) => b.score - a.score);

  // World rank bar chart data
  const rankBarData = allPeers.map((u) => ({
    name: u.peer,
    fullName: u.fullName,
    rank: u.overallRank,
    score: u.overallScore,
    isNizwa: u.peer === "Nizwa",
  })).sort((a, b) => a.rank - b.rank);

  // Arab rankings — Oman only
  const omanArabData = compareData?.arabRankings.filter((u) => u.country === "Oman").slice(0, 15) ?? [];
  const allArabData = compareData?.arabRankings.slice(0, 20) ?? [];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <DashboardHeader
          title="University Ranking Intelligence"
          subtitle="University of Nizwa — QS World University Rankings 2026 · data-driven analysis, predictions & strategic insights"
          lastRefreshedAt={overviewQ.dataUpdatedAt ? new Date(overviewQ.dataUpdatedAt).toISOString() : null}
          onRefresh={() => { overviewQ.refetch(); trendsQ.refetch(); }}
          loading={loading}
          onIntervalChange={() => {}}
        />

        {/* Ranking System Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Ranking System:</span>
          {RANKING_SYSTEMS.map((sys) => (
            <button key={sys.id} onClick={() => sys.available && setSelectedSystem(sys.id)}
              disabled={!sys.available}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                selectedSystem === sys.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : sys.available
                  ? "border-border hover:border-primary hover:text-primary bg-background"
                  : "border-border/40 text-muted-foreground/40 cursor-not-allowed bg-muted/20"
              }`}>
              {sys.label}{!sys.available && <span className="ml-1.5 text-[10px]">(soon)</span>}
            </button>
          ))}
        </div>

        {/* Top KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard title="QS World Rank 2026" value={overview ? `#${overview.overallRank}` : "--"} loading={loading} valueColor={CHART_COLORS.amber} />
          <KPICard title="Overall Score" value={overview ? `${overview.overallScore}/100` : "--"} loading={loading} />
          <KPICard title="Country Avg" value={overview ? `${overview.countryAvgScore}` : "--"} loading={loading} />
          <KPICard title="Intl Faculty #" value={overview ? `#${overview.indicators.find(i => i.indicator === "International Faculty")?.rank ?? "--"}` : "--"} loading={loading} valueColor={CHART_COLORS.green} />
          <KPICard title="Employment #" value={overview ? `#${overview.indicators.find(i => i.indicator === "Employment Outcomes")?.rank ?? "--"}` : "--"} loading={loading} valueColor={CHART_COLORS.blue} />
          <KPICard title="Sustainability #" value={overview ? `#${overview.indicators.find(i => i.indicator === "Sustainability")?.rank ?? "--"}` : "--"} loading={loading} valueColor={CHART_COLORS.red} />
        </div>

        {/* Tab Navigation + Print */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {tab.label}
            </button>
          ))}
          <div className="ml-auto pr-1 flex-shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary text-muted-foreground text-xs font-medium transition-all mb-1 print:hidden">
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Strengths */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" /> Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />) :
                    (overview?.strengths.length === 0 ? <p className="text-sm text-muted-foreground">No strengths identified</p> :
                    overview?.strengths.map((s) => (
                      <div key={s.indicator} className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium">{s.indicator}</p>
                          <RankBadge rank={s.rank} />
                        </div>
                        <ScoreVsAvg score={s.score} avg={s.countryAvg} />
                        <p className="text-xs text-muted-foreground mt-1">Score {s.score.toFixed(1)} · Country avg {s.countryAvg.toFixed(1)}</p>
                      </div>
                    )))}
                </CardContent>
              </Card>

              {/* Weaknesses */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" /> Areas Needing Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />) :
                    (overview?.weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">No weaknesses identified</p> :
                    overview?.weaknesses.map((w) => (
                      <div key={w.indicator} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium">{w.indicator}</p>
                          <RankBadge rank={w.rank} />
                        </div>
                        <ScoreVsAvg score={w.score} avg={w.countryAvg} />
                        <p className="text-xs text-muted-foreground mt-1">Score {w.score.toFixed(1)} · Country avg {w.countryAvg.toFixed(1)} · Gap {(w.countryAvg - w.score).toFixed(1)}</p>
                      </div>
                    )))}
                </CardContent>
              </Card>
            </div>

            {/* Radar + Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Indicator Profile</CardTitle>
                  <p className="text-xs text-muted-foreground">Score vs Oman Country Average</p>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-72 w-full" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#71717a" }} />
                        <Radar name="Nizwa Score" dataKey="score" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.25} strokeWidth={2} />
                        <Radar name="Country Avg" dataKey="countryAvg" stroke={CHART_COLORS.amber} fill={CHART_COLORS.amber} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 4" />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <Tooltip content={<CustomTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Score vs Country Average</CardTitle>
                  <p className="text-xs text-muted-foreground">Amber line = Oman avg</p>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-72 w-full" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#71717a" }} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: "#71717a" }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="score" name="Nizwa Score" fill={CHART_COLORS.blue} radius={[0, 3, 3, 0]} />
                        <Bar dataKey="countryAvg" name="Country Avg" fill={CHART_COLORS.amber} opacity={0.6} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Full indicator table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">All Indicators — 2026 Detail</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-64 w-full" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 text-xs font-semibold text-muted-foreground pr-4">Indicator</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Weight</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Score</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Country Avg</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Gap</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground text-center">Rank</th>
                          <th className="pb-2 text-xs font-semibold text-muted-foreground">Score Bar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {overview?.indicators.map((ind) => {
                          const gap = ind.countryAvg - ind.score;
                          const isPositive = gap <= 0;
                          return (
                            <tr key={ind.indicator} className="hover:bg-muted/30">
                              <td className="py-2.5 pr-4 font-medium flex items-center gap-2">
                                <span className="text-muted-foreground">{INDICATOR_ICONS[ind.indicator]}</span>
                                {ind.indicator}
                                {QS_WEIGHTS[ind.indicator] && <Badge variant="outline" className="text-[10px] py-0">{QS_WEIGHTS[ind.indicator]}%</Badge>}
                              </td>
                              <td className="py-2.5 text-center text-muted-foreground">{QS_WEIGHTS[ind.indicator] ? `${QS_WEIGHTS[ind.indicator]}%` : "—"}</td>
                              <td className="py-2.5 text-center font-bold">{ind.score.toFixed(1)}</td>
                              <td className="py-2.5 text-center text-muted-foreground">{ind.countryAvg.toFixed(1)}</td>
                              <td className={`py-2.5 text-center font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
                                {isPositive ? "+" : ""}{(-gap).toFixed(1)}
                              </td>
                              <td className="py-2.5 text-center"><RankBadge rank={ind.rank} /></td>
                              <td className="py-2.5 w-36"><ScoreVsAvg score={ind.score} avg={ind.countryAvg} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── TRENDS TAB ── */}
        {activeTab === "trends" && (
          <div className="space-y-6">
            {/* Arab Rank History */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">QS Arab Rankings History (2016–2026)</CardTitle>
                <p className="text-xs text-muted-foreground">University of Nizwa rank among Arab universities — lower = better</p>
              </CardHeader>
              <CardContent>
                {trendsLoading ? <Skeleton className="h-64 w-full" /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={arabHistory} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#71717a" }} />
                      <YAxis reversed tick={{ fontSize: 11, fill: "#71717a" }} domain={["auto", "auto"]}
                        label={{ value: "Arab Rank", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10, fill: "#71717a" } }} />
                      <Tooltip
                        formatter={(v: unknown) => [String(v), "Arab Rank"]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Line dataKey="arabRank" name="Arab Rank" stroke={CHART_COLORS.blue} strokeWidth={2.5}
                        dot={{ r: 5, fill: CHART_COLORS.blue }} connectNulls activeDot={{ r: 7 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Faculty & Student Numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Students", value: totalStudents, color: CHART_COLORS.blue, icon: <Users className="w-5 h-5" /> },
                { label: "Academic Staff", value: totalFaculty, color: CHART_COLORS.green, icon: <GraduationCap className="w-5 h-5" /> },
                { label: "Intl Students", value: intlStudents, color: CHART_COLORS.amber, icon: <Globe className="w-5 h-5" /> },
                { label: "Intl Faculty", value: intlFaculty, color: CHART_COLORS.purple ?? "#8b5cf6", icon: <Globe className="w-5 h-5" /> },
              ].map(({ label, value, color, icon }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="rounded-lg p-2 bg-muted" style={{ color }}>{icon}</div>
                    <div>
                      <p className="text-2xl font-bold" style={{ color }}>{value > 0 ? value.toLocaleString() : "—"}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Sustainability breakdown */}
            {sustainChartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Sustainability Breakdown (2026)</CardTitle>
                  <p className="text-xs text-muted-foreground">Score vs Country Average and World Average</p>
                </CardHeader>
                <CardContent>
                  {trendsLoading ? <Skeleton className="h-64 w-full" /> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={sustainChartData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#71717a" }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="score" name="Nizwa Score" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="countryAvg" name="Country Avg" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} opacity={0.7} />
                        <Bar dataKey="worldAvg" name="World Avg" fill={CHART_COLORS.red} radius={[3, 3, 0, 0]} opacity={0.5} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ratios */}
            {trendsQ.data?.ratios && Object.keys(trendsQ.data.ratios).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Underlying Ratios (2026)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(trendsQ.data.ratios).map(([key, val]) => (
                      <div key={key} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                          <span className="text-sm font-bold tabular-nums">{(val as number).toFixed(2)}{key.toLowerCase().includes("ratio") ? "%" : ""}</span>
                        </div>
                        <Progress value={Math.min(100, (val as number))} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── PREDICTIONS TAB ── */}
        {activeTab === "predictions" && (
          <div className="space-y-6">
            {/* Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-blue-200 dark:border-blue-800">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Current World Rank</p>
                  <p className="text-3xl font-bold text-blue-600">#{predictionsQ.data?.currentRank ?? overview?.overallRank ?? "--"}</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Reachable Rank (3 yrs)</p>
                  <p className="text-3xl font-bold text-green-600">#{predictionsQ.data?.estimatedReachableRank ?? "--"}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Score Improvement Potential</p>
                  <p className="text-3xl font-bold text-amber-600">+{predictionsQ.data?.rankImprovementPotential ?? "--"}</p>
                </CardContent>
              </Card>
            </div>

            {/* Predictions list */}
            {predictionsQ.isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />) :
              predictionsQ.data?.predictions.map((pred) => (
                <Card key={pred.indicator} className="cursor-pointer" onClick={() => setExpandedPred(expandedPred === pred.indicator ? null : pred.indicator)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TrendIcon trend={pred.trend} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{pred.indicator}</p>
                            {QS_WEIGHTS[pred.indicator] && <Badge variant="secondary" className="text-[10px] py-0">{QS_WEIGHTS[pred.indicator]}%</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">Score: {pred.currentScore} → <span className={pred.predicted2027Score > pred.currentScore ? "text-green-600 font-medium" : pred.predicted2027Score < pred.currentScore ? "text-red-600 font-medium" : ""}>{pred.predicted2027Score}</span></span>
                            <span className="text-xs text-muted-foreground">Rank: #{pred.currentRank} → #{pred.predicted2027Rank}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Confidence</div>
                          <div className="font-bold text-sm">{pred.confidence}%</div>
                        </div>
                        <RankBadge rank={pred.currentRank} />
                      </div>
                    </div>
                    {expandedPred === pred.indicator && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">{pred.recommendation}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            pred.trend === "improving" ? "bg-green-100 text-green-700" :
                            pred.trend === "declining" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                          }`}>
                            <TrendIcon trend={pred.trend} /> {pred.trend}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        {/* ── WHAT-IF TAB ── */}
        {activeTab === "whatif" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> What-If Rank Simulator
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-64 w-full" /> :
                overview ? <WhatIfSimulator overview={overview} /> :
                <p className="text-sm text-muted-foreground">Loading data…</p>}
            </CardContent>
          </Card>
        )}

        {/* ── COMPARE TAB ── */}
        {activeTab === "compare" && (
          <div className="space-y-6">

            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">View:</span>
              {[
                { id: "multi", label: "Multi-University", icon: <Users className="w-3.5 h-3.5" /> },
                { id: "h2h", label: "Head-to-Head 1v1", icon: <GitCompare className="w-3.5 h-3.5" /> },
              ].map((m) => (
                <button key={m.id} onClick={() => setCompareMode(m.id as "multi" | "h2h")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    compareMode === m.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border hover:border-primary hover:text-primary bg-background"
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {/* ── HEAD-TO-HEAD MODE ── */}
            {compareMode === "h2h" && (
              <div className="space-y-6">
                {/* Pickers */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  <Card className="border-2" style={{ borderColor: PEER_COLORS[h2hLeft] ?? "#888" }}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">University A</p>
                      <div className="grid grid-cols-3 gap-2">
                        {compareLoading ? <Skeleton className="h-8 col-span-3" /> :
                          allPeers.map((u) => (
                            <button key={u.peer}
                              onClick={() => { setH2hLeft(u.peer); if (h2hRight === u.peer) setH2hRight(h2hLeft); }}
                              disabled={u.peer === h2hRight}
                              className={`px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                h2hLeft === u.peer
                                  ? "border-2 text-white"
                                  : u.peer === h2hRight
                                  ? "opacity-25 cursor-not-allowed border-border/40"
                                  : "border-border hover:border-primary"
                              }`}
                              style={h2hLeft === u.peer ? { borderColor: PEER_COLORS[u.peer], backgroundColor: PEER_COLORS[u.peer] } : {}}>
                              {PEER_FLAGS[u.country] ?? ""} {u.peer}
                            </button>
                          ))
                        }
                      </div>
                    </CardContent>
                  </Card>

                  <div className="text-center">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-lg font-bold text-muted-foreground">
                      VS
                    </div>
                    <button
                      onClick={() => { const tmp = h2hLeft; setH2hLeft(h2hRight); setH2hRight(tmp); }}
                      className="mt-2 text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mx-auto">
                      <RefreshCw className="w-3 h-3" /> swap
                    </button>
                  </div>

                  <Card className="border-2" style={{ borderColor: PEER_COLORS[h2hRight] ?? "#888" }}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">University B</p>
                      <div className="grid grid-cols-3 gap-2">
                        {compareLoading ? <Skeleton className="h-8 col-span-3" /> :
                          allPeers.map((u) => (
                            <button key={u.peer}
                              onClick={() => { setH2hRight(u.peer); if (h2hLeft === u.peer) setH2hLeft(h2hRight); }}
                              disabled={u.peer === h2hLeft}
                              className={`px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                h2hRight === u.peer
                                  ? "border-2 text-white"
                                  : u.peer === h2hLeft
                                  ? "opacity-25 cursor-not-allowed border-border/40"
                                  : "border-border hover:border-primary"
                              }`}
                              style={h2hRight === u.peer ? { borderColor: PEER_COLORS[u.peer], backgroundColor: PEER_COLORS[u.peer] } : {}}>
                              {PEER_FLAGS[u.country] ?? ""} {u.peer}
                            </button>
                          ))
                        }
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* H2H body */}
                {compareLoading ? <Skeleton className="h-96" /> : (() => {
                  const uA = allPeers.find((u) => u.peer === h2hLeft);
                  const uB = allPeers.find((u) => u.peer === h2hRight);
                  if (!uA || !uB) return null;

                  const aWins = CORE_INDICATORS.filter((ind) => {
                    const a = uA.indicators.find((i) => i.indicator === ind)?.score ?? 0;
                    const b = uB.indicators.find((i) => i.indicator === ind)?.score ?? 0;
                    return a > b;
                  }).length;
                  const bWins = CORE_INDICATORS.filter((ind) => {
                    const a = uA.indicators.find((i) => i.indicator === ind)?.score ?? 0;
                    const b = uB.indicators.find((i) => i.indicator === ind)?.score ?? 0;
                    return b > a;
                  }).length;
                  const ties = CORE_INDICATORS.length - aWins - bWins;
                  const overallWinner = uA.overallRank < uB.overallRank ? uA : uB;

                  // Radar for h2h
                  const h2hRadarData = CORE_INDICATORS.map((ind) => ({
                    subject: ind.replace(" per ", "/").replace("International ", "Intl ").replace(" Reputation", " Rep"),
                    [uA.peer]: uA.indicators.find((i) => i.indicator === ind)?.score ?? 0,
                    [uB.peer]: uB.indicators.find((i) => i.indicator === ind)?.score ?? 0,
                  }));

                  return (
                    <div className="space-y-5">
                      {/* Header scorecards */}
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                        <Card className="border-2" style={{ borderColor: PEER_COLORS[uA.peer] ?? "#888" }}>
                          <CardContent className="p-5 text-center">
                            <div className="text-3xl font-bold" style={{ color: PEER_COLORS[uA.peer] }}>{PEER_FLAGS[uA.country] ?? ""} {uA.peer}</div>
                            <p className="text-xs text-muted-foreground mt-0.5">{uA.fullName}</p>
                            <p className="text-xs text-muted-foreground">{uA.country}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uA.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uA.peer] }}>#{uA.overallRank}</p>
                                <p className="text-[9px] text-muted-foreground font-medium">World 2026</p>
                                {uA.worldRank2025 && (
                                  <p className="text-[9px] text-muted-foreground">
                                    {typeof uA.worldRank2025 === "number" && uA.overallRank < uA.worldRank2025
                                      ? <span className="text-green-600">▲ was #{uA.worldRank2025}</span>
                                      : typeof uA.worldRank2025 === "number" && uA.overallRank > uA.worldRank2025
                                      ? <span className="text-red-500">▼ was #{uA.worldRank2025}</span>
                                      : <span className="text-muted-foreground">was #{uA.worldRank2025}</span>}
                                  </p>
                                )}
                              </div>
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uA.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uA.peer] }}>
                                  {uA.arabRank !== undefined && uA.arabRank !== null ? `#${uA.arabRank}` : "—"}
                                </p>
                                <p className="text-[9px] text-muted-foreground font-medium">Arab 2026</p>
                              </div>
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uA.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uA.peer] }}>{uA.overallScore}</p>
                                <p className="text-[9px] text-muted-foreground font-medium">QS Score</p>
                              </div>
                            </div>
                            <div className="mt-3 inline-block px-3 py-1 rounded-full text-sm font-bold" style={{ background: PEER_COLORS[uA.peer] + "20", color: PEER_COLORS[uA.peer] }}>
                              {aWins}W – {ties}D – {bWins}L
                            </div>
                          </CardContent>
                        </Card>

                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="text-xl font-black text-muted-foreground">VS</div>
                          {aWins !== bWins && (
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Leader</p>
                              <p className="text-sm font-bold" style={{ color: PEER_COLORS[overallWinner.peer] }}>
                                {overallWinner.peer}
                              </p>
                            </div>
                          )}
                        </div>

                        <Card className="border-2" style={{ borderColor: PEER_COLORS[uB.peer] ?? "#888" }}>
                          <CardContent className="p-5 text-center">
                            <div className="text-3xl font-bold" style={{ color: PEER_COLORS[uB.peer] }}>{PEER_FLAGS[uB.country] ?? ""} {uB.peer}</div>
                            <p className="text-xs text-muted-foreground mt-0.5">{uB.fullName}</p>
                            <p className="text-xs text-muted-foreground">{uB.country}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uB.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uB.peer] }}>#{uB.overallRank}</p>
                                <p className="text-[9px] text-muted-foreground font-medium">World 2026</p>
                                {uB.worldRank2025 && (
                                  <p className="text-[9px] text-muted-foreground">
                                    {typeof uB.worldRank2025 === "number" && uB.overallRank < uB.worldRank2025
                                      ? <span className="text-green-600">▲ was #{uB.worldRank2025}</span>
                                      : typeof uB.worldRank2025 === "number" && uB.overallRank > uB.worldRank2025
                                      ? <span className="text-red-500">▼ was #{uB.worldRank2025}</span>
                                      : <span className="text-muted-foreground">was #{uB.worldRank2025}</span>}
                                  </p>
                                )}
                              </div>
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uB.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uB.peer] }}>
                                  {uB.arabRank !== undefined && uB.arabRank !== null ? `#${uB.arabRank}` : "—"}
                                </p>
                                <p className="text-[9px] text-muted-foreground font-medium">Arab 2026</p>
                              </div>
                              <div className="rounded-lg p-2" style={{ background: PEER_COLORS[uB.peer] + "15" }}>
                                <p className="text-lg font-black" style={{ color: PEER_COLORS[uB.peer] }}>{uB.overallScore}</p>
                                <p className="text-[9px] text-muted-foreground font-medium">QS Score</p>
                              </div>
                            </div>
                            <div className="mt-3 inline-block px-3 py-1 rounded-full text-sm font-bold" style={{ background: PEER_COLORS[uB.peer] + "20", color: PEER_COLORS[uB.peer] }}>
                              {bWins}W – {ties}D – {aWins}L
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Radar for h2h */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold">Indicator Radar Comparison</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <RadarChart data={h2hRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                              <PolarGrid stroke="#e5e7eb" />
                              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#71717a" }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#71717a" }} />
                              <Radar name={uA.peer} dataKey={uA.peer} stroke={PEER_COLORS[uA.peer]} fill={PEER_COLORS[uA.peer]} fillOpacity={0.25} strokeWidth={2.5} />
                              <Radar name={uB.peer} dataKey={uB.peer} stroke={PEER_COLORS[uB.peer]} fill={PEER_COLORS[uB.peer]} fillOpacity={0.15} strokeWidth={2} strokeDasharray="4 4" />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>

                      {/* Per-indicator duel rows */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold">Indicator-by-Indicator Duel</CardTitle>
                          <p className="text-xs text-muted-foreground">Score bars — highlighted border = winner of that indicator</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {CORE_INDICATORS.map((ind) => {
                            const aInd = uA.indicators.find((i) => i.indicator === ind);
                            const bInd = uB.indicators.find((i) => i.indicator === ind);
                            const aScore = aInd?.score ?? 0;
                            const bScore = bInd?.score ?? 0;
                            const aWins = aScore > bScore;
                            const bWinsInd = bScore > aScore;
                            const tied = aScore === bScore;
                            const wt = QS_WEIGHTS[ind] ?? 0;

                            return (
                              <div key={ind} className="rounded-xl border border-border/50 p-3 bg-muted/10">
                                {/* Indicator header */}
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-foreground">{ind}</span>
                                  {wt > 0 && <Badge variant="secondary" className="text-[10px] py-0">{wt}%</Badge>}
                                  {tied && <span className="text-[10px] text-muted-foreground italic">Tie</span>}
                                </div>

                                {/* Dual bars */}
                                <div className="space-y-1.5">
                                  {/* A bar */}
                                  <div className={`flex items-center gap-2 p-1.5 rounded-lg transition-all ${aWins ? "ring-1 ring-offset-0" : ""}`}
                                    style={aWins ? { ringColor: PEER_COLORS[uA.peer] } : {}}>
                                    <span className="text-xs font-bold w-12 shrink-0 text-right" style={{ color: PEER_COLORS[uA.peer] }}>
                                      {uA.peer}
                                    </span>
                                    <div className="flex-1 relative h-5 bg-muted rounded-full overflow-hidden">
                                      <div className="absolute left-0 top-0 h-full rounded-full transition-all flex items-center justify-end pr-2"
                                        style={{ width: `${aScore}%`, backgroundColor: PEER_COLORS[uA.peer], minWidth: aScore > 0 ? "2rem" : 0 }}>
                                        {aScore > 10 && <span className="text-[10px] font-bold text-white">{aScore.toFixed(1)}</span>}
                                      </div>
                                    </div>
                                    <span className="text-xs font-bold w-10 shrink-0 tabular-nums" style={{ color: PEER_COLORS[uA.peer] }}>
                                      {aScore.toFixed(1)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground w-14 shrink-0">#{aInd?.rank ?? "—"}</span>
                                    {aWins && <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: PEER_COLORS[uA.peer] }} />}
                                  </div>

                                  {/* B bar */}
                                  <div className={`flex items-center gap-2 p-1.5 rounded-lg transition-all ${bWinsInd ? "ring-1 ring-offset-0" : ""}`}
                                    style={bWinsInd ? { ringColor: PEER_COLORS[uB.peer] } : {}}>
                                    <span className="text-xs font-bold w-12 shrink-0 text-right" style={{ color: PEER_COLORS[uB.peer] }}>
                                      {uB.peer}
                                    </span>
                                    <div className="flex-1 relative h-5 bg-muted rounded-full overflow-hidden">
                                      <div className="absolute left-0 top-0 h-full rounded-full transition-all flex items-center justify-end pr-2"
                                        style={{ width: `${bScore}%`, backgroundColor: PEER_COLORS[uB.peer], minWidth: bScore > 0 ? "2rem" : 0 }}>
                                        {bScore > 10 && <span className="text-[10px] font-bold text-white">{bScore.toFixed(1)}</span>}
                                      </div>
                                    </div>
                                    <span className="text-xs font-bold w-10 shrink-0 tabular-nums" style={{ color: PEER_COLORS[uB.peer] }}>
                                      {bScore.toFixed(1)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground w-14 shrink-0">#{bInd?.rank ?? "—"}</span>
                                    {bWinsInd && <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: PEER_COLORS[uB.peer] }} />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      {/* Summary */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold">Verdict</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-3 rounded-lg" style={{ background: PEER_COLORS[uA.peer] + "15" }}>
                              <p className="text-3xl font-black" style={{ color: PEER_COLORS[uA.peer] }}>{aWins}</p>
                              <p className="text-xs text-muted-foreground mt-1">{uA.peer} leads</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/40">
                              <p className="text-3xl font-black text-muted-foreground">{ties}</p>
                              <p className="text-xs text-muted-foreground mt-1">Tied</p>
                            </div>
                            <div className="p-3 rounded-lg" style={{ background: PEER_COLORS[uB.peer] + "15" }}>
                              <p className="text-3xl font-black" style={{ color: PEER_COLORS[uB.peer] }}>{bWins}</p>
                              <p className="text-xs text-muted-foreground mt-1">{uB.peer} leads</p>
                            </div>
                          </div>
                          <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                            {aWins > bWins
                              ? <><strong style={{ color: PEER_COLORS[uA.peer] }}>{uA.peer}</strong> wins {aWins}/{CORE_INDICATORS.length} indicators but is ranked <strong>#{uA.overallRank}</strong> vs <strong>#{uB.overallRank}</strong> — suggesting {uB.peer} outperforms on higher-weighted indicators.</>
                              : bWins > aWins
                              ? <><strong style={{ color: PEER_COLORS[uB.peer] }}>{uB.peer}</strong> wins {bWins}/{CORE_INDICATORS.length} indicators and ranks higher at <strong>#{uB.overallRank}</strong> vs <strong>#{uA.overallRank}</strong>.</>
                              : <>Both universities are evenly matched across indicators — overall rank difference is due to heavier indicators ({uA.overallRank < uB.overallRank ? uA.peer : uB.peer} ranks higher).</>
                            }
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── MULTI-UNIVERSITY MODE ── */}
            {compareMode === "multi" && (
            <>
            {/* University Selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-primary" /> Select Universities to Compare
                </CardTitle>
                <p className="text-xs text-muted-foreground">QS World Rankings 2026 · 6 universities with full indicator data</p>
              </CardHeader>
              <CardContent>
                {compareLoading ? <Skeleton className="h-16 w-full" /> : (
                  <div className="flex flex-wrap gap-3">
                    {allPeers.map((u) => {
                      const selected = selectedPeers.includes(u.peer);
                      const color = PEER_COLORS[u.peer] ?? "#888";
                      return (
                        <button key={u.peer}
                          onClick={() => setSelectedPeers((prev) =>
                            prev.includes(u.peer)
                              ? prev.filter((p) => p !== u.peer)
                              : [...prev, u.peer]
                          )}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            selected ? "border-2 shadow-sm" : "border-border/60 text-muted-foreground opacity-60 hover:opacity-80"
                          }`}
                          style={selected ? { borderColor: color, backgroundColor: color + "15", color } : {}}>
                          <span className={`w-3 h-3 rounded-full shrink-0`} style={{ background: color }} />
                          <span>{PEER_FLAGS[u.country] ?? ""} {u.peer}</span>
                          <span className="text-xs font-normal opacity-70">#{u.overallRank}</span>
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {compareLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-80" /><Skeleton className="h-80" />
              </div>
            ) : (
              <>
                {/* QS World Rank & Score side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* World Rank bar */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">QS World Rank 2026</CardTitle>
                      <p className="text-xs text-muted-foreground">Lower rank = better position</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={rankBarData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a" }} />
                          <YAxis type="category" dataKey="name" width={52} tick={{ fontSize: 11, fill: "#71717a" }} />
                          <Tooltip
                            formatter={(v: number, _: string, entry: { payload: { fullName: string; score: number } }) =>
                              [`#${v} (score: ${entry.payload.score})`, entry.payload.fullName]
                            }
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Bar dataKey="rank" radius={[0, 4, 4, 0]}>
                            {rankBarData.map((entry) => (
                              <Cell key={entry.name} fill={PEER_COLORS[entry.name] ?? "#888"}
                                opacity={selectedPeers.includes(entry.name) ? 1 : 0.3} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Overall Score bar */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Overall QS Score 2026</CardTitle>
                      <p className="text-xs text-muted-foreground">Higher score = better</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={[...rankBarData].sort((a, b) => b.score - a.score)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#71717a" }} />
                          <YAxis type="category" dataKey="name" width={52} tick={{ fontSize: 11, fill: "#71717a" }} />
                          <Tooltip
                            formatter={(v: number, _: string, entry: { payload: { fullName: string; rank: number } }) =>
                              [`${v}/100 (rank: #${entry.payload.rank})`, entry.payload.fullName]
                            }
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                            {[...rankBarData].sort((a, b) => b.score - a.score).map((entry) => (
                              <Cell key={entry.name} fill={PEER_COLORS[entry.name] ?? "#888"}
                                opacity={selectedPeers.includes(entry.name) ? 1 : 0.3} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Radar comparison */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">Multi-University Indicator Radar</CardTitle>
                    <p className="text-xs text-muted-foreground">QS scores across all 9 weighted indicators (0–100)</p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={340}>
                      <RadarChart data={radarCompareData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#71717a" }} />
                        {filteredPeers.map((u) => (
                          <Radar key={u.peer} name={u.peer} dataKey={u.peer}
                            stroke={PEER_COLORS[u.peer] ?? "#888"}
                            fill={PEER_COLORS[u.peer] ?? "#888"}
                            fillOpacity={u.peer === "Nizwa" ? 0.25 : 0.1}
                            strokeWidth={u.peer === "Nizwa" ? 2.5 : 1.5} />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Indicator drill-down comparison */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Indicator Deep-Dive</CardTitle>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {CORE_INDICATORS.map((ind) => (
                        <button key={ind}
                          onClick={() => setCompareIndicator(ind)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            compareIndicator === ind
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary hover:text-primary"
                          }`}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={indicatorBarData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#71717a" }} />
                        <Tooltip
                          formatter={(v: number, _: string, entry: { payload: { fullName: string; rank: number } }) =>
                            [`${v}/100 (rank #${entry.payload.rank})`, entry.payload.fullName]
                          }
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="score" name={compareIndicator} radius={[4, 4, 0, 0]}>
                          {indicatorBarData.map((entry) => (
                            <Cell key={entry.name}
                              fill={PEER_COLORS[entry.name] ?? "#888"}
                              opacity={selectedPeers.includes(entry.name) ? 1 : 0.3} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Full comparison table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Full Indicator Score Comparison Table</CardTitle>
                    <p className="text-xs text-muted-foreground">All 6 universities · QS 2026 · 🏆 = best in group</p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[700px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 text-muted-foreground font-semibold">Indicator</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Wt.</th>
                            {allPeers.map((u) => (
                              <th key={u.peer} className="text-center py-2 px-2 font-semibold" style={{ color: PEER_COLORS[u.peer] ?? "#888" }}>
                                {PEER_FLAGS[u.country] ?? ""} {u.peer}
                              </th>
                            ))}
                          </tr>
                          <tr className="border-b border-border/50 bg-muted/30">
                            <td className="py-1.5 pr-3 font-bold text-foreground">Overall Rank</td>
                            <td className="text-center text-muted-foreground">—</td>
                            {allPeers.map((u) => (
                              <td key={u.peer} className="text-center py-1.5 px-2 font-bold" style={{ color: PEER_COLORS[u.peer] ?? "#888" }}>
                                #{u.overallRank}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-b border-border/30 bg-muted/20">
                            <td className="py-1.5 pr-3 font-bold text-foreground">Overall Score</td>
                            <td className="text-center text-muted-foreground">—</td>
                            {allPeers.map((u) => (
                              <td key={u.peer} className="text-center py-1.5 px-2 font-bold" style={{ color: PEER_COLORS[u.peer] ?? "#888" }}>
                                {u.overallScore}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-b border-border/30 bg-muted/10">
                            <td className="py-1.5 pr-3 font-bold text-foreground">🌍 Arab Rank 2026</td>
                            <td className="text-center text-muted-foreground">—</td>
                            {allPeers.map((u) => (
                              <td key={u.peer} className="text-center py-1.5 px-2 font-semibold" style={{ color: PEER_COLORS[u.peer] ?? "#888" }}>
                                {u.arabRank !== undefined && u.arabRank !== null ? `#${u.arabRank}` : "—"}
                              </td>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {CORE_INDICATORS.map((ind) => {
                            const leader = compareData?.indicatorLeaders[ind];
                            return (
                              <tr key={ind} className="hover:bg-muted/20">
                                <td className="py-2 pr-3 font-medium text-foreground">{ind}</td>
                                <td className="text-center text-muted-foreground">{QS_WEIGHTS[ind] ?? 0}%</td>
                                {allPeers.map((u) => {
                                  const indData = u.indicators.find((i) => i.indicator === ind);
                                  const isLeader = leader?.peer === u.peer;
                                  return (
                                    <td key={u.peer} className={`text-center py-2 px-2 ${isLeader ? "font-bold" : ""}`}>
                                      <span className={isLeader ? "text-green-600" : u.peer === "Nizwa" ? "font-semibold" : "text-muted-foreground"}>
                                        {indData ? indData.score.toFixed(1) : "—"}
                                      </span>
                                      {isLeader && <span className="ml-1">🏆</span>}
                                      {indData && <span className="block text-[10px] text-muted-foreground">#{indData.rank}</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Arab Rankings section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      🇴🇲 QS Arab Rankings 2026
                    </CardTitle>
                    <div className="flex gap-2 mt-1">
                      {[{ id: "oman", label: "🇴🇲 Oman Universities" }, { id: "all", label: "Top 20 Arab" }].map((t) => (
                        <button key={t.id} onClick={() => setArabTab(t.id as "oman" | "all")}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${arabTab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[600px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 text-muted-foreground font-semibold">Arab Rank</th>
                            <th className="text-left py-2 pr-3 text-muted-foreground font-semibold">University</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Country</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Acad. Rep.</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Empl. Rep.</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Intl Faculty</th>
                            <th className="text-center py-2 text-muted-foreground font-semibold">Intl Students</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {(arabTab === "oman" ? omanArabData : allArabData).map((u, idx) => {
                            const isNizwa = u.name.toLowerCase().includes("nizwa");
                            return (
                              <tr key={idx} className={`hover:bg-muted/20 ${isNizwa ? "bg-blue-50 dark:bg-blue-950/20 font-semibold" : ""}`}>
                                <td className="py-2 pr-3">
                                  <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${isNizwa ? "text-blue-600 bg-blue-100 dark:bg-blue-900/40" : "text-muted-foreground"}`}>
                                    #{u.arabRank2026}
                                  </span>
                                </td>
                                <td className="py-2 pr-3">{u.name}{isNizwa && <span className="ml-1 text-[10px] text-blue-500">← you</span>}</td>
                                <td className="text-center">{PEER_FLAGS[u.country] ?? ""} {u.country}</td>
                                <td className="text-center">{u.scores["Academic Reputation"] ? u.scores["Academic Reputation"].toFixed(1) : "—"}</td>
                                <td className="text-center">{u.scores["Employer Reputation"] ? u.scores["Employer Reputation"].toFixed(1) : "—"}</td>
                                <td className="text-center">{u.scores["International Faculty"] ? u.scores["International Faculty"].toFixed(1) : "—"}</td>
                                <td className="text-center">{u.scores["International Students"] ? u.scores["International Students"].toFixed(1) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            </>
            )}

          </div>
        )}

        {/* ── HUB TAB ── */}
        {activeTab === "hub" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <Database className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>QS HUB Submission Data</strong> — raw figures submitted by University of Nizwa to QS from 2017 to 2026.
                These are the actual headcounts and FTE values used to compute ranking indicators each cycle.
              </p>
            </div>

            {hubQ.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (() => {
              const years = hubQ.data?.years ?? [];
              if (!years.length) return <p className="text-muted-foreground text-sm">No HUB data available.</p>;

              const facultyLineData = years.map((y) => ({
                year: y.year,
                "Total Faculty (FTE)": y.facultyTotal,
                "International Faculty": y.facultyInternational,
                "Faculty with PhD": y.facultyPhD,
              }));

              const studentLineData = years.map((y) => ({
                year: y.year,
                "Total Students (FTE)": y.studentsTotal,
                "Intl Students": y.studentsInternational,
                "Grad/Postgrad": y.studentsGrad,
              }));

              const ratioLineData = years.map((y) => ({
                year: y.year,
                "Student/Faculty Ratio": y.studentsFacultyRatio,
              }));

              const latest = years[years.length - 1];
              const prev = years[years.length - 2];

              return (
                <div className="space-y-6">
                  {/* KPI summary for latest year */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Total Faculty FTE", value: latest.facultyTotal, prev: prev?.facultyTotal, color: CHART_COLORS.blue },
                      { label: "Intl Faculty FTE", value: latest.facultyInternational, prev: prev?.facultyInternational, color: CHART_COLORS.green },
                      { label: "Faculty with PhD", value: latest.facultyPhD, prev: prev?.facultyPhD, color: "#8b5cf6" },
                      { label: "Students/Faculty Ratio", value: latest.studentsFacultyRatio, prev: prev?.studentsFacultyRatio, color: CHART_COLORS.amber, decimals: 1 },
                    ].map((kpi) => {
                      const delta = kpi.value !== null && kpi.prev !== null ? (kpi.value - (kpi.prev ?? 0)) : null;
                      return (
                        <Card key={kpi.label}>
                          <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground">{kpi.label}</p>
                            <p className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>
                              {kpi.value !== null ? (kpi.decimals ? kpi.value.toFixed(1) : Math.round(kpi.value)) : "—"}
                            </p>
                            {delta !== null && (
                              <p className={`text-xs mt-1 flex items-center gap-1 ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {delta >= 0 ? "+" : ""}{kpi.decimals ? delta.toFixed(1) : Math.round(delta)} vs prior year
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Faculty trends chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Faculty Trends (FTE) 2017–2026</CardTitle>
                      <p className="text-xs text-muted-foreground">Full-time equivalent faculty numbers as submitted to QS each cycle</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={facultyLineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line dataKey="Total Faculty (FTE)" stroke={CHART_COLORS.blue} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                          <Line dataKey="International Faculty" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          <Line dataKey="Faculty with PhD" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Student trends chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Student Enrolment Trends (FTE) 2017–2026</CardTitle>
                      <p className="text-xs text-muted-foreground">Student headcounts as submitted to QS</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={studentLineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line dataKey="Total Students (FTE)" stroke={CHART_COLORS.blue} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                          <Line dataKey="Intl Students" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          <Line dataKey="Grad/Postgrad" stroke={CHART_COLORS.amber} strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Student/Faculty ratio */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Student-to-Faculty Ratio 2017–2026</CardTitle>
                      <p className="text-xs text-muted-foreground">Lower ratio = better for QS Faculty Student indicator (weight: 10%)</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={ratioLineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Bar dataKey="Student/Faculty Ratio" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]}>
                            {ratioLineData.map((entry, idx) => (
                              <Cell key={idx} fill={entry["Student/Faculty Ratio"] !== null && entry["Student/Faculty Ratio"]! > 10 ? CHART_COLORS.red : CHART_COLORS.green} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Raw data table */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">Full HUB Submission History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Year</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Faculty FTE</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Intl Faculty</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">PhD Faculty</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Students FTE</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Intl Students</th>
                              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Grad Students</th>
                              <th className="text-right py-2 pl-2 font-semibold text-muted-foreground">S/F Ratio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...years].reverse().map((y) => (
                              <tr key={y.year} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-2 pr-4 font-semibold">{y.year}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.facultyTotal !== null ? Math.round(y.facultyTotal) : "—"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.facultyInternational !== null ? Math.round(y.facultyInternational) : "—"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.facultyPhD !== null ? Math.round(y.facultyPhD) : "—"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.studentsTotal !== null ? Math.round(y.studentsTotal) : "—"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.studentsInternational !== null ? Math.round(y.studentsInternational) : "—"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{y.studentsGrad !== null ? Math.round(y.studentsGrad) : "—"}</td>
                                <td className="text-right py-2 pl-2 tabular-nums font-medium"
                                  style={{ color: y.studentsFacultyRatio !== null && y.studentsFacultyRatio > 10 ? CHART_COLORS.red : CHART_COLORS.green }}>
                                  {y.studentsFacultyRatio !== null ? y.studentsFacultyRatio.toFixed(1) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── AI TAB ── */}
        {activeTab === "ai" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" /> AI Strategic Analysis
              </CardTitle>
              <p className="text-xs text-muted-foreground">Claude AI analyzes University of Nizwa QS data and generates expert strategic recommendations</p>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-64 w-full" /> :
                overview ? <AIAnalysisPanel overview={overview} /> :
                <p className="text-sm text-muted-foreground">Loading data…</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
