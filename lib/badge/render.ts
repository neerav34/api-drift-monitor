const CHAR_WIDTH = 6.5;
const PADDING = 10;
const HEIGHT = 20;

export const BADGE_COLORS = {
  green: "#4c1",
  red: "#e05d44",
  gray: "#9f9f9f",
} as const;

/** A small shields.io-style flat badge, built by hand -- no dependency needed. */
export function renderBadgeSvg(label: string, message: string, color: string): string {
  const labelWidth = Math.round(label.length * CHAR_WIDTH) + PADDING;
  const messageWidth = Math.round(message.length * CHAR_WIDTH) + PADDING;
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${label}: ${message}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="m"><rect width="${totalWidth}" height="${HEIGHT}" rx="3" fill="#fff"/></mask>
  <g mask="url(#m)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${color}"/>
    <rect width="${totalWidth}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
