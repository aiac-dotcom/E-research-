import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
  ReferenceLine,
} from "recharts";
import {
  GraduationCap, Globe, MapPin, TrendingUp, TrendingDown, Minus,
  Star, AlertTriangle, Award, BookOpen, Users, RefreshCw,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const INDICATOR_COLORS: Record<string, string> = {
  "International Faculty":          "#22c55e",
  "Employment Outcomes":            "#3b82f6",
  "Faculty Student":                "#8b5cf6",
  "International Students":         "#14b8a6",
  "International Research Network": "#f59e0b",
  "Sustainability":                 "#6366f1",
  "Citations per Faculty":          "#f97316",
  "Employer Reputation":            "#ec4899",
  "Academic Reputation":            "#ef4444",
};

const QS_WEIGHTS: Record<string, number> = {
  "Academic Reputation": 30, "Employer Reputation": 15, "Faculty Student": 10,
  "Citations per Faculty": 20, "International Faculty": 5, "International Students": 5,
  "International Research Network": 5, "Employment Outcomes": 5, "Sustainability": 5,
};

const PEER_COLORS: Record<string, string> = {
  Nizwa: "#3b82f6", SQU: "#22c55e", Sohar: "#f59e0b",
  KAU: "#8b5cf6", KFUPM: "#ec4899", QU: "#14b8a6",
};

function rankToNum(r: string | number | undefined): number {
  if (!r) return 9999;
  if (typeof r === "number") return r;
  const m = String(r).match(/\d+/);
  return m ? parseInt(m[0]) : 9999;
}

function Delta({ curr, prev }: { curr: number | string; prev?: number | string }) {
  const n1 = rankToNum(curr), n2 = rankToNum(prev);
  if (!prev) return null;
  const diff = n2 - n1;
  if (diff > 0) return <span className="flex items-center gap-0.5 text-green-600 text-xs font-semibold"><TrendingUp className="w-3 h-3" />+{diff}</span>;
  if (diff < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><TrendingDown className="w-3 h-3" />{diff}</span>;
  return <span className="flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="w-3 h-3" />0</span>;
}

const CustomBarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{d.indicator}</p>
      <p>Score: <span className="font-bold text-blue-600">{d.score}</span> / 100</p>
      {d.countryAvg > 0 && <p>Country Avg: <span className="font-medium">{d.countryAvg?.toFixed(1)}</span></p>}
      {d.rank < 9000 && <p>World Rank: <span className="font-medium">#{d.rank}</span></p>}
      <p>Weight: <span className="font-medium">{d.weight}%</span></p>
    </div>
  );
};

export default function Dashboard() {
  const { getToken } = useAuth();

  const fetchWithAuth = async (url: string) => {
    const token = await getToken();
    const r = await fetch(`${API_BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Failed: ${url}`);
    return r.json();
  };

  const { data: overview, isLoading: ovLoad, refetch: ovRefetch } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => fetchWithAuth("/api/ranking/overview"),
  });

  const { data: trends, isLoading: trLoad } = useQuery({
    queryKey: ["dashboard-trends"],
    queryFn: () => fetchWithAuth("/api/ranking/trends"),
  });

  const { data: worldData } = useQuery({
    queryKey: ["dashboard-world"],
    queryFn: () => fetchWithAuth("/api/ranking/world"),
  });

  const { data: arabData } = useQuery({
    queryKey: ["dashboard-arab"],
    queryFn: () => fetchWithAuth("/api/ranking/arab"),
  });

  const { data: compareData } = useQuery({
    queryKey: ["dashboard-compare"],
    queryFn: () => fetchWithAuth("/api/ranking/compare"),
  });

  const loading = ovLoad || trLoad;

  // Prepare indicator data sorted by score desc
  const indicators: any[] = (overview?.indicators ?? [])
    .filter((i: any) => i.indicator !== "Overall")
    .map((i: any) => ({
      ...i,
      weight: QS_WEIGHTS[i.indicator] ?? 0,
      shortName: i.indicator.replace("International ", "Intl. ").replace("Citations per Faculty", "Citations/Faculty").replace("Employment Outcomes", "Employment").replace("Academic Reputation", "Acad. Rep.").replace("Employer Reputation", "Empl. Rep.").replace("Faculty Student", "Fac./Student").replace("International Research Network", "IRN").replace("Sustainability", "Sustainability"),
    }))
    .sort((a: any, b: any) => b.score - a.score);

  // World rank history
  const worldHistory = (worldData?.history ?? trends?.worldRankHistory ?? []).map((p: any) => ({
    year: p.year,
    rank: rankToNum(p.worldRank),
    label: String(p.worldRank),
  }));

  // Arab rank history
  const arabHistory = (arabData?.nizwaArabRankHistory ?? trends?.arabRankHistory ?? []).map((p: any) => ({
    year: p.year,
    rank: rankToNum(p.arabRank),
    label: String(p.arabRank),
  }));

  // Peer comparison for radar
  const peers: any[] = compareData?.peers ?? [];
  const nizwa = peers.find((p: any) => p.peer === "Nizwa");

  const currentWorldRank = overview?.overallRank ?? null;
  const currentArabRank = arabData?.nizwaArabRank ?? null;
  const prevWorldRank = worldHistory.at(-2)?.label ?? null;
  const prevArabRank = arabHistory.at(-2) ?? null;
  const qsScore = overview?.overallScore ?? 0;

  const strengths = overview?.strengths ?? [];
  const weaknesses = overview?.weaknesses ?? [];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">University of Nizwa</h1>
                <p className="text-sm text-muted-foreground">QS Ranking Intelligence Dashboard · {overview?.year ?? "2026"}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => ovRefetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            {
              label: "World Rank", value: currentWorldRank != null ? `#${currentWorldRank}` : "—",
              icon: <Globe className="w-4 h-4" />, color: "#3b82f6",
              sub: currentWorldRank != null && prevWorldRank != null
                ? <Delta curr={currentWorldRank} prev={prevWorldRank} />
                : <span className="text-xs text-muted-foreground">From Excel file</span>,
              bg: "border-blue-200 dark:border-blue-800",
            },
            {
              label: "Arab Rank", value: currentArabRank != null ? `#${currentArabRank}` : "—",
              icon: <MapPin className="w-4 h-4" />, color: "#8b5cf6",
              sub: currentArabRank != null && prevArabRank != null
                ? <Delta curr={currentArabRank} prev={prevArabRank.rank} />
                : <span className="text-xs text-muted-foreground">QS Arab Rankings</span>,
              bg: "border-purple-200 dark:border-purple-800",
            },
            {
              label: "QS Score 2026", value: qsScore ? qsScore.toFixed(1) : "—",
              icon: <Star className="w-4 h-4" />, color: "#f59e0b",
              sub: <span className="text-xs text-muted-foreground">out of 100</span>,
              bg: "border-amber-200 dark:border-amber-800",
            },
            {
              label: "Best Indicator", value: indicators[0]?.score ?? "—",
              icon: <Award className="w-4 h-4" />, color: "#22c55e",
              sub: <span className="text-xs text-muted-foreground truncate max-w-[100px]">{indicators[0]?.shortName}</span>,
              bg: "border-green-200 dark:border-green-800",
            },
            {
              label: "Intl. Faculty", value: `${overview?.indicators?.find((i: any) => i.indicator === "International Faculty")?.score ?? "—"}`,
              icon: <Users className="w-4 h-4" />, color: "#22c55e",
              sub: <span className="text-xs text-muted-foreground">Rank #{overview?.indicators?.find((i: any) => i.indicator === "International Faculty")?.rank ?? "—"}</span>,
              bg: "border-teal-200 dark:border-teal-800",
            },
            {
              label: "Acad. Reputation", value: `${overview?.academicRepScore?.toFixed(1) ?? "—"}`,
              icon: <BookOpen className="w-4 h-4" />, color: "#ef4444",
              sub: <span className="text-xs text-muted-foreground">Score out of 100</span>,
              bg: "border-red-200 dark:border-red-800",
            },
          ].map((kpi, i) => (
            <Card key={i} className={kpi.bg}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
                  <span style={{ color: kpi.color }}>{kpi.icon}</span>
                </div>
                {loading ? (
                  <div className="h-8 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                    <div className="mt-1">{kpi.sub}</div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Row 2: Indicator Scores + Rank Histories */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* QS Indicator Scores — horizontal bar */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">QS 2026 Indicator Scores vs Country Average</CardTitle>
              <p className="text-xs text-muted-foreground">Score out of 100 · bars = UoN · dashes = Oman country average</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={indicators}
                  layout="vertical"
                  margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="score" name="UoN Score" radius={[0, 4, 4, 0]} barSize={14}>
                    {indicators.map((ind: any, idx: number) => (
                      <Cell key={idx} fill={INDICATOR_COLORS[ind.indicator] ?? "#3b82f6"} fillOpacity={0.85} />
                    ))}
                    <LabelList
                      dataKey="score"
                      position="right"
                      formatter={(v: number) => v.toFixed(1)}
                      style={{ fontSize: 10, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                  <Bar dataKey="countryAvg" name="Country Avg" radius={[0, 4, 4, 0]} barSize={5} fill="#94a3b8" fillOpacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Score breakdown mini table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Indicator Details</CardTitle>
              <p className="text-xs text-muted-foreground">Score · World Rank · Weight</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground">Indicator</th>
                      <th className="text-center py-2 px-2 font-semibold text-muted-foreground">Score</th>
                      <th className="text-center py-2 px-2 font-semibold text-muted-foreground">Rank</th>
                      <th className="text-center py-2 px-2 font-semibold text-muted-foreground">Wt.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {indicators.map((ind: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="py-2 px-4 font-medium" style={{ color: INDICATOR_COLORS[ind.indicator] ?? "#888" }}>
                          {ind.shortName}
                        </td>
                        <td className="text-center py-2 px-2 font-bold">{ind.score}</td>
                        <td className="text-center py-2 px-2 text-muted-foreground">
                          {ind.rank < 9000 ? `#${ind.rank}` : "—"}
                        </td>
                        <td className="text-center py-2 px-2 text-muted-foreground">{ind.weight}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: World Rank History + Arab Rank History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" />
                World Rank History (2016–2026)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Lower number = better position</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={worldHistory} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis reversed tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={55} tickFormatter={(v) => `#${v}`} />
                  <Tooltip
                    formatter={(_v: any, _n: any, props: any) => [`#${props.payload?.label ?? _v}`, "World Rank"]}
                  />
                  {currentWorldRank != null && <ReferenceLine y={currentWorldRank} stroke="#3b82f6" strokeDasharray="4 2" strokeWidth={1} />}
                  <Line
                    type="monotone" dataKey="rank" stroke="#3b82f6" strokeWidth={2.5}
                    dot={{ fill: "#3b82f6", r: 4 }} activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground px-2">
                {worldHistory.length > 0 ? (
                  <>
                    <span>📍 <strong className="text-blue-600">#{worldHistory.at(-1)?.label}</strong> in {worldHistory.at(-1)?.year}</span>
                    {prevWorldRank && <span>was <strong>#{prevWorldRank}</strong> in {worldHistory.at(-2)?.year}</span>}
                    {currentWorldRank != null && prevWorldRank != null && <Delta curr={currentWorldRank} prev={prevWorldRank} />}
                  </>
                ) : (
                  <span className="text-muted-foreground italic">No world ranking files found</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-600" />
                Arab Rank History (2016–2026)
              </CardTitle>
              <p className="text-xs text-muted-foreground">Lower number = better position</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={arabHistory} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis reversed tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={40} tickFormatter={(v) => `#${v}`} />
                  <Tooltip
                    formatter={(_v: any, _n: any, props: any) => [`#${props.payload?.label ?? _v}`, "Arab Rank"]}
                  />
                  {currentArabRank != null && <ReferenceLine y={rankToNum(currentArabRank)} stroke="#8b5cf6" strokeDasharray="4 2" strokeWidth={1} />}
                  <Line
                    type="monotone" dataKey="rank" stroke="#8b5cf6" strokeWidth={2.5}
                    dot={{ fill: "#8b5cf6", r: 4 }} activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground px-2">
                {arabHistory.length > 0 ? (
                  <>
                    <span>📍 <strong className="text-purple-600">#{arabHistory.at(-1)?.label}</strong> in {arabHistory.at(-1)?.year}</span>
                    {prevArabRank && <span>was <strong>#{prevArabRank.label}</strong> in {prevArabRank.year}</span>}
                    {currentArabRank != null && prevArabRank != null && <Delta curr={currentArabRank} prev={prevArabRank.rank} />}
                  </>
                ) : (
                  <span className="text-muted-foreground italic">No Arab ranking files found</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 4: Peer World Rank Comparison + Strengths & Weaknesses */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Peer comparison bar */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Peer Universities — World Rank 2026</CardTitle>
              <p className="text-xs text-muted-foreground">Lower rank = higher position · QS 2026</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={(compareData?.peers ?? peers)
                    .filter((p: any) => p.worldRank2026 ?? p.overallRank)
                    .map((p: any) => ({
                      peer: p.peer,
                      rank: p.worldRank2026 ?? p.overallRank,
                      arabRank: p.arabRank,
                      color: PEER_COLORS[p.peer] ?? "#888",
                    }))
                    .sort((a: any, b: any) => a.rank - b.rank)}
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="peer" tick={{ fontSize: 12 }} />
                  <YAxis reversed tick={{ fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `#${v}`} />
                  <Tooltip
                    formatter={(v: any, _n: any, props: any) => [
                      `#${v} World  |  Arab: #${props.payload.arabRank ?? "—"}`,
                      props.payload.peer,
                    ]}
                  />
                  <Bar dataKey="rank" radius={[4, 4, 0, 0]} barSize={36}>
                    {(compareData?.peers ?? peers).map((p: any, idx: number) => (
                      <Cell key={idx} fill={PEER_COLORS[p.peer] ?? "#888"} fillOpacity={p.peer === "Nizwa" ? 1 : 0.6} />
                    ))}
                    <LabelList
                      dataKey="rank"
                      position="top"
                      formatter={(v: number) => `#${v}`}
                      style={{ fontSize: 10, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Strengths & Weaknesses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Strengths & Gaps</CardTitle>
              <p className="text-xs text-muted-foreground">vs Oman country average</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1"><Award className="w-3.5 h-3.5" />Strengths</p>
                  <div className="space-y-1.5">
                    {strengths.map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                        <span className="text-xs font-medium text-green-800 dark:text-green-300 truncate">{s.indicator}</span>
                        <span className="text-xs font-bold text-green-700 dark:text-green-400 ml-2 shrink-0">{s.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {weaknesses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Improvement Areas</p>
                  <div className="space-y-1.5">
                    {weaknesses.map((w: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900">
                        <span className="text-xs font-medium text-red-800 dark:text-red-300 truncate">{w.indicator}</span>
                        <span className="text-xs font-bold text-red-700 dark:text-red-400 ml-2 shrink-0">{w.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {strengths.length === 0 && weaknesses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 5: All Indicators Score-to-Rank Mini Cards */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">All QS Indicators — Score & World Rank at a Glance</CardTitle>
            <p className="text-xs text-muted-foreground">University of Nizwa · QS 2026 · 9 indicators</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
              {indicators.map((ind: any, i: number) => {
                const color = INDICATOR_COLORS[ind.indicator] ?? "#888";
                const pct = Math.min(100, ind.score);
                return (
                  <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    {/* Circular progress ring */}
                    <div className="relative w-14 h-14">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                        <circle
                          cx="28" cy="28" r="22" fill="none"
                          stroke={color} strokeWidth="5"
                          strokeDasharray={`${(pct / 100) * 138.2} 138.2`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-black" style={{ color }}>{ind.score}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-semibold text-foreground leading-tight">{ind.shortName}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {ind.rank < 9000 ? `Rank #${ind.rank}` : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{ind.weight}% weight</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
