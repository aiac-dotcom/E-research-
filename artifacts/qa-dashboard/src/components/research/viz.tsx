import { useEffect, useState } from "react";

/**
 * Chart tokens. Categorical slots come from the validated reference palette
 * (fixed order, light and dark steps chosen separately and checked for
 * colour-vision-deficiency separation). Text never uses series colours.
 */
const LIGHT = {
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  surface: "#fcfcfb", grid: "#e1e0d9", axis: "#c3c2b7", muted: "#6b6a65", ink: "#0b0b0b", ink2: "#52514e", hover: "rgba(11,11,11,0.05)",
  seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
};
const DARK = {
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  surface: "#1a1a19", grid: "#2c2c2a", axis: "#383835", muted: "#a3a29b", ink: "#ffffff", ink2: "#c3c2b7", hover: "rgba(255,255,255,0.06)",
  seq: ["#0d366b", "#184f95", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"],
};

export type Viz = typeof LIGHT;

export function useViz(): Viz {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}

/** Tooltip: value first (strong), label second; line-key swatches. */
export function VizTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value !== undefined && p.value !== null && p.value !== 0);
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && <div className="mb-1 font-medium text-popover-foreground">{label}</div>}
      {rows.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color ?? p.fill }} aria-hidden />
          <span className="font-semibold tabular-nums text-popover-foreground">{Number(p.value).toLocaleString()}{unit ?? ""}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
