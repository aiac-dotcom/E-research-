import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Search, Filter, X, GitCompare, ChevronUp, ChevronDown, ChevronsUpDown,
  CheckSquare, Square, Calendar, Layers,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const PALETTE = [
  "#3b82f6","#22c55e","#f59e0b","#8b5cf6","#ec4899","#14b8a6",
  "#f97316","#6366f1","#ef4444","#0ea5e9","#84cc16","#a855f7",
];

export interface BrowserEntry {
  rank: string | number;
  name: string;
  country: string;
  scores: Record<string, number>;
}

interface BrowserData {
  year: string;
  availableYears: string[];
  universities: BrowserEntry[];
  countries: string[];
  indicatorKeys: string[];
}

// A selected row is a university entry plus which year it came from
interface SelectedItem {
  entry: BrowserEntry;
  year: string;
  key: string; // `${name}__${year}`
}

function rankNum(r: string | number): number {
  if (typeof r === "number") return r;
  const m = String(r).match(/\d+/);
  return m ? parseInt(m[0]) : 99999;
}

function shortInd(s: string) {
  return s
    .replace("International Research Network", "IRN")
    .replace("Citations per Faculty", "Cit/Fac")
    .replace("Citations per Paper", "Cit/Paper")
    .replace("International Faculty", "Intl. Fac.")
    .replace("International Students", "Intl. Stu.")
    .replace("Academic Reputation", "Acad. Rep.")
    .replace("Employer Reputation", "Empl. Rep.")
    .replace("Faculty Student", "Fac/Stu")
    .replace("Employment Outcomes", "Employment")
    .replace("Sustainability", "Sustain.")
    .replace("Staff with PhD", "PhD Staff")
    .replace("Papers per Faculty", "Pap/Fac");
}

type SortDir = "asc" | "desc";

interface Props {
  type: "arab" | "world";
  title: string;
  icon: React.ReactNode;
  color: string;
}

