import { useApi } from "@/lib/api";
import { UNIT_TYPES } from "@/lib/vocab";
import { NativeSelect } from "./common";

export type Unit = { id: number; name: string; type: string; parentId: number | null; code?: string | null; active?: boolean };

/** Depth-first ordering with depth, for indented pickers and trees. */
export function orderTree<T extends Unit>(units: T[]): (T & { depth: number })[] {
  const out: (T & { depth: number })[] = [];
  const ids = new Set(units.map((u) => u.id));
  const walk = (parent: number | null, depth: number) => {
    units.filter((u) => (parent === null ? u.parentId === null || !ids.has(u.parentId) : u.parentId === parent))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((u) => {
        if (out.some((o) => o.id === u.id)) return;
        out.push({ ...u, depth });
        walk(u.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

export function UnitSelect({ value, onChange, source = "/org/units", allLabel = "All units", ariaLabel = "Unit", className }: {
  value: string; onChange: (v: string) => void; source?: string; allLabel?: string; ariaLabel?: string; className?: string;
}) {
  const q = useApi<Unit[]>(source);
  return (
    <NativeSelect value={value} onChange={onChange} ariaLabel={ariaLabel} className={className}>
      <option value="">{allLabel}</option>
      {orderTree(q.data ?? []).map((u) => (
        <option key={u.id} value={String(u.id)}>{"  ".repeat(u.depth)}{u.name} ({UNIT_TYPES[u.type] ?? u.type})</option>
      ))}
    </NativeSelect>
  );
}
