import { useState } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ChartCard } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { CHART_COLORS, STATUS_COLORS, SEVERITY_COLORS } from "@/lib/constants";
import { CustomTooltip, CustomLegend } from "@/components/shared/ChartUtils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Defect } from "@workspace/api-zod";

import { 
  useGetDefects, getGetDefectsQueryKey,
  useGetDefectsBySeverity, getGetDefectsBySeverityQueryKey,
  useGetDefectsByStatus, getGetDefectsByStatusQueryKey
} from "@workspace/api-client-react";

export default function Defects() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const params = { projectId, sprint, severity, status, limit: 1000 };
  const chartParams = { projectId, sprint };
  
  const defectsQuery = useGetDefects(params, { query: { queryKey: getGetDefectsQueryKey(params) } });
  const severityQuery = useGetDefectsBySeverity(chartParams, { query: { queryKey: getGetDefectsBySeverityQueryKey(chartParams) } });
  const statusQuery = useGetDefectsByStatus(chartParams, { query: { queryKey: getGetDefectsByStatusQueryKey(chartParams) } });

  const loading = 
    defectsQuery.isLoading || defectsQuery.isFetching || 
    severityQuery.isLoading || severityQuery.isFetching ||
    statusQuery.isLoading || statusQuery.isFetching;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetDefectsQueryKey(params) });
    queryClient.invalidateQueries({ queryKey: getGetDefectsBySeverityQueryKey(chartParams) });
    queryClient.invalidateQueries({ queryKey: getGetDefectsByStatusQueryKey(chartParams) });
  };

  const defects = defectsQuery.data?.data || [];
  const severityData = severityQuery.data || [];
  const statusData = statusQuery.data || [];

  const getSeverityColor = (sev: string) => {
    const s = sev.toLowerCase();
    if (s.includes('critical')) return CHART_COLORS.red;
    if (s.includes('high')) return '#f97316';
    if (s.includes('medium')) return CHART_COLORS.blue;
    if (s.includes('low')) return '#6b7280';
    return CHART_COLORS.purple;
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('open')) return CHART_COLORS.red;
    if (s.includes('progress')) return CHART_COLORS.blue;
    if (s.includes('resolv')) return CHART_COLORS.green;
    if (s.includes('clos')) return '#6b7280';
    return CHART_COLORS.purple;
  };

  const columns: ColumnDef<Defect>[] = [
    {
      accessorKey: "defectId",
      header: "Defect ID",
      cell: ({ row }) => <span className="font-mono text-xs font-medium text-muted-foreground">{row.original.defectId}</span>,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => <span className="font-medium max-w-[300px] truncate block" title={row.original.title}>{row.original.title}</span>,
    },
    {
      accessorKey: "module",
      header: "Module",
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => {
        const s = row.original.severity.toLowerCase();
        const colorClass = Object.entries(SEVERITY_COLORS).find(([k]) => s.includes(k))?.[1] || "bg-gray-100 text-gray-800";
        return <Badge variant="outline" className={`border-none ${colorClass}`}>{row.original.severity}</Badge>;
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
      accessorKey: "reportedAt",
      header: "Reported",
      cell: ({ row }) => {
        if (!row.original.reportedAt) return <span className="text-muted-foreground">-</span>;
        return <span className="text-muted-foreground">{format(new Date(row.original.reportedAt), "MMM d, yyyy")}</span>;
      }
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <DashboardHeader 
          title="Defects" 
          subtitle="Track, prioritize, and resolve issues"
          lastRefreshedAt={defectsQuery.dataUpdatedAt ? new Date(defectsQuery.dataUpdatedAt).toISOString() : null}
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
          showSeverity
          severity={severity}
          onSeverityChange={setSeverity}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard 
            title="Defects by Status" 
            loading={loading} 
            data={statusData} 
            filename="defects-status.csv"
            height={300}
          >
            <ResponsiveContainer width="100%" height={300} debounce={0}>
              <PieChart>
                <Pie 
                  data={statusData} 
                  dataKey="count" 
                  nameKey="status" 
                  cx="50%" 
                  cy="45%" 
                  innerRadius={60} 
                  outerRadius={100} 
                  paddingAngle={2} 
                  cornerRadius={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                <Legend content={<CustomLegend />} layout="horizontal" verticalAlign="bottom" wrapperStyle={{ paddingTop: "20px" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard 
            title="Defects by Severity" 
            loading={loading} 
            data={severityData} 
            filename="defects-severity.csv"
            height={300}
          >
            <ResponsiveContainer width="100%" height={300} debounce={0}>
              <BarChart data={severityData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Bar dataKey="count" name="Defects" fillOpacity={0.9} isAnimationActive={false} barSize={50} radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getSeverityColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <DataTable 
          data={defects} 
          columns={columns} 
          loading={loading} 
          filename="defects-export.csv" 
          searchPlaceholder="Search defects..."
        />
      </div>
    </div>
  );
}
