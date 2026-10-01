import { useState } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ChartCard } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { CHART_COLORS } from "@/lib/constants";
import { CustomTooltip, CustomLegend } from "@/components/shared/ChartUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { TesterPerformance } from "@workspace/api-zod";

import { useGetTesters, getGetTestersQueryKey } from "@workspace/api-client-react";

export default function Testers() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const params = { projectId, sprint };
  const testersQuery = useGetTesters(params, { query: { queryKey: getGetTestersQueryKey(params) } });

  const loading = testersQuery.isLoading || testersQuery.isFetching;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetTestersQueryKey(params) });
  };

  const testersData = testersQuery.data || [];

  const columns: ColumnDef<TesterPerformance>[] = [
    {
      accessorKey: "testerName",
      header: "Tester Name",
      cell: ({ row }) => <span className="font-semibold">{row.original.testerName}</span>,
    },
    {
      accessorKey: "testsExecuted",
      header: "Tests Executed",
      cell: ({ row }) => <span className="font-mono">{row.original.testsExecuted}</span>,
    },
    {
      accessorKey: "testsPassed",
      header: "Passed",
      cell: ({ row }) => <span className="font-mono text-green-600 dark:text-green-400 font-medium">{row.original.testsPassed}</span>,
    },
    {
      accessorKey: "testsFailed",
      header: "Failed",
      cell: ({ row }) => <span className="font-mono text-red-600 dark:text-red-400 font-medium">{row.original.testsFailed}</span>,
    },
    {
      accessorKey: "passRate",
      header: "Pass Rate",
      cell: ({ row }) => {
        const pct = row.original.passRate;
        const colorClass = pct >= 90 ? "text-green-600 dark:text-green-400" : pct < 75 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
        return <span className={`font-medium ${colorClass}`}>{pct.toFixed(1)}%</span>;
      }
    },
    {
      accessorKey: "defectsFound",
      header: "Defects Found",
      cell: ({ row }) => {
        const count = row.original.defectsFound;
        return (
          <Badge variant="outline" className={`border-none ${count > 0 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>
            {count}
          </Badge>
        );
      }
    },
    {
      accessorKey: "productivity",
      header: "Productivity Score",
      cell: ({ row }) => {
        const score = row.original.productivity;
        return <span className="font-mono text-muted-foreground">{score.toFixed(1)}</span>;
      }
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <DashboardHeader 
          title="Team Performance" 
          subtitle="Track QA tester productivity and execution metrics"
          lastRefreshedAt={testersQuery.dataUpdatedAt ? new Date(testersQuery.dataUpdatedAt).toISOString() : null}
          onRefresh={handleRefresh}
          loading={loading}
        />

        <FilterBar 
          projectId={projectId} 
          sprint={sprint} 
          onProjectChange={setProjectId} 
          onSprintChange={setSprint}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard 
            title="Tests Executed per Tester" 
            loading={loading} 
            data={testersData} 
            filename="tests-executed.csv"
            height={350}
          >
            <ResponsiveContainer width="100%" height={350} debounce={0}>
              <BarChart data={testersData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="testerName" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Legend content={<CustomLegend />} />
                <Bar dataKey="testsPassed" name="Passed" stackId="a" fill={CHART_COLORS.green} fillOpacity={0.9} isAnimationActive={false} barSize={40} />
                <Bar dataKey="testsFailed" name="Failed" stackId="a" fill={CHART_COLORS.red} fillOpacity={0.9} isAnimationActive={false} barSize={40} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard 
            title="Defects Found per Tester" 
            loading={loading} 
            data={testersData} 
            filename="defects-found.csv"
            height={350}
          >
            <ResponsiveContainer width="100%" height={350} debounce={0}>
              <BarChart data={testersData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="testerName" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Bar dataKey="defectsFound" name="Defects Found" fill="#f97316" fillOpacity={0.8} isAnimationActive={false} barSize={40} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <DataTable 
          data={testersData} 
          columns={columns} 
          loading={loading} 
          filename="tester-performance.csv" 
          searchPlaceholder="Search testers..."
        />
      </div>
    </div>
  );
}