export function RankingBrowser({ type, title, icon, color }: Props) {
  const { getToken } = useAuth();

  // ── Active view year (what's loaded in the table)
  const [selectedYear, setSelectedYear] = useState("2026");

  // ── Table filters
  const [search, setSearch] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [rankMin, setRankMin] = useState("");
  const [rankMax, setRankMax] = useState("");
  const [sortCol, setSortCol] = useState<"rank" | string>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Multi-year selection: key = `${name}__${year}`
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());

  // ── Cache all loaded year data so selections remain valid after year switch
  const [yearDataCache, setYearDataCache] = useState<Map<string, BrowserEntry[]>>(new Map());

  // ── UI state
  const [compareMode, setCompareMode] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const fetchWithAuth = useCallback(async (url: string) => {
    const token = await getToken();
    const r = await fetch(`${API_BASE}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Failed: ${url}`);
    return r.json() as Promise<BrowserData>;
  }, [getToken]);

  const { data, isLoading } = useQuery({
    queryKey: [`ranking-browser-${type}`, selectedYear],
    queryFn: () => fetchWithAuth(`/api/ranking/${type}-browser?year=${selectedYear}`),
  });

  // Cache university data whenever a new year loads
  useEffect(() => {
    if (data?.universities && data.universities.length > 0) {
      setYearDataCache((prev) => {
        const next = new Map(prev);
        next.set(data.year, data.universities);
        return next;
      });
    }
  }, [data]);

  const availableYears = data?.availableYears ?? ["2026"];
  const allCountries = data?.countries ?? [];
  const indicatorKeys = data?.indicatorKeys ?? [];

  // All indicator keys across every cached year
  const allIndicatorKeys = useMemo(() => {
    const keys = new Set<string>();
    yearDataCache.forEach((unis) => unis.forEach((u) => Object.keys(u.scores).forEach((k) => keys.add(k))));
    return [...keys].filter((k) => k !== "Overall Score");
  }, [yearDataCache]);

  // ── Filtered + sorted rows for current year
  const filteredRows = useMemo(() => {
    let rows = data?.universities ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((u) => u.name.toLowerCase().includes(q) || u.country.toLowerCase().includes(q));
    }
    if (selectedCountries.length > 0) {
      rows = rows.filter((u) => selectedCountries.includes(u.country));
    }
    if (rankMin) rows = rows.filter((u) => rankNum(u.rank) >= parseInt(rankMin));
    if (rankMax) rows = rows.filter((u) => rankNum(u.rank) <= parseInt(rankMax));

    rows = [...rows].sort((a, b) => {
      const av = sortCol === "rank" ? rankNum(a.rank) : (a.scores[sortCol] ?? 0);
      const bv = sortCol === "rank" ? rankNum(b.rank) : (b.scores[sortCol] ?? 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [data, search, selectedCountries, rankMin, rankMax, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "rank" ? "asc" : "desc"); }
  };

  // Is a row (in the current year's table) selected?
  const isSelected = (name: string) => selectedItems.has(`${name}__${selectedYear}`);

  const toggleSelect = (entry: BrowserEntry) => {
    const key = `${entry.name}__${selectedYear}`;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < 12) {
        next.set(key, { entry, year: selectedYear, key });
      }
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const allKeys = filteredRows.slice(0, 12).map((u) => `${u.name}__${selectedYear}`);
    const allSelected = allKeys.every((k) => selectedItems.has(k));
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        filteredRows.slice(0, 12).forEach((u) => {
          const k = `${u.name}__${selectedYear}`;
          if (!next.has(k) && next.size < 12) {
            next.set(k, { entry: u, year: selectedYear, key: k });
          }
        });
      }
      return next;
    });
  };

  const removeItem = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const clearAll = () => { setSelectedItems(new Map()); setCompareMode(false); };

  // Flat array of all selected items for comparison
  const selList = useMemo(() => Array.from(selectedItems.values()), [selectedItems]);

  // Label for comparison: if multiple years → show year, else just name
  const multipleYears = useMemo(() => new Set(selList.map((s) => s.year)).size > 1, [selList]);
  const compLabel = (item: SelectedItem) =>
    multipleYears ? `${item.entry.name} (${item.year})` : item.entry.name;

  // Collect all unique indicator keys across ALL selected items
  const compIndicatorKeys = useMemo(() => {
    const keys = new Set<string>();
    selList.forEach((s) => Object.keys(s.entry.scores).forEach((k) => { if (k !== "Overall Score") keys.add(k); }));
    return [...keys];
  }, [selList]);

  // Bar chart data: one row per indicator, one bar per selected university
  const compareChartData = useMemo(() =>
    compIndicatorKeys.map((key) => {
      const point: Record<string, string | number> = { indicator: shortInd(key) };
      selList.forEach((s) => { point[compLabel(s)] = s.entry.scores[key] ?? 0; });
      return point;
    }),
    [selList, compIndicatorKeys, multipleYears] // eslint-disable-line
  );

  // Radar chart data: same shape
  const radarData = useMemo(() =>
    compIndicatorKeys.map((key) => {
      const point: Record<string, string | number> = { subject: shortInd(key) };
      selList.forEach((s) => { point[compLabel(s)] = s.entry.scores[key] ?? 0; });
      return point;
    }),
    [selList, compIndicatorKeys, multipleYears] // eslint-disable-line
  );

  const filteredCountries = allCountries.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  // Indicator columns shown in the table (all, scrollable)
  const tableIndicators = indicatorKeys.filter((k) => k !== "Overall Score");

  // How many of the current year's rows are selected
  const currentYearSelectedCount = selList.filter((s) => s.year === selectedYear).length;
  const allFilteredSelected = filteredRows.slice(0, 12).every((u) => selectedItems.has(`${u.name}__${selectedYear}`));

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1800px] mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color }}>
              <span className="text-white">{icon}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading…"
                  : `${filteredRows.length.toLocaleString()} universities shown · ${data?.universities.length.toLocaleString() ?? 0} total in ${selectedYear}`}
                {selList.length > 0 && (
                  <span className="ml-2 font-semibold" style={{ color }}>
                    · {selList.length} selected across {new Set(selList.map((s) => s.year)).size} year(s)
                  </span>
                )}
              </p>
            </div>
          </div>

          {selList.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setCompareMode(!compareMode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
                style={{ background: color }}
              >
                <GitCompare className="w-3.5 h-3.5" />
                {compareMode ? "Hide Comparison" : `Compare ${selList.length}`}
              </button>
              <button onClick={clearAll} className="p-1.5 rounded-md border border-border hover:bg-muted" title="Clear all selections">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Year Tabs — switching year does NOT clear selections */}
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-muted-foreground font-medium mr-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Year:
          </span>
          {availableYears.map((yr) => {
            const yearSelCount = selList.filter((s) => s.year === yr).length;
            return (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`relative px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  yr === selectedYear
                    ? "text-white border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
                style={yr === selectedYear ? { background: color } : {}}
              >
                {yr}
                {yearSelCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                    style={{ background: yr === selectedYear ? "rgba(0,0,0,0.35)" : color }}
                  >
                    {yearSelCount}
                  </span>
                )}
              </button>
            );
          })}
          <span className="text-[10px] text-muted-foreground ml-2 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Select from multiple years then compare
          </span>
        </div>

        {/* Selected items strip — shows all selected across years */}
        {selList.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg border border-border bg-muted/20">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Selected:</span>
            {selList.map((s, i) => (
              <span
                key={s.key}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ background: PALETTE[i % PALETTE.length] }}
              >
                {s.entry.name}
                {multipleYears && <span className="opacity-70">({s.year})</span>}
                <button onClick={() => removeItem(s.key)} className="ml-0.5 hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Filter Bar */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search university or country…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* Country filter */}
              <div className="relative">
                <button
                  onClick={() => setShowCountryFilter(!showCountryFilter)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm h-8 transition-colors ${
                    selectedCountries.length > 0
                      ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Country
                  {selectedCountries.length > 0 && <span className="font-bold">({selectedCountries.length})</span>}
                </button>
                {showCountryFilter && (
                  <div className="absolute top-10 left-0 z-50 w-64 bg-popover border border-border rounded-lg shadow-xl p-2">
                    <Input
                      placeholder="Search countries…"
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="h-7 text-xs mb-2"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {filteredCountries.map((c) => (
                        <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selectedCountries.includes(c)}
                            onChange={() =>
                              setSelectedCountries((prev) =>
                                prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                              )
                            }
                            className="rounded"
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                    {selectedCountries.length > 0 && (
                      <button onClick={() => setSelectedCountries([])} className="mt-2 w-full text-xs text-center text-muted-foreground hover:text-foreground">
                        Clear selection
                      </button>
                    )}
                    <button onClick={() => setShowCountryFilter(false)} className="mt-1 w-full text-xs text-center text-blue-600 font-semibold">
                      Done
                    </button>
                  </div>
                )}
              </div>

              {/* Rank range */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rank</span>
                <Input placeholder="Min" value={rankMin} onChange={(e) => setRankMin(e.target.value)} className="w-16 h-8 text-xs" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input placeholder="Max" value={rankMax} onChange={(e) => setRankMax(e.target.value)} className="w-16 h-8 text-xs" />
              </div>

              {selectedCountries.map((c) => (
                <Badge key={c} variant="secondary" className="text-xs gap-1 pl-2">
                  {c}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedCountries((p) => p.filter((x) => x !== c))} />
                </Badge>
              ))}

              {(search || selectedCountries.length > 0 || rankMin || rankMax) && (
                <button
                  onClick={() => { setSearch(""); setSelectedCountries([]); setRankMin(""); setRankMax(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Comparison Panel ─────────────────────────────────────────────── */}
        {compareMode && selList.length >= 2 && (
          <div className="space-y-4">
            {/* Bar chart — all indicators */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  All Indicator Scores — Side-by-Side
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {compIndicatorKeys.length} indicators · {selList.length} entries compared
                  {multipleYears && " · cross-year comparison"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(600, compIndicatorKeys.length * 80) }}>
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={compareChartData} margin={{ top: 8, right: 16, left: 0, bottom: 70 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="indicator"
                          tick={{ fontSize: 9 }}
                          angle={-40}
                          textAnchor="end"
                          interval={0}
                          height={70}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} width={32} />
                        <Tooltip formatter={(v: number) => v > 0 ? v.toFixed(1) : "—"} contentStyle={{ fontSize: 11 }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                        {selList.map((s, i) => (
                          <Bar
                            key={s.key}
                            dataKey={compLabel(s)}
                            fill={PALETTE[i % PALETTE.length]}
                            radius={[2, 2, 0, 0]}
                            barSize={Math.max(6, Math.min(24, 180 / (selList.length * compIndicatorKeys.length + 1)))}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Radar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Radar — Relative Strengths</CardTitle>
                <p className="text-xs text-muted-foreground">All {compIndicatorKeys.length} indicators on a single chart</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={420}>
                  <RadarChart data={radarData} margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 9 }}
                    />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} angle={90} tickCount={6} />
                    <Tooltip formatter={(v: number) => v > 0 ? v.toFixed(1) : "—"} contentStyle={{ fontSize: 11 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    {selList.map((s, i) => (
                      <Radar
                        key={s.key}
                        name={compLabel(s)}
                        dataKey={compLabel(s)}
                        stroke={PALETTE[i % PALETTE.length]}
                        fill={PALETTE[i % PALETTE.length]}
                        fillOpacity={0.12}
                        strokeWidth={2}
                      />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Full score table — all indicators, all selected */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Complete Score Table</CardTitle>
                <p className="text-xs text-muted-foreground">
                  All {compIndicatorKeys.length} indicators · green = highest score in each row
                  {multipleYears && " · year shown in parentheses"}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 sticky top-0">
                        <th className="text-left py-2 px-4 font-semibold text-muted-foreground sticky left-0 bg-muted/30 min-w-[170px]">
                          Indicator
                        </th>
                        {selList.map((s, i) => (
                          <th
                            key={s.key}
                            className="text-center py-2 px-3 font-semibold min-w-[130px] whitespace-nowrap"
                            style={{ color: PALETTE[i % PALETTE.length] }}
                          >
                            <div>{s.entry.name.length > 22 ? s.entry.name.slice(0, 22) + "…" : s.entry.name}</div>
                            {multipleYears && (
                              <div className="text-[10px] opacity-60 font-normal">{s.year}</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {compIndicatorKeys.map((key) => {
                        const vals = selList.map((s) => s.entry.scores[key] ?? null);
                        const numericVals = vals.filter((v): v is number => v !== null && v > 0);
                        const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : -1;
                        return (
                          <tr key={key} className="hover:bg-muted/20">
                            <td className="py-2 px-4 font-medium sticky left-0 bg-background">{key}</td>
                            {selList.map((s, i) => {
                              const val = s.entry.scores[key];
                              const isMax = val != null && val === maxVal && val > 0;
                              return (
                                <td key={s.key} className="text-center py-2 px-3">
                                  {val != null && val > 0 ? (
                                    <span className={`font-bold ${isMax ? "text-green-600" : ""}`}>
                                      {val.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border bg-muted/10 font-bold">
                        <td className="py-2 px-4 sticky left-0 bg-muted/10 text-muted-foreground">Rank ({selectedYear} file)</td>
                        {selList.map((s) => (
                          <td key={s.key} className="text-center py-2 px-3">
                            #{String(s.entry.rank).trim()}
                            {multipleYears && (
                              <span className="block text-[10px] text-muted-foreground font-normal">{s.year}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Data Table ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Rankings Table · {selectedYear}
                {currentYearSelectedCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({currentYearSelectedCount} from this year selected)
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Click headers to sort · Check rows to add to comparison · Switch year and select more
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <div className="animate-spin w-6 h-6 border-2 rounded-full mx-auto mb-3" style={{ borderColor: color, borderTopColor: "transparent" }} />
                Loading {selectedYear} data…
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No universities match your filters.</div>
            ) : (
              <div className="overflow-auto max-h-[620px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-background border-b border-border">
                    <tr>
                      <th className="py-2 px-3 w-10 sticky left-0 bg-background">
                        <button onClick={toggleAllFiltered} className="text-muted-foreground hover:text-foreground">
                          {allFilteredSelected && filteredRows.length > 0
                            ? <CheckSquare className="w-4 h-4" style={{ color }} />
                            : <Square className="w-4 h-4" />
                          }
                        </button>
                      </th>
                      <th
                        className="text-left py-2 px-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap sticky left-10 bg-background"
                        onClick={() => toggleSort("rank")}
                      >
                        <span className="flex items-center gap-1">Rank <SortIcon col="rank" /></span>
                      </th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground min-w-[220px]">University</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">Country</th>
                      {tableIndicators.map((key) => (
                        <th
                          key={key}
                          className="text-center py-2 px-2 font-semibold text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap min-w-[78px]"
                          onClick={() => toggleSort(key)}
                          title={key}
                        >
                          <span className="flex items-center justify-center gap-0.5 text-[10px]">
                            {shortInd(key)}
                            <SortIcon col={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filteredRows.map((u, idx) => {
                      const sel = isSelected(u.name);
                      const selIdx = selList.findIndex((s) => s.key === `${u.name}__${selectedYear}`);
                      const dotColor = selIdx >= 0 ? PALETTE[selIdx % PALETTE.length] : undefined;
                      return (
                        <tr
                          key={`${u.name}-${idx}`}
                          className={`transition-colors hover:bg-muted/20 ${sel ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                        >
                          <td className="py-1.5 px-3 sticky left-0 bg-inherit">
                            <button
                              onClick={() => toggleSelect(u)}
                              style={sel ? { color: dotColor } : {}}
                              className={sel ? "" : "text-muted-foreground hover:text-foreground"}
                            >
                              {sel ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="py-1.5 px-3 font-bold text-foreground sticky left-10 bg-inherit">
                            {String(u.rank).trim()}
                          </td>
                          <td className="py-1.5 px-4">
                            <span className="font-semibold" style={sel ? { color: dotColor } : {}}>
                              {u.name}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{u.country}</td>
                          {tableIndicators.map((key) => {
                            const val = u.scores[key];
                            return (
                              <td key={key} className="py-1.5 px-2 text-center">
                                {val != null && val > 0 ? (
                                  <span className={`font-medium text-[11px] ${val >= 80 ? "text-green-600" : val >= 50 ? "text-blue-600" : "text-muted-foreground"}`}>
                                    {val.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30 text-[10px]">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Floating compare button when selections exist and compare is hidden */}
        {selList.length >= 2 && !compareMode && (
          <div className="fixed bottom-6 right-6 z-50">
            <button
              onClick={() => setCompareMode(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-white font-semibold text-sm"
              style={{ background: color }}
            >
              <GitCompare className="w-4 h-4" />
              Compare {selList.length}
              {multipleYears && ` (${new Set(selList.map((s) => s.year)).size} years)`}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
