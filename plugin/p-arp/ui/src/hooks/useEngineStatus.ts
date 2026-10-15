import { useEffect, useState } from "react";

export interface EngineStatus {
  noteOnsIn: number;
  noteOnsOut: number;
  playing: boolean;
  bpm: number;
  ppq: number;
  debugLog: boolean;
  debugLogFile: string; // empty until something was logged
}

const initialStatus: EngineStatus = { noteOnsIn: 0, noteOnsOut: 0, playing: false, bpm: 0, ppq: 0, debugLog: false, debugLogFile: "" };

/**
 * Engine status pushed from C++ ("engineStatus" events, ~30/s).
 *
 * Fine for low-rate readouts. For high-frequency visuals (playhead, live notes) don't
 * route every update through React state: subscribe directly and draw in a canvas / update refs
 * on requestAnimationFrame.
 */
export function useEngineStatus(): EngineStatus {
  const [status, setStatus] = useState(initialStatus);
  useEffect(() => {
    const token = window.__JUCE__.backend.addEventListener("engineStatus", setStatus);
    return () => window.__JUCE__.backend.removeEventListener(token);
  }, []);
  return status;
}
