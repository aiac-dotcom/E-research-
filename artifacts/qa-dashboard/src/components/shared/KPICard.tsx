import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_COLORS } from "@/lib/constants";

interface KPICardProps {
  title: string;
  value: string | number;
  loading?: boolean;
  valueColor?: string;
  subtitle?: React.ReactNode;
}

export function KPICard({ title, value, loading, valueColor = CHART_COLORS.blue, subtitle }: KPICardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {loading ? (
          <>
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-32 mb-1" />
            {subtitle && <Skeleton className="h-3 w-40 mt-2" />}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold tracking-tight" style={{ color: valueColor }}>
              {value}
            </p>
            {subtitle && (
              <div className="mt-2 text-xs text-muted-foreground">
                {subtitle}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
