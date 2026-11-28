// One row per modulation target: on/off, its range bar, and target-specific options.
// A target whose progression is off collapses to just its base value, which is still in use and
// stays fully editable (exception: velocity, which then follows the played notes).

import type { ReactNode } from "react";
import { useParam } from "../params/store";
import { PATTERN_NAMES, RATE_NAMES } from "../params/spec";
import { CellRange, TrackRange } from "./RangeBar";
import { Knob, OnOff, Segmented, Select, Stepper } from "./controls";
import { NoteIcon, PatternIcon } from "./icons";
import { useCurveEditorOpen } from "./CurveEditor";
import { describePass, useProgressionInfo } from "../hooks/useProgressionInfo";
import type { SeriesName } from "../hooks/useProgressionInfo";

function TargetRow(props: { label: string; activeParam?: string; children: ReactNode; extras?: ReactNode; wide?: boolean; summary?: string | null }) {
  const { label, activeParam, children, extras, wide, summary } = props;
  return (
    <div className={`target-row ${wide ? "wide" : ""}`}>
      <div className="target-name">
        {activeParam ? <OnOff param={activeParam} label={label} title={`${label} progression on/off`} /> : <span className="target-label">{label}</span>}
        {summary && (
          <span className="target-summary" title="Values in the range, and how long the progression takes to go through them once">
            {summary}
          </span>
        )}
      </div>
      <div className="target-control">{children}</div>
      <div className="target-extras">{extras}</div>
    </div>
  );
}

// What the progression does (from the engine): the row's "7 values · 7 bars" summary, and while the
// curve editor is open, the steps of the curve (position and value per step)
function useSeries(series: SeriesName) {
  const info = useProgressionInfo(series);
  const trigger = useParam("advanceTrigger").value;
  const curveOn = useParam("curve").value !== 0;
  const editorOpen = useCurveEditorOpen();
  const active = info?.active ?? false;
  return {
    summary: active ? describePass(info!, trigger) : null,
    curve: active && curveOn && editorOpen ? info! : null,
  };
}

/** Curve step numbers (1-based) per cell, for cell = cellOf(position) */
function cellSteps(curvePos: number[] | undefined, cells: number, cellOf: (pos: number) => number): number[][] | undefined {
  if (!curvePos) return undefined;
  const marks: number[][] = Array.from({ length: cells }, () => []);
  curvePos.forEach((pos, i) => marks[cellOf(pos)]?.push(i + 1));
  return marks;
}

const gesture = (...params: { begin: () => void; end: () => void }[]) => (started: boolean) =>
  params.forEach((p) => (started ? p.begin() : p.end()));

// ---------------------------------------------------------------------------------------------
// Sequence: Rate, Octave, Pattern
// ---------------------------------------------------------------------------------------------

type Family = "straight" | "dotted" | "triplet";
const rateInfo = RATE_NAMES.map((name) => ({
  name,
  family: (name.endsWith(" dotted") ? "dotted" : name.endsWith(" triplet") ? "triplet" : "straight") as Family,
  power: Math.log2(Number(name.split(" ")[0].split("/")[1])),
}));
const rateIndexOf = (family: Family, power: number) => rateInfo.findIndex((r) => r.family === family && r.power === power);

export function RateRow() {
  const base = useParam("baseRate");
  const active = useParam("rateActive");
  const down = useParam("rateSpreadDown");
  const up = useParam("rateSpreadUp");
  const { family, power } = rateInfo[base.value];
  const cells = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => ({
    content: <NoteIcon power={p} family={family} size={26} />,
    title: rateInfo[rateIndexOf(family, p)].name,
  }));
  const setFamily = (f: Family) => base.set(rateIndexOf(f, power));
  const { summary, curve } = useSeries("rate");

  return (
    <TargetRow
      label="Rate"
      activeParam="rateActive"
      summary={summary}
      extras={
        <>
          <div className="segmented small" title="Rate family">
            {(["straight", "dotted", "triplet"] as Family[]).map((f) => (
              <button key={f} className={family === f ? "selected" : ""} onClick={() => setFamily(f)} title={f}>
                <NoteIcon power={3} family={f} size={17} />
              </button>
            ))}
          </div>
          <Select param="timing" labels={["Snap", "Flow", "Free"]} title="When the rate changes: snap each note to its grid, flow without gaps (realign each pass), or never snap" />
        </>
      }
    >
      <CellRange
        cells={cells}
        base={power}
        down={down.value}
        up={up.value}
        active={active.value !== 0}
        steps={cellSteps(curve?.curvePos, cells.length, (pos) => pos)}
        onBase={(p) => base.set(rateIndexOf(family, p))}
        onDown={down.set}
        onUp={up.set}
        onGesture={gesture(down, up)}
      />
    </TargetRow>
  );
}

