// HealthPanel.jsx
// Source Health panel with per-entity findings (alert / warning / info).
// Findings come from /api/health/source, which delegates to adapter.healthFindings().
//
// Backport note (2026-05-17): extracted from BlueKey App.jsx:469-540. Renamed
// "Apollo Health" to "Source Health" so the component is provider-agnostic.

import { useState } from "react";
import { colors } from "../theme";

export function HealthPanel({ sourceHealth }) {
  const [expandedFinding, setExpandedFinding] = useState(null);
  if (!sourceHealth) return null;

  const status = sourceHealth.overall_status;
  const statusMeta = ({
    healthy:         { color: colors.green, label: "All Systems Healthy", icon: "✓" },
    needs_attention: { color: "#fbbf24",    label: "Needs Attention",     icon: "!" },
    critical:        { color: colors.red,   label: "Critical Issues",     icon: "✕" }
  })[status] || { color: colors.textDim, label: status || "Unknown", icon: "?" };

  const sevMeta = {
    alert:   { color: colors.red,   label: "ALERT",   bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.35)" },
    warning: { color: "#fbbf24",    label: "WARNING", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.35)" },
    info:    { color: colors.blue,  label: "INFO",    bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.35)" }
  };

  const s = sourceHealth.summary || {};
  const fc = s.finding_counts || { alert: 0, warning: 0, info: 0 };
  const findingsSorted = (sourceHealth.findings || []).slice().sort((a, b) => {
    const order = { alert: 0, warning: 1, info: 2 };
    return (order[a.severity] !== undefined ? order[a.severity] : 9) - (order[b.severity] !== undefined ? order[b.severity] : 9);
  });

  return (
    <div style={{ background: colors.panel, border: "1px solid " + statusMeta.color, borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ background: statusMeta.color, color: colors.bg, width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.9rem" }}>{statusMeta.icon}</span>
          <h2 style={{ fontSize: "1rem", margin: 0, fontWeight: 600 }}>Source Health · <span style={{ color: statusMeta.color }}>{statusMeta.label}</span></h2>
        </div>
        <span style={{ color: colors.textDim, fontSize: "0.7rem" }}>
          {(fc.alert + fc.warning + fc.info) > 0
            ? `${fc.alert} alert · ${fc.warning} warning · ${fc.info} info`
            : "Nothing flagged"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem", marginBottom: findingsSorted.length > 0 ? "1rem" : 0 }}>
        <div><div style={{ color: colors.textDim, fontSize: "0.65rem", textTransform: "uppercase" }}>ACTIVE</div><div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2 }}>{(s.active_sequences || 0)} / {(s.total_sequences || 0)}</div></div>
        <div><div style={{ color: colors.textDim, fontSize: "0.65rem", textTransform: "uppercase" }}>SENT 24H</div><div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2, color: (s.delivered_last_24h || 0) > 0 ? colors.green : colors.textDim }}>{(s.delivered_last_24h || 0).toLocaleString()}</div></div>
        <div><div style={{ color: colors.textDim, fontSize: "0.65rem", textTransform: "uppercase" }}>SENT 7D</div><div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2, color: (s.delivered_last_7d || 0) > 0 ? colors.green : colors.textDim }}>{(s.delivered_last_7d || 0).toLocaleString()}</div></div>
        <div><div style={{ color: colors.textDim, fontSize: "0.65rem", textTransform: "uppercase" }}>OPEN RATE</div><div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2, color: colors.blue }}>{(s.avg_open_rate || 0).toFixed(1)}%</div></div>
        <div><div style={{ color: colors.textDim, fontSize: "0.65rem", textTransform: "uppercase" }}>REPLY RATE</div><div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 2, color: colors.green }}>{(s.avg_reply_rate || 0).toFixed(2)}%</div></div>
      </div>
      {findingsSorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {findingsSorted.map((f, i) => {
            const meta = sevMeta[f.severity] || sevMeta.info;
            const isExpanded = expandedFinding === i;
            return (
              <div
                key={i}
                onClick={() => setExpandedFinding(isExpanded ? null : i)}
                style={{ background: meta.bg, border: "1px solid " + meta.border, borderRadius: 8, padding: "0.7rem 0.85rem", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span style={{ color: meta.color, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>{meta.label}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 500, flex: 1, minWidth: 0 }}>{f.title}</span>
                  <span style={{ color: colors.textDim, fontSize: "0.7rem", flexShrink: 0 }}>{isExpanded ? "▾" : "▸"}</span>
                </div>
                {isExpanded && (
                  <div style={{ color: colors.textDim, fontSize: "0.8rem", marginTop: "0.5rem", lineHeight: 1.5 }}>
                    {f.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!s.trends_available && (
        <div style={{ marginTop: "0.85rem", color: colors.textDim, fontSize: "0.7rem", fontStyle: "italic" }}>
          Trend data not yet available — 24h/7d send counts will populate once daily snapshots accumulate.
        </div>
      )}
    </div>
  );
}
