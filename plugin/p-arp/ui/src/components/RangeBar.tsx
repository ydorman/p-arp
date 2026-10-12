// Range bars: one control per target showing its possible values, the base (highlighted) and the
// range the progression travels below / above it (two handles). Replaces Scripter's separate
// Base + Spread (-) + Spread (+) controls.
//
// Dragging is handled by the whole bar (a persistent element), not by the handle elements: the
// handles move as the range changes, and a capture held by a moved/re-created element is lost.

import { useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
import { EditableValue } from "./EditableValue";

type Grip = "down" | "up" | "base";

// ---------------------------------------------------------------------------------------------
// Discrete cells (rate, octave, pattern)
// ---------------------------------------------------------------------------------------------

export interface Cell {
  content: ReactNode;
  title: string;
}

interface CellRangeProps {
  cells: Cell[];
  base: number; // cell index
  down: number; // cells below the base
  up: number;   // cells above the base
  active: boolean;
  onBase: (index: number) => void;
  onDown: (cells: number) => void;
  onUp: (cells: number) => void;
  onGesture?: (started: boolean) => void;
}

export function CellRange({ cells, base, down, up, active, onBase, onDown, onUp, onGesture }: CellRangeProps) {
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<Grip | null>(null);
  const n = cells.length;
  const low = Math.max(0, base - down);
  const high = Math.min(n - 1, base + up);

  const cellAt = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * n)));
  };

  const grab = (which: Grip) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    bar.current!.setPointerCapture(e.pointerId);
    dragging.current = which;
    onGesture?.(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const index = cellAt(e.clientX);
    if (dragging.current === "down") onDown(Math.max(0, base - index));
    else if (dragging.current === "up") onUp(Math.max(0, index - base));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    bar.current!.releasePointerCapture(e.pointerId);
    dragging.current = null;
    onGesture?.(false);
  };

  return (
    <div className={`cells ${active ? "" : "off"}`} ref={bar} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="cells-row" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {cells.map((cell, i) => (
          <button
            key={i}
            className={`cell ${i === base ? "base" : ""} ${active && i >= low && i <= high ? "in-range" : ""}`}
            title={cell.title}
            onClick={() => onBase(i)}
          >
            {cell.content}
          </button>
        ))}
      </div>
      {active && (
        <>
          <span
            className={`handle ${low === base ? "collapsed" : ""}`}
            style={{ left: `${(low / n) * 100}%` }}
            onPointerDown={grab("down")}
            title="Drag to set the range below the base"
          />
          <span
            className={`handle ${high === base ? "collapsed" : ""}`}
            style={{ left: `${((high + 1) / n) * 100}%` }}
            onPointerDown={grab("up")}
            title="Drag to set the range above the base"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Continuous track (gate, velocity, swing)
// ---------------------------------------------------------------------------------------------

interface TrackRangeProps {
  min: number;
  max: number;
  base: number;
  down: number; // distance below the base
  up: number;   // distance above the base
  maxSpreadDown: number;
  maxSpreadUp: number;
  steps: number; // per side (tick marks)
  active: boolean;
  format: (v: number) => string;
  onBase: (v: number) => void;
  onDown: (v: number) => void;
  onUp: (v: number) => void;
  onGesture?: (started: boolean) => void;
}

export function TrackRange(props: TrackRangeProps) {
  const { min, max, base, down, up, maxSpreadDown, maxSpreadUp, steps, active, format, onBase, onDown, onUp, onGesture } = props;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<Grip | null>(null);
  const low = Math.max(min, base - down);
  const high = Math.min(max, base + up);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const clampDown = (v: number) => Math.min(maxSpreadDown, Math.max(0, v));
  const clampUp = (v: number) => Math.min(maxSpreadUp, Math.max(0, v));

  const valueAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.round(min + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (max - min));
  };
  const grab = (which: Grip) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    track.current!.setPointerCapture(e.pointerId);
    dragging.current = which;
    onGesture?.(true);
    if (which === "base" && e.currentTarget === track.current) onBase(valueAt(e.clientX)); // click on the track
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const which = dragging.current;
    if (!which) return;
    const v = valueAt(e.clientX);
    if (which === "base") onBase(v);
    else if (which === "down") onDown(clampDown(base - v));
    else onUp(clampUp(v - base));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    track.current!.releasePointerCapture(e.pointerId);
    dragging.current = null;
    onGesture?.(false);
  };

  // Step ticks: positions the progression actually visits
  const ticks: number[] = [];
  if (active) {
    for (let k = 1; k <= steps; k++) {
      if (down > 0) ticks.push(base - (down * k) / steps);
      if (up > 0) ticks.push(base + (up * k) / steps);
    }
  }

  // Typed values go through the same gesture so the host records them as one automation step
  const typed = (apply: (v: number) => void) => (v: number) => {
    onGesture?.(true);
    apply(Math.round(v));
    onGesture?.(false);
  };

  return (
    <div className={`track-range ${active ? "" : "off"}`}>
      <div className="track" ref={track} onPointerDown={grab("base")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {active && <div className="track-fill" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />}
        {ticks.map((t, i) => (
          <div key={i} className="track-tick" style={{ left: `${pct(Math.min(max, Math.max(min, t)))}%` }} />
        ))}
        <div className="track-base" style={{ left: `${pct(base)}%` }} onPointerDown={grab("base")} title={`base ${format(base)}`} />
        {active && (
          <>
            <div
              className={`track-handle down ${low === base ? "collapsed" : ""}`}
              style={{ left: `${pct(low)}%` }}
              onPointerDown={grab("down")}
              title={`lowest ${format(low)}: drag to set the range below the base`}
            />
            <div
              className={`track-handle up ${high === base ? "collapsed" : ""}`}
              style={{ left: `${pct(high)}%` }}
              onPointerDown={grab("up")}
              title={`highest ${format(high)}: drag to set the range above the base`}
            />
          </>
        )}
      </div>
      <div className="track-values">
        {active ? (
          <>
            <EditableValue value={low} format={format} onCommit={typed((v) => onDown(clampDown(base - v)))} title="Lowest value (double-click to type)" />
            <EditableValue className="strong" value={base} format={format} onCommit={typed((v) => onBase(Math.min(max, Math.max(min, v))))} title="Base (double-click to type)" />
            <EditableValue value={high} format={format} onCommit={typed((v) => onUp(clampUp(v - base)))} title="Highest value (double-click to type)" />
          </>
        ) : (
          <EditableValue className="strong" value={base} format={format} onCommit={typed((v) => onBase(Math.min(max, Math.max(min, v))))} title="Base (double-click to type)" />
        )}
      </div>
    </div>
  );
}
