import { colors } from "../theme";

/*
 * StatCard — a labeled value tile, used in the totals row at the top of
 * the dashboard. The `accent` prop colors the value text (e.g., blue for
 * opens, green for replies). Pass undefined for default text color.
 */
export const StatCard = ({ label, value, accent }) => (
  <div style={{
    background: colors.panel,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 10,
    padding: "1rem 1.25rem"
  }}>
    <div style={{
      color: colors.textDim,
      fontSize: "0.7rem",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "0.4rem"
    }}>
      {label}
    </div>
    <div style={{
      color: accent || colors.text,
      fontSize: "1.75rem",
      fontWeight: 600,
      lineHeight: 1
    }}>
      {value}
    </div>
  </div>
);
