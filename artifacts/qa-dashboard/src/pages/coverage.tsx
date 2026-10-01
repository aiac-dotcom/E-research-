import { useState } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ChartCard } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { CHART_COLORS } from "@/lib/constants";
import { CustomTooltip } from "@/components/shared/ChartUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ModuleCoverage } from "@workspace/api-zod";

import { useGetCoverage, getGetCoverageQueryKey } from "@workspace/api-client-react";

export default function Coverage() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const params = { projectId, sprint };
  const coverageQuery = useGetCoverage(params, { query: { queryKey: getGetCoverageQueryKey(params) } });

  const loading = coverageQuery.isLoading || coverageQuery.isFetching;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetCoverageQueryKey(params) });
  };

  const coverageData = coverageQuery.data || [];

  const getCoverageColor = (percent: number) => {
    if (percent >= 80) return CHART_COLORS.green;
    if (percent >= 50) return "#f59e0b"; // yellow/amber
    return CHART_COLORS.red;
  };

  const columns: ColumnDef<ModuleCoverage>[] = [
    {
      accessorKey: "module",
      header: "Module",
      cell: ({ row }) => <span className="font-semibold">{row.original.module}</span>,
    },
    {
      accessorKey: "coveragePercent",
      header: "Coverage",
      cell: ({ row }) => {
        const pct = row.original.coveragePercent;
        const color = getCoverageColor(pct);
        const bg = pct >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                 : pct >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" 
                 : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
        return (
          <div className="flex items-center gap-3">
            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <Badge variant="outline" className={`border-none ${bg}`}>{pct.toFixed(1)}%</Badge>
          </div>
        );
      }
    },
    {
      accessorKey: "totalRequirements",
      header: "Total Reqs",
      cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.totalRequirements}</span>,
    },
    {
      accessorKey: "coveredRequirements",
      header: "Covered Reqs",
      cell: ({ row }) => <span className="font-mono">{row.original.coveredRequirements}</span>,
    },
    {
      accessorKey: "totalTests",
      header: "Total Tests",
      cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.totalTests}</span>,
    },
    {
      accessorKey: "passedTests",
      header: "Passed Tests",
      cell: ({ row }) => <span className="font-mono text-green-600 dark:text-green-400 font-medium">{row.original.passedTests}</span>,
    },
    {
      accessorKey: "defectCount",
      header: "Defects",
      cell: ({ row }) => {
        const count = row.original.defectCount;
        return <span className={`font-mono font-medium ${count > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{count}</span>;
      }
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <DashboardHeader 
          title="Module Coverage" 
          subtitle="Analyze test coverage and risk areas by module"
          lastRefreshedAt={coverageQuery.dataUpdatedAt ? new Date(coverageQuery.dataUpdatedAt).toISOString() : null}
          onRefresh={handleRefresh}
          loading={loading}
        />

        <FilterBar 
          projectId={projectId} 
          sprint={sprint} 
          onProjectChange={setProjectId} 
          onSprintChange={setSprint}
        />

        <ChartCard 
          title="Coverage % by Module" 
          loading={loading} 
          data={coverageData} 
          filename="coverage-chart.csv"
          height={400}
        >
          <ResponsiveContainer width="100%" height={400} debounce={0}>
            <BarChart data={coverageData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="module" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} width={120} />
              <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
              <Bar dataKey="coveragePercent" name="Coverage %" fillOpacity={0.8} isAnimationActive={false} radius={[0, 4, 4, 0]} barSize={24}>
                {coverageData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getCoverageColor(entry.coveragePercent)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <DataTable 
          data={coverageData} 
          columns={columns} 
          loading={loading} 
          filename="coverage-data.csv" 
          searchPlaceholder="Search modules..."
        />
      </div>
    </div>
  );
}
