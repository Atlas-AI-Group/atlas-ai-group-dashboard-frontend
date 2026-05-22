/*
 * theme.js — shared visual constants for the dashboard.
 *
 * Don't customize per client unless you have a strong reason. Brand
 * consistency across Atlas's clients matters more than letting each one
 * pick a slightly different blue. Per-client text/terminology lives in
 * App.jsx's CLIENT object; per-client colors should be deliberate
 * exceptions, not casual overrides.
 */

export const colors = {
  bg: "#0a0e1a",
  panel: "#111827",
  panelBorder: "#1f2937",
  cyan: "#22d3ee",
  blue: "#3b82f6",
  text: "#f3f4f6",
  textDim: "#9ca3af",
  green: "#10b981",
  red: "#f87171",
  amber: "#f59e0b",
};

// Labels for the daily/weekly/monthly trend toggle.
export const RANGE_LABEL = {
  daily:   { axis: "30D", deltaSuffix: "today",      bucket: "day" },
  weekly:  { axis: "12W", deltaSuffix: "this week",  bucket: "week" },
  monthly: { axis: "12M", deltaSuffix: "this month", bucket: "month" }
};

// Severity color/tint mapping used by InsightBanner.
export const SEVERITY = {
  info:    { color: colors.cyan,  tint: "rgba(34,211,238,0.08)",  label: "INSIGHT" },
  warning: { color: colors.amber, tint: "rgba(245,158,11,0.10)",  label: "WATCH" },
  alert:   { color: colors.red,   tint: "rgba(248,113,113,0.10)", label: "ALERT" }
};
