// One row per modulation target: on/off, its range bar, and target-specific options.
// A target that's off collapses to just its base value (dimmed).

import type { ReactNode } from "react";
import { useParam } from "../params/store";
import { PATTERN_NAMES, RATE_NAMES } from "../params/spec";
import { CellRange, TrackRange } from "./RangeBar";
import { Knob, Segmented, Select, Stepper, Toggle } from "./controls";
import { NoteIcon, PatternIcon } from "./icons";

function TargetRow({ label, activeParam, children, extras }: { label: string; activeParam?: string; children: ReactNode; extras?: ReactNode }) {
  return (
    <div className="target-row">
      <div className="target-name">
        {activeParam && <Toggle param={activeParam} title={`Modulate ${label}`} />}
        <span>{label}</span>
      </div>
      <div className="target-control">{children}</div>
      <div className="target-extras">{extras}</div>
    </div>
  );
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
    content: <NoteIcon power={p} family={family} />,
    title: rateInfo[rateIndexOf(family, p)].name,
  }));
  const setFamily = (f: Family) => base.set(rateIndexOf(f, power));

  return (
    <TargetRow
      label="Rate"
      activeParam="rateActive"
      extras={
        <>
          <div className="segmented small" title="Rate family">
            {(["straight", "dotted", "triplet"] as Family[]).map((f) => (
              <button key={f} className={family === f ? "selected" : ""} onClick={() => setFamily(f)} title={f}>
                <NoteIcon power={3} family={f} size={15} />
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
    : [1, 2, 3, 4].map((o) => ({ content: `${o}`, title: `${o} octave(s)` }));
  const baseCell = transpose ? 3 : base.value - 1;

  return (
    <TargetRow
      label="Octave"
      activeParam="octaveActive"
      extras={
        <>
          {transpose && <Stepper param="baseOctave" label="span" />}
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
  return (
    <TargetRow label="Pattern" activeParam="patternActive">
      <CellRange
        cells={PATTERN_NAMES.map((name, i) => ({ content: <PatternIcon pattern={i} />, title: name }))}
        base={base.value}
        down={down.value}
        up={up.value}
        active={active.value !== 0}
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
  return (
    <TargetRow label={label} activeParam={`${id}Active`} extras={active.value ? <Stepper param={`${id}Steps`} label="steps ±" /> : null}>
      <TrackRange
        min={base.spec.min}
        max={base.spec.max}
        base={base.value}
        down={down.value}
        up={up.value}
        maxSpreadDown={down.spec.max}
        maxSpreadUp={up.spec.max}
        steps={useParam(`${id}Steps`).value}
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
        <Knob param="humanizeVelocity" label="Velocity ±" size={40} format={(v) => `±${v}`} />
        <Knob param="humanizeGate" label="Gate ±" size={40} format={(v) => `±${v}%`} />
      </div>
    </TargetRow>
  );
}

export { Segmented };
