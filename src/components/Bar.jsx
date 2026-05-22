/*
 * Bar — a thin horizontal progress bar used inside entity cards.
 *
 * The width is computed as min(value/max * 100, 100) — values that exceed
 * the max get clamped at 100% rather than overflowing visually. The 0.3s
 * width transition gives a subtle animation when data refreshes.
 */
export const Bar = ({ value, max, color }) => (
  <div style={{
    background: "#1f2937",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4
  }}>
    <div style={{
      background: color,
      height: "100%",
      width: `${Math.min((value / Math.max(max, 1)) * 100, 100)}%`,
      transition: "width 0.3s"
    }} />
  </div>
);