export function OctaveRow() {
  const base = useParam("baseOctave");
  const active = useParam("octaveActive");
  const down = useParam("octaveSpreadDown");
  const up = useParam("octaveSpreadUp");
  const mode = useParam("octaveMode");
  const transpose = mode.value === 1;

  // Range: cells are the octave span 1..4. Transpose: cells are shifts -3..+3 around the span.
  const cells = transpose
    ? [-3, -2, -1, 0, 1, 2, 3].map((o) => ({ content: o === 0 ? "0" : o > 0 ? `+${o}` : `${o}`, title: `shift ${o} octave(s)` }))
    : [1, 2, 3, 4].map((o) => ({ content: `${o}`, title: `the pattern spans ${o} octave(s)` }));
  const baseCell = transpose ? 3 : base.value - 1;
  const { summary, curve } = useSeries("octave");

  return (
    <TargetRow
      label="Octave"
      activeParam="octaveActive"
      summary={summary}
      extras={
        <>
          {transpose && <Stepper param="baseOctave" label="octaves" />}
          <Select param="octaveMode" labels={["Range", "Transpose"]} title="Range: each step adds an octave to the cycle. Transpose: shifts the whole cycle." />
        </>
      }
    >
      <CellRange
        cells={cells}
        base={baseCell}
        down={down.value}
        up={up.value}
        active={active.value !== 0}
        steps={cellSteps(curve?.curvePos, cells.length, (pos) => (transpose ? pos - base.value + 3 : pos - 1))}
        onBase={(i) => (transpose ? undefined : base.set(i + 1))}
        onDown={down.set}
        onUp={up.set}
        onGesture={gesture(down, up)}
      />
    </TargetRow>
  );
}

export function PatternRow() {
  const base = useParam("pattern");
  const active = useParam("patternActive");
  const down = useParam("patternSpreadDown");
  const up = useParam("patternSpreadUp");
  const { summary, curve } = useSeries("pattern");
  return (
    <TargetRow label="Pattern" activeParam="patternActive" wide summary={summary}>
      <CellRange
        cells={PATTERN_NAMES.map((name, i) => ({ content: <PatternIcon pattern={i} size={20} />, title: name }))}
        base={base.value}
        down={down.value}
        up={up.value}
        active={active.value !== 0}
        steps={cellSteps(curve?.curvePos, PATTERN_NAMES.length, (pos) => pos)}
        onBase={base.set}
        onDown={down.set}
        onUp={up.set}
        onGesture={gesture(down, up)}
      />
    </TargetRow>
  );
}

// ---------------------------------------------------------------------------------------------
// Feel: Gate, Velocity, Swing, Humanize
// ---------------------------------------------------------------------------------------------

function ScaledRow({ label, id, format }: { label: string; id: "gate" | "velocity" | "swing"; format: (v: number) => string }) {
  const base = useParam(id);
  const active = useParam(`${id}Active`);
  const down = useParam(`${id}SpreadDown`);
  const up = useParam(`${id}SpreadUp`);
  const steps = useParam(`${id}Steps`).value;
  const { summary, curve } = useSeries(id);
  if (id === "velocity" && !active.value) {
    // Velocity progression off: notes keep the velocity they were played with
    return (
      <TargetRow label={label} activeParam={`${id}Active`} wide>
        <div className="as-played" title="Notes keep the velocity they were played with. Turn on to set a base velocity and a progression.">
          <strong>as played</strong> · each note keeps its velocity
        </div>
      </TargetRow>
    );
  }
  return (
    <TargetRow label={label} activeParam={`${id}Active`} summary={summary} extras={active.value ? <Stepper param={`${id}Steps`} label="steps ±" /> : null}>
      <TrackRange
        min={base.spec.min}
        max={base.spec.max}
        base={base.value}
        down={down.value}
        up={up.value}
        maxSpreadDown={down.spec.max}
        maxSpreadUp={up.spec.max}
        steps={steps}
        curveValues={curve?.curveValue}
        active={active.value !== 0}
        format={format}
        onBase={base.set}
        onDown={down.set}
        onUp={up.set}
        onGesture={gesture(base, down, up)}
      />
    </TargetRow>
  );
}

export const GateRow = () => <ScaledRow label="Gate" id="gate" format={(v) => `${v}%`} />;
export const VelocityRow = () => <ScaledRow label="Velocity" id="velocity" format={String} />;
export const SwingRow = () => <ScaledRow label="Swing" id="swing" format={(v) => `${v}%`} />;

export function HumanizeRow() {
  return (
    <TargetRow label="Humanize">
      <div className="humanize">
        <Knob param="humanizeVelocity" label="Velocity ±" size={52} format={(v) => `±${v}`} />
        <Knob param="humanizeGate" label="Gate ±" size={52} format={(v) => `±${v}%`} />
      </div>
    </TargetRow>
  );
}

export { Segmented };
