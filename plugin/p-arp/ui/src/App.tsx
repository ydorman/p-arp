import { Knob } from "./components/Knob";
import { useEngineStatus } from "./hooks/useEngineStatus";

export function App() {
  const status = useEngineStatus();

  return (
    <div className="app">
      <header className="header">
        <span className="logo">p-arp</span>
        <span className="tag">progressive arpeggiator · 46 parameters · UI in progress (use Logic's Controls view)</span>
      </header>
      <main className="main">
        <section className="panel">
          <h2>Performance</h2>
          <Knob param="globalRange" label="Global Range" />
        </section>
        <section className="panel status">
          <h2>Engine</h2>
          <dl>
            <dt>Notes in / out</dt>
            <dd>
              {status.noteOnsIn} / {status.noteOnsOut}
            </dd>
            <dt>Transport</dt>
            <dd>{status.playing ? "playing" : "stopped"}</dd>
            <dt>Tempo</dt>
            <dd>{status.bpm > 0 ? status.bpm.toFixed(1) : "–"}</dd>
            <dt>Position (beats)</dt>
            <dd>{status.ppq.toFixed(2)}</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
