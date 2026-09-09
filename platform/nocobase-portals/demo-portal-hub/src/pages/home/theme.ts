// Shared visual + chart tokens for the All in one suite.
// This is the design anchor: every module should import from here so all
// dashboards read as one system. Do NOT hardcode chart hex in a module —
// import CHART_PALETTE / useChartTheme instead.
//
//   import { CHART_PALETTE, useChartTheme, useIsDark } from "@/pages/home/theme";
//
// Text/background/border colors always come from the shadcn CSS tokens
// (bg-card, text-muted-foreground, border-border/70). Charts use this palette.

import { useEffect, useState } from "react";

/** Brand blue — the primary series color and the shell accent. */
export const BRAND_BLUE = "#2563eb";

/**
 * Categorical series palette (blue-forward). Use in order for multi-series
 * charts. NEVER the native black bars.
 */
export const CHART_PALETTE = [
  "#2563eb", // blue   — primary / series 1
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#a855f7", // violet
  "#ef4444", // red
] as const;

/** Brighter variants that read better on dark backgrounds. */
export const CHART_PALETTE_DARK = [
  "#3b82f6",
  "#38bdf8",
  "#2dd4bf",
  "#fbbf24",
  "#c084fc",
  "#f87171",
] as const;

/**
 * Tracks whether the `.dark` class is present on <html>. Robust across the
 * next-themes / custom theme-provider setup — observes the class directly so
 * charts recolor the instant the theme toggles.
 */
export function useIsDark(): boolean {
  const read = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const [isDark, setIsDark] = useState<boolean>(read);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(read()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    setIsDark(read());
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export type ChartTheme = {
  palette: string[];
  /** Axis line + label color (muted). */
  axis: string;
  /** Split/grid line color. */
  grid: string;
  /** Tooltip surface + text. */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  isDark: boolean;
};

/**
 * Returns a ready-to-spread ECharts color context for the current theme.
 * Spread `palette` into `color`, and use `axis`/`grid` for axis + splitLine.
 */
export function useChartTheme(): ChartTheme {
  const isDark = useIsDark();
  return {
    palette: [...(isDark ? CHART_PALETTE_DARK : CHART_PALETTE)],
    axis: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)",
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
    tooltipBg: isDark ? "#1e293b" : "#ffffff",
    tooltipBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)",
    tooltipText: isDark ? "#f8fafc" : "#0f172a",
    isDark,
  };
}
