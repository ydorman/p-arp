import type { ReactNode } from "react";
import { Knob, Segmented, Select, Toggle } from "./components/controls";
import { PatternIcon } from "./components/icons";
import { PATTERN_NAMES } from "./params/spec";
import { GateRow, HumanizeRow, OctaveRow, PatternRow, RateRow, SwingRow, VelocityRow } from "./components/Targets";
import { useEngineStatus } from "./hooks/useEngineStatus";
import { CurveControl } from "./components/CurveEditor";
import { LiveView } from "./components/LiveView";
import { nativeFunction } from "./native";

const SHAPES = [
  { label: "↗", title: "Up: rise through the range, then jump back" },
  { label: "↘", title: "Down: fall through the range, then jump back" },
  { label: "⋀", title: "Up-Down: start at the base, bounce between the ends" },
];

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="labeled">
      <span className="labeled-label">{label}</span>
      {children}
    </div>
  );
}

const setDebugLog = nativeFunction("setDebugLog");
const revealDebugLog = nativeFunction("revealDebugLog");

// Debug log switch (plugin state, not a host parameter): writes a replayable [SARP] log to
// ~/Library/Logs/p-arp. Turn it on before starting the transport (the log needs the START line).
function DebugLogSwitch() {
  const status = useEngineStatus();
  if (!setDebugLog) return null;
  const file = status.debugLogFile.split("/").pop();
  return (
    <div className="debug-log">
      <button
        className={`toggle ${status.debugLog ? "on" : ""}`}
        role="switch"
        aria-checked={status.debugLog}
        onClick={() => setDebugLog(!status.debugLog)}
        title="Write a debug log (turn on before starting the transport; replay with tests/replay.js)"
      >
        <span className="toggle-dot" />
        <span className="toggle-label">Debug log</span>
      </button>
      <button className="debug-log-file" onClick={() => revealDebugLog?.()} title="Show in Finder">
        {file || "~/Library/Logs/p-arp"}
      </button>
    </div>
  );
}

export function App() {
  return (
    <div className="app">
      <header className="header">
        <span className="logo">p-arp</span>
        <span className="tag">progressive arpeggiator</span>
        <DebugLogSwitch />
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
