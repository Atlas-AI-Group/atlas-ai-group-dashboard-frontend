/*
 * AtlasMark — the inline brand SVG that appears in the dashboard header.
 *
 * Two stroked circles with a connecting line and a small arrow → echoes
 * "from insight to innovation" / data-pipeline imagery. Default uses the
 * blue accent color. Size and color are props so per-client variants
 * (e.g., a different brand color) can be made without touching the SVG
 * shape itself.
 */

export const AtlasMark = ({ width = 60, height = 32, color = "#3b82f6" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 60 32"
    style={{ flexShrink: 0, display: "block" }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="16" r="7" fill="none" stroke={color} strokeWidth="1.5" />
    <circle cx="10" cy="16" r="2.5" fill={color} />
    <line x1="17" y1="16" x2="43" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="50" cy="16" r="7" fill="none" stroke={color} strokeWidth="1.5" />
    <circle cx="50" cy="16" r="2.5" fill={color} />
    <polyline points="55,12 59,16 55,20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
