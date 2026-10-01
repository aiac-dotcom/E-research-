import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useGetProjects, useGetSprints } from "@workspace/api-client-react";

interface FilterBarProps {
  projectId: number | null;
  sprint: string | null;
  onProjectChange: (id: number | null) => void;
  onSprintChange: (sprint: string | null) => void;
  showStatus?: boolean;
  status?: string | null;
  onStatusChange?: (status: string | null) => void;
  showSeverity?: boolean;
  severity?: string | null;
  onSeverityChange?: (severity: string | null) => void;
}

export function FilterBar({
  projectId,
  sprint,
  onProjectChange,
  onSprintChange,
  showStatus,
  status,
  onStatusChange,
  showSeverity,
  severity,
  onSeverityChange,
}: FilterBarProps) {
  const { data: projects = [], isLoading: loadingProjects } = useGetProjects();
  const { data: sprints = [], isLoading: loadingSprints } = useGetSprints(
    projectId ? { projectId } : undefined,
    { query: { enabled: !!projectId } }
  );

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border shadow-sm">
      <div className="w-[200px]">
        <Label className="text-[13px] mb-1.5 block text-muted-foreground">Project</Label>
        <Select 
          value={projectId?.toString() || "all"} 
          onValueChange={(v) => {
            onProjectChange(v === "all" ? null : parseInt(v, 10));
            onSprintChange(null);
          }}
          disabled={loadingProjects}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[200px]">
        <Label className="text-[13px] mb-1.5 block text-muted-foreground">Sprint</Label>
        <Select 
          value={sprint || "all"} 
          onValueChange={(v) => onSprintChange(v === "all" ? null : v)}
          disabled={!projectId || loadingSprints || sprints.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Sprints" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sprints</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showStatus && onStatusChange && (
        <div className="w-[160px]">
          <Label className="text-[13px] mb-1.5 block text-muted-foreground">Status</Label>
          <Select value={status || "all"} onValueChange={(v) => onStatusChange(v === "all" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="unexecuted">Unexecuted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showSeverity && onSeverityChange && (
        <div className="w-[160px]">
          <Label className="text-[13px] mb-1.5 block text-muted-foreground">Severity</Label>
          <Select value={severity || "all"} onValueChange={(v) => onSeverityChange(v === "all" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="All Severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
