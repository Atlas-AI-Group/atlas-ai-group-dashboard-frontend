// ReadinessScorecard.jsx
// Renders an array of readiness checks as a verdict pill (READY / ALMOST READY / NOT READY).
// Opt-in via clientConfig.FEATURES.stormReadiness.
// Checks are produced by adapter.readinessChecks() and surfaced via GET /api/readiness.
//
// Backport note (2026-05-17): extracted from BlueKey App.jsx:352-407. The
// "Storm Readiness" label is the BlueKey use case — the component itself is
// generic. Pass a `title` prop to change the heading.

import { colors } from "../theme";

export function ReadinessScorecard({ title = "Readiness", verdict, passed, total, checks }) {
  if (!Array.isArray(checks) || checks.length === 0) return null;

  const meta = verdict === "READY"
    ? { color: colors.green,  label: "READY",         sub: "All checks green" }
    : verdict === "ALMOST_READY"
    ? { color: "#fbbf24",     label: "ALMOST READY",  sub: `${passed}/${total} checks green` }
    : { color: colors.red,    label: "NOT READY",     sub: `${passed}/${total} checks green — multiple gaps to close` };

  return (
    <div style={{
      background: colors.panel,
      border: "2px solid " + meta.color,
      borderRadius: 10,
      padding: "1.25rem",
      marginBottom: "1.5rem"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
        <span style={{
          background: meta.color,
          color: colors.bg,
          padding: "0.3rem 0.7rem",
          borderRadius: 6,
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.06em"
        }}>{meta.label}</span>
        <h2 style={{ fontSize: "1rem", margin: 0, fontWeight: 600 }}>{title}</h2>
      </div>
      <div style={{ color: colors.textDim, fontSize: "0.78rem", lineHeight: 1.45, marginBottom: "0.85rem" }}>
        {meta.sub}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              background: c.ok ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)",
              border: "1px solid " + (c.ok ? "rgba(16,185,129,0.5)" : "rgba(248,113,113,0.5)"),
              color: c.ok ? colors.green : colors.red,
              fontSize: "0.7rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>{c.ok ? "✓" : "✕"}</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>{c.label}</span>
            <span style={{ color: colors.textDim, fontSize: "0.72rem" }}>· {c.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
