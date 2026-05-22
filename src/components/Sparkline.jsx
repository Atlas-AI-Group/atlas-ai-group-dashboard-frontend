import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { colors, RANGE_LABEL } from "../theme";

/*
 * Sparkline — compact 28px-tall trend line + delta badge, designed to fit
 * at the bottom of an entity card.
 *
 * Renders three states:
 *   1. Nothing yet (`trend` is null): "Loading 30D trend…"
 *   2. Insufficient history (<2 buckets): "Building trend data… (N day/s so far)"
 *   3. Full sparkline + "+N today" / "+N this week" / "+N this month" badge
 *
 * The badge color reflects sign: green for positive, red for negative,
 * dim for zero. Negative values get clamped to "—" rather than rendering
 * a minus sign that could confuse non-technical users.
 *
 * Props:
 *   trend       — the /api/trends/:id response object
 *   range       — "daily" | "weekly" | "monthly" (controls labels)
 *   metricKey   — which series key to plot (must exist in adapter.trendMetrics)
 *   metricLabel — display text for the metric (e.g., "OPENS", "STARS")
 */
export const Sparkline = ({ trend, range, metricKey = "opened", metricLabel = "OPENS" }) => {
  const labels = RANGE_LABEL[range] || RANGE_LABEL.daily;
  const wrap = (children) => (
    <div style={{
      marginTop: "0.6rem",
      paddingTop: "0.6rem",
      borderTop: `1px solid ${colors.panelBorder}`
    }}>
      {children}
    </div>
  );

  if (!trend) {
    return wrap(
      <div style={{ color: colors.textDim, fontSize: "0.65rem", fontStyle: "italic" }}>
        Loading {labels.axis} trend…
      </div>
    );
  }

  if (trend.error || !trend.series || (trend.data_points || 0) < 2) {
    const dp = trend.data_points || 0;
    return wrap(
      <div style={{ color: colors.textDim, fontSize: "0.65rem", fontStyle: "italic" }}>
        Building trend data… ({dp} {labels.bucket}{dp === 1 ? "" : "s"} so far)
      </div>
    );
  }

  const data = trend.series[metricKey] || [];
  const delta = trend.deltas?.[metricKey]?.change ?? 0;
  const deltaColor = delta > 0 ? colors.green : delta < 0 ? colors.red : colors.textDim;
  const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—";

  return wrap(
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <div style={{
        color: colors.textDim,
        fontSize: "0.6rem",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap"
      }}>
        {metricLabel} · {labels.axis}
      </div>
      <div style={{ flex: 1, minWidth: 60, height: 28 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={colors.blue}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: colors.panel,
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 6,
                fontSize: "0.7rem",
                padding: "0.3rem 0.5rem"
              }}
              labelStyle={{ color: colors.textDim }}
              itemStyle={{ color: colors.blue }}
              formatter={(v) => [v, metricLabel.toLowerCase()]}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        color: deltaColor,
        minWidth: 56,
        textAlign: "right"
      }}>
        {deltaStr} {labels.deltaSuffix}
      </div>
    </div>
  );
};
