import { useState } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ChartCard } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { CHART_COLORS, STATUS_COLORS } from "@/lib/constants";
import { CustomTooltip, CustomLegend } from "@/components/shared/ChartUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { TestCase } from "@workspace/api-zod";

import { 
  useGetTestCases, getGetTestCasesQueryKey,
  useGetTestCasesByModule, getGetTestCasesByModuleQueryKey,
} from "@workspace/api-client-react";

export default function TestCases() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const params = { projectId, sprint, status, limit: 1000 };
  const moduleParams = { projectId, sprint };
  
  const testsQuery = useGetTestCases(params, { query: { queryKey: getGetTestCasesQueryKey(params) } });
  const moduleQuery = useGetTestCasesByModule(moduleParams, { query: { queryKey: getGetTestCasesByModuleQueryKey(moduleParams) } });

  const loading = testsQuery.isLoading || testsQuery.isFetching || moduleQuery.isLoading || moduleQuery.isFetching;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetTestCasesQueryKey(params) });
    queryClient.invalidateQueries({ queryKey: getGetTestCasesByModuleQueryKey(moduleParams) });
  };

  const testCases = testsQuery.data?.data || [];
  const moduleData = moduleQuery.data || [];

  const columns: ColumnDef<TestCase>[] = [
    {
      accessorKey: "testCaseId",
      header: "Test ID",
      cell: ({ row }) => <span className="font-mono text-xs font-medium text-muted-foreground">{row.original.testCaseId}</span>,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: "module",
      header: "Module",
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => {
        const p = row.original.priority.toLowerCase();
        const colors: Record<string, string> = {
          high: "text-red-600 dark:text-red-400 font-medium",
          medium: "text-blue-600 dark:text-blue-400 font-medium",
          low: "text-gray-500 font-medium",
        };
        return <span className={colors[p] || ""}>{row.original.priority}</span>;
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status.toLowerCase();
        const colorClass = Object.entries(STATUS_COLORS).find(([k]) => status.includes(k))?.[1] || "bg-gray-100 text-gray-800";
        return <Badge variant="outline" className={`border-none ${colorClass}`}>{row.original.status}</Badge>;
      }
    },
    {
      accessorKey: "assignedTo",
      header: "Assignee",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.assignedTo || "Unassigned"}</span>,
    },
    {
      accessorKey: "sprint",
      header: "Sprint",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.sprint || "-"}</span>,
    },
    {
      accessorKey: "executedAt",
      header: "Executed",
      cell: ({ row }) => {
        if (!row.original.executedAt) return <span className="text-muted-foreground">-</span>;
        return <span className="text-muted-foreground">{format(new Date(row.original.executedAt), "MMM d, yyyy")}</span>;
      }
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <DashboardHeader 
          title="Test Cases" 
          subtitle="Explore and filter all test cases across modules"
          lastRefreshedAt={testsQuery.dataUpdatedAt ? new Date(testsQuery.dataUpdatedAt).toISOString() : null}
          onRefresh={handleRefresh}
          loading={loading}
        />

        <FilterBar 
          projectId={projectId} 
          sprint={sprint} 
          onProjectChange={setProjectId} 
          onSprintChange={setSprint}
          showStatus
          status={status}
          onStatusChange={setStatus}
        />

        <ChartCard 
          title="Test Execution by Module" 
          loading={loading} 
          data={moduleData} 
          filename="tests-by-module.csv"
          height={300}
        >
          <ResponsiveContainer width="100%" height={300} debounce={0}>
            <BarChart data={moduleData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="module" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
              <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
              <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
              <Legend content={<CustomLegend />} />
              <Bar dataKey="passed" name="Passed" stackId="a" fill={CHART_COLORS.green} fillOpacity={0.9} isAnimationActive={false} barSize={40} />
              <Bar dataKey="failed" name="Failed" stackId="a" fill={CHART_COLORS.red} fillOpacity={0.9} isAnimationActive={false} barSize={40} />
              <Bar dataKey="blocked" name="Blocked" stackId="a" fill="#f59e0b" fillOpacity={0.9} isAnimationActive={false} barSize={40} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <DataTable 
          data={testCases} 
          columns={columns} 
          loading={loading} 
          filename="test-cases-export.csv" 
          searchPlaceholder="Search test cases..."
        />
      </div>
    </div>
  );
}
