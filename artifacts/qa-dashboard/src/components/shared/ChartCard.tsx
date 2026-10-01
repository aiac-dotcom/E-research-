import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CSVLink } from "react-csv";
import { Download } from "lucide-react";

interface ChartCardProps {
  title: string;
  loading?: boolean;
  data?: any[];
  filename?: string;
  children: React.ReactNode;
  height?: number;
  className?: string;
}

export function ChartCard({ title, loading, data, filename = "export.csv", children, height = 300, className }: ChartCardProps) {
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <Card className={className}>
      <CardHeader className="px-5 pt-5 pb-2 flex-row items-center justify-between space-y-0 border-b border-border/40 mb-4">
        <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
        {!loading && data && data.length > 0 && (
          <CSVLink 
            data={data} 
            filename={filename} 
            className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80" 
            style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }} 
            aria-label="Export chart data as CSV"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </CSVLink>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton style={{ height: `${height}px`, width: "100%" }} />
        ) : !data || data.length === 0 ? (
          <div style={{ height: `${height}px` }} className="w-full flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded-md border border-dashed">
            No data available
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
