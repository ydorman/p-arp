import type { ReactNode } from "react";
import { Knob, Segmented, Select, Toggle } from "./components/controls";
import { PatternIcon } from "./components/icons";
import { PATTERN_NAMES } from "./params/spec";
import { GateRow, HumanizeRow, OctaveRow, PatternRow, RateRow, SwingRow, VelocityRow } from "./components/Targets";
import { useEngineStatus } from "./hooks/useEngineStatus";
import { useParam } from "./params/store";

const SHAPES = [
  { label: "↗", title: "Up: rise through the range, then jump back" },
  { label: "↘", title: "Down: fall through the range, then jump back" },
  { label: "⋀", title: "Up-Down: start at the base, bounce between the ends" },
];

// Curve preview: the curve's steps on the 1..8 scale as small bars (Random has no fixed shape)
const CURVES: Record<number, number[]> = {
  0: [1, 2, 3, 4, 5, 6, 7, 8],
  1: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1 + 7 * (i / 7) ** 2),
  2: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1 + 7 * (1 - (1 - i / 7) ** 2)),
  3: [1, 2, 3, 5, 8],
  4: [2, 3, 5, 7],
};

const CUSTOM_STEP_IDS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `customStep${i}`);

function CurveControl() {
  const curve = useParam("curve");
  const length = useParam("customLength").value;
  const custom = CUSTOM_STEP_IDS.map((id) => useParam(id).value).slice(0, length); // fixed hook count
  const steps = curve.value === 6 ? custom : CURVES[curve.value];
  return (
    <div className="curve-control">
      <Select param="curve" title="The path the progressions take through their ranges" />
      <div className="curve-preview" title={curve.value === 6 ? "Custom curve (editor coming)" : "Curve shape"}>
        {steps ? steps.map((s, i) => <span key={i} style={{ height: `${(s / 8) * 100}%` }} />) : <em>?</em>}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="labeled">
      <span className="labeled-label">{label}</span>
      {children}
    </div>
  );
}

function LiveView() {
  const status = useEngineStatus();
  return (
    <div className="live-view">
      <div className="live-placeholder">
        <span>Live view</span>
        <em>progression paths and played notes will draw here</em>
      </div>
      <div className="live-status">
        <span>{status.playing ? "▶ playing" : "■ stopped"}</span>
        <span>{status.bpm > 0 ? `${status.bpm.toFixed(1)} bpm` : "– bpm"}</span>
        <span>beat {(status.ppq + 1).toFixed(2)}</span>
        <span>
          notes {status.noteOnsIn} in / {status.noteOnsOut} out
        </span>
      </div>
    </div>
  );
}

export function App() {
  return (
    <div className="app">
      <header className="header">
        <span className="logo">p-arp</span>
        <span className="tag">progressive arpeggiator</span>
      </header>

      <section className="panel performance">
        <div className="performance-controls">
          <Toggle param="latch" label="Latch" title="Keep playing the chord after the keys are released" />
          <Labeled label="Pattern">
            <Segmented param="pattern" options={PATTERN_NAMES.map((name, i) => ({ label: <PatternIcon pattern={i} size={15} />, title: name }))} title="Base arp pattern" />
          </Labeled>
          <Labeled label="Shape">
            <Segmented param="shape" options={SHAPES} title="How the progressions move through their ranges" />
          </Labeled>
          <Labeled label="Advance">
            <Select param="advanceTrigger" title="When the progressions take a step" />
          </Labeled>
          <Labeled label="Sync">
            <Select param="link" labels={["Free", "Locked", "Restart"]} title="Free: each progression on its own. Locked: all reach min/base/max together. Restart: all restart with the longest." />
          </Labeled>
          <Labeled label="Curve">
            <CurveControl />
          </Labeled>
        </div>
        <div className="performance-main">
          <LiveView />
          <div className="depth" title="How far every progression travels: scales all ranges at once (0% = everything at its base)">
            <Knob param="globalRange" label="Depth" size={64} format={(v) => `${v}%`} />
          </div>
        </div>
      </section>

      <main className="targets">
        <section className="panel">
          <h2>Sequence</h2>
          <RateRow />
          <OctaveRow />
          <PatternRow />
        </section>
        <section className="panel">
          <h2>Feel</h2>
          <GateRow />
          <VelocityRow />
          <SwingRow />
          <HumanizeRow />
        </section>
      </main>
    </div>
  );
}
