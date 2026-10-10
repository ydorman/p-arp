import { useRef } from "react";
import type { PointerEvent } from "react";
import { useSliderParam } from "../hooks/useSliderParam";

const START_ANGLE = -135; // degrees, 0 = up
const SWEEP = 270;
const RADIUS = 38;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

interface KnobProps {
  /** Parameter ID (and WebSliderRelay name) */
  param: string;
  label: string;
  format?: (value: number) => string;
}

/** Rotary knob bound to a plugin parameter. Vertical drag; Shift for fine adjustment. */
export function Knob({ param, label, format = (v) => v.toFixed(0) }: KnobProps) {
  const slider = useSliderParam(param);
  const drag = useRef<{ startY: number; startValue: number } | null>(null);

  const angle = START_ANGLE + SWEEP * slider.normalised;
  const [sx, sy] = polar(START_ANGLE, RADIUS);
  const [ex, ey] = polar(angle, RADIUS);
  const [px, py] = polar(angle, RADIUS - 8);
  const largeArc = angle - START_ANGLE > 180 ? 1 : 0;

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startValue: slider.normalised };
    slider.beginGesture();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const pixelsForFullRange = event.shiftKey ? 1000 : 200;
    slider.setNormalised(drag.current.startValue + (drag.current.startY - event.clientY) / pixelsForFullRange);
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    slider.endGesture();
  };

  return (
    <div className="knob">
      <svg
        viewBox="0 0 100 100"
        role="slider"
        aria-label={label}
        aria-valuenow={slider.value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <circle className="knob-track" cx="50" cy="50" r={RADIUS} />
        {slider.normalised > 0.001 && (
          <path className="knob-arc" d={`M ${sx} ${sy} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${ex} ${ey}`} />
        )}
        <line className="knob-pointer" x1="50" y1="50" x2={px} y2={py} />
      </svg>
      <div className="knob-label">{label}</div>
      <div className="knob-value">
        {format(slider.value)}
        {slider.properties.label}
      </div>
    </div>
  );
}
