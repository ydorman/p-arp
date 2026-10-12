// Small bound controls: Toggle, Select, Segmented, Stepper, Knob. Each takes a parameter id.

import { useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
import { useParam } from "../params/store";
import { EditableValue } from "./EditableValue";

export function Toggle({ param, label, title }: { param: string; label?: string; title?: string }) {
  const p = useParam(param);
  return (
    <button
      className={`toggle ${p.value ? "on" : ""}`}
      role="switch"
      aria-checked={p.value !== 0}
      title={title}
      onClick={() => p.set(p.value ? 0 : 1)}
    >
      <span className="toggle-dot" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  );
}

export function Select({ param, labels, title }: { param: string; labels?: string[]; title?: string }) {
  const p = useParam(param);
  const options = labels ?? p.spec.choices ?? [];
  return (
    <select className="select" value={p.value} title={title} onChange={(e) => p.set(Number(e.target.value))}>
      {options.map((label, i) => (
        <option key={i} value={i}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Segmented({ param, options, title }: { param: string; options: { label: ReactNode; title: string }[]; title?: string }) {
  const p = useParam(param);
  return (
    <div className="segmented" role="radiogroup" title={title}>
      {options.map((o, i) => (
        <button key={i} className={p.value === i ? "selected" : ""} title={o.title} role="radio" aria-checked={p.value === i} onClick={() => p.set(i)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ param, label, format = String }: { param: string; label?: string; format?: (v: number) => string }) {
  const p = useParam(param);
  return (
    <div className="stepper" title={p.spec.name}>
      {label && <span className="stepper-label">{label}</span>}
      <button onClick={() => p.set(p.value - 1)} disabled={p.value <= p.spec.min}>
        −
      </button>
      <span className="stepper-value">{format(p.value)}</span>
      <button onClick={() => p.set(p.value + 1)} disabled={p.value >= p.spec.max}>
        +
      </button>
    </div>
  );
}

const START_ANGLE = -135; // degrees, 0 = up
const SWEEP = 270;
const RADIUS = 38;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

/** Rotary knob. Vertical drag; Shift for fine adjustment; double-click resets to default. */
export function Knob({ param, label, size = 64, format }: { param: string; label: string; size?: number; format?: (v: number) => string }) {
  const p = useParam(param);
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  const range = p.spec.max - p.spec.min;
  const normalised = (p.value - p.spec.min) / range;
  const angle = START_ANGLE + SWEEP * normalised;
  const [sx, sy] = polar(START_ANGLE, RADIUS);
  const [ex, ey] = polar(angle, RADIUS);
  const [px, py] = polar(angle, RADIUS - 10);
  const largeArc = angle - START_ANGLE > 180 ? 1 : 0;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startValue: normalised };
    p.begin();
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const pixels = e.shiftKey ? 800 : 160;
    const n = Math.min(1, Math.max(0, drag.current.startValue + (drag.current.startY - e.clientY) / pixels));
    p.set(p.spec.min + n * range);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    p.end();
  };

  return (
    <div className="knob" style={{ width: size + 24 }}>
      <svg
        viewBox="0 0 100 100"
        style={{ width: size, height: size }}
        role="slider"
        aria-label={label}
        aria-valuenow={p.value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => p.set(p.spec.defaultValue)}
      >
        <circle className="knob-track" cx="50" cy="50" r={RADIUS} />
        {normalised > 0.001 && <path className="knob-arc" d={`M ${sx} ${sy} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${ex} ${ey}`} />}
        <line className="knob-pointer" x1="50" y1="50" x2={px} y2={py} />
      </svg>
      <div className="knob-label">{label}</div>
      <EditableValue
        className="knob-value"
        value={p.value}
        format={format ?? ((v) => `${v}${p.spec.unit ?? ""}`)}
        onCommit={(v) => {
          p.begin();
          p.set(v);
          p.end();
        }}
      />
    </div>
  );
}
