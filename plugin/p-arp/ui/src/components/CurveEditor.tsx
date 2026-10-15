// Series Curve control: the curve menu, a small preview of its steps, and a step editor that pops
// up from the preview. Steps are on a 1..8 scale; each series plays the shape stretched over its
// range (lowest step = its min, highest = its max).
//
// The editor edits the Custom curve. Opened on a preset curve it shows that preset's steps; the
// first edit copies them into the custom steps and switches the curve to Custom, so a preset is a
// starting point.

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Select } from "./controls";
import { useParam } from "../params/store";

const CUSTOM = 6;
const RANDOM = 5;
const MAX_STEPS = 8;
const LEVELS = 8;

// Preset steps, as the engine's curveSteps() (Random picks among all 8 levels)
const PRESETS: Record<number, number[]> = {
  0: [1, 2, 3, 4, 5, 6, 7, 8],
  1: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1 + 7 * (i / 7) ** 2),
  2: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1 + 7 * (1 - (1 - i / 7) ** 2)),
  3: [1, 2, 3, 5, 8],
  4: [2, 3, 5, 7],
  5: [1, 2, 3, 4, 5, 6, 7, 8],
};

const STEP_IDS = Array.from({ length: MAX_STEPS }, (_, i) => `customStep${i + 1}`);

function useCurve() {
  const curve = useParam("curve");
  const length = useParam("customLength");
  const steps = STEP_IDS.map((id) => useParam(id)); // fixed hook count
  const isCustom = curve.value === CUSTOM;
  const values = isCustom ? steps.slice(0, length.value).map((p) => p.value) : PRESETS[curve.value] ?? [];
  return { curve, length, steps, isCustom, values };
}

export function CurveControl() {
  const { curve, values } = useCurve();
  const [open, setOpen] = useState(false);
  const previous = useRef(curve.value);

  // Choosing Custom from the menu opens the editor
  useEffect(() => {
    if (curve.value === CUSTOM && previous.current !== CUSTOM) setOpen(true);
    previous.current = curve.value;
  }, [curve.value]);

  return (
    <div className="curve-control">
      <Select param="curve" title="The path the progressions take through their ranges" />
      <button
        className={`curve-preview ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
        title={curve.value === RANDOM ? "Random: any step, in random order (click to draw your own)" : "Click to edit the steps"}
      >
        {values.map((v, i) => (
          <span key={i} style={{ height: `${(v / LEVELS) * 100}%` }} className={curve.value === RANDOM ? "random" : ""} />
        ))}
      </button>
      {open && <CurveEditor onClose={() => setOpen(false)} />}
    </div>
  );
}

function CurveEditor({ onClose }: { onClose: () => void }) {
  const { curve, length, steps, isCustom, values } = useCurve();
  const panel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // Plugin parameter values arrive asynchronously, so a drag keeps its own copy of the length
  const drag = useRef<{ touched: Set<number>; length: number } | null>(null);

  // Close on Escape or a click outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!panel.current?.contains(target) && !target.closest(".curve-preview")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  // Editing a preset: copy its steps into the custom curve and switch to Custom first
  const makeCustom = () => {
    if (isCustom) return;
    const preset = values.map((v) => Math.min(LEVELS, Math.max(1, Math.round(v))));
    length.set(preset.length);
    preset.forEach((v, i) => steps[i].set(v));
    curve.set(CUSTOM);
  };

  const cellAt = (e: ReactPointerEvent) => {
    const rect = grid.current!.getBoundingClientRect();
    const column = Math.floor(((e.clientX - rect.left) / rect.width) * MAX_STEPS);
    const level = LEVELS - Math.floor(((e.clientY - rect.top) / rect.height) * LEVELS);
    return { column: Math.min(MAX_STEPS - 1, Math.max(0, column)), level: Math.min(LEVELS, Math.max(1, level)) };
  };

  // Click or drag across the columns to draw; a column past the end extends the curve to it
  const paint = (e: ReactPointerEvent) => {
    const d = drag.current!;
    const { column, level } = cellAt(e);
    if (!d.touched.has(column)) {
      d.touched.add(column);
      steps[column].begin();
    }
    steps[column].set(level);
    if (column + 1 > d.length) {
      d.length = column + 1;
      length.set(d.length);
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { touched: new Set(), length: isCustom ? length.value : values.length };
    makeCustom();
    paint(e);
  };
  const onPointerMove = (e: ReactPointerEvent) => drag.current && paint(e);
  const onPointerUp = () => {
    drag.current?.touched.forEach((column) => steps[column].end());
    drag.current = null;
  };

  const shownLength = isCustom ? length.value : values.length;
  const setLength = (n: number) => {
    makeCustom();
    length.set(Math.min(MAX_STEPS, Math.max(1, n)));
  };

  return (
    <div className="curve-editor" ref={panel}>
      <div className="curve-editor-head">
        <span className="curve-editor-title">{isCustom ? "Custom curve" : "Draw to make a custom curve"}</span>
        <div className="stepper" title="Number of steps">
          <span className="stepper-label">steps</span>
          <button onClick={() => setLength(shownLength - 1)} disabled={shownLength <= 1}>
            −
          </button>
          <span className="stepper-value">{shownLength}</span>
          <button onClick={() => setLength(shownLength + 1)} disabled={shownLength >= MAX_STEPS}>
            +
          </button>
        </div>
      </div>
      <div className="curve-editor-body">
        <div className="curve-editor-scale">
          <span>max</span>
          <span>min</span>
        </div>
        <div
          className="curve-editor-grid"
          ref={grid}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {Array.from({ length: MAX_STEPS }, (_, column) => {
            const inCurve = column < shownLength;
            const value = inCurve ? (isCustom ? steps[column].value : values[column]) : steps[column].value;
            return (
              <div key={column} className={`curve-column ${inCurve ? "" : "unused"}`}>
                <div className="curve-bar" style={{ height: `${(value / LEVELS) * 100}%` }}>
                  <span>{Number.isInteger(value) ? value : value.toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="curve-editor-foot">
        Every active progression follows this shape across its range: the lowest step plays its min, the highest its max. Draw past the end to add steps.
      </div>
    </div>
  );
}
