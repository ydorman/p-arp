// Small inline icons: note values (for rates) and arp pattern diagrams. Drawn as SVG so they don't
// depend on a music font being installed, and use currentColor to follow the theme.

export type RateFamily = "straight" | "dotted" | "triplet";

/** A note value 1/2^power (0 = whole ... 7 = 1/128), optionally dotted or a triplet. */
export function NoteIcon({ power, family = "straight", size = 18 }: { power: number; family?: RateFamily; size?: number }) {
  const hollow = power <= 1; // whole and half notes
  const stem = power >= 1;
  const flags = Math.max(0, power - 2); // eighth = 1 flag ... 1/128 = 5
  const headX = 8;
  const headY = 22;
  const stemX = headX + 4;
  const stemTop = 3;
  return (
    <svg viewBox="0 0 22 28" width={size * (22 / 28)} height={size} className="note-icon" aria-hidden>
      <ellipse
        cx={headX}
        cy={headY}
        rx={4.4}
        ry={3.1}
        transform={`rotate(-22 ${headX} ${headY})`}
        fill={hollow ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 1.6 : 0}
      />
      {stem && <line x1={stemX} y1={headY - 1} x2={stemX} y2={stemTop} stroke="currentColor" strokeWidth={1.4} />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M ${stemX} ${stemTop + i * 3.2} q 5 2.5 4 7`} fill="none" stroke="currentColor" strokeWidth={1.4} />
      ))}
      {family === "dotted" && <circle cx={headX + 7.5} cy={headY + 1} r={1.5} fill="currentColor" />}
      {family === "triplet" && (
        <text x={1} y={9} fontSize={9} fontWeight={700} fill="currentColor">
          3
        </text>
      )}
    </svg>
  );
}

// Pattern diagrams: note steps as dots (low = bottom), joined in playing order
const PATTERN_POINTS: number[][] = [
  [0, 1, 2, 3, 4], // Up
  [4, 3, 2, 1, 0], // Down
  [0, 2, 4, 2, 0], // Up/Down
  [4, 2, 0, 2, 4], // Down/Up
  [2, 0, 3, 1, 4], // As Played (the order the keys were pressed)
  [3, 0, 4, 1, 2], // Random
];

export function PatternIcon({ pattern, size = 18 }: { pattern: number; size?: number }) {
  const points = PATTERN_POINTS[pattern] ?? [];
  const xy = points.map((level, i) => [3 + i * 6, 15 - level * 3] as const);
  const random = pattern === 5;
  return (
    <svg viewBox="0 0 30 18" width={size * (30 / 18)} height={size} className="pattern-icon" aria-hidden>
      {!random && <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.6} />}
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.9} fill="currentColor" />
      ))}
      {pattern === 4 && <text x={0} y={5} fontSize={5.5} fill="currentColor">1</text>}
      {random && <text x={24} y={6} fontSize={6.5} fontWeight={700} fill="currentColor">?</text>}
    </svg>
  );
}
