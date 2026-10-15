// Live view data: generated notes ("liveNotes" batches) and engine status ("engineStatus", ~30/s)
// from the plugin, kept outside React state; the live view reads it every animation frame.
// In a plain browser a demo feed stands in for the engine, for layout work.

export interface LiveNote {
  time: number; // engine timeline (beats; never jumps back)
  beat: number; // Logic beat
  length: number;
  pitch: number;
  velocity: number;
}

export interface LiveStatus {
  playing: boolean;
  bpm: number;
  ppq: number;
  timeline: number;
  beatsPerBar: number;
  receivedAt: number; // performance.now() when this status arrived
}

const KEEP_BEATS = 64; // notes older than this (behind the newest) are dropped

export const feed = {
  notes: [] as LiveNote[],
  status: {
    playing: false,
    bpm: 0,
    ppq: 0,
    timeline: 0,
    beatsPerBar: 4,
    receivedAt: 0,
  } as LiveStatus,
  demo: false,
};

/** Timeline position now: the last status, moved on by the time since it arrived while playing. */
export function playhead(now: number): number {
  const s = feed.status;
  if (!s.playing || s.bpm <= 0) return s.timeline;
  const elapsedBeats = ((now - s.receivedAt) / 1000) * (s.bpm / 60);
  return s.timeline + Math.min(elapsedBeats, 0.25); // don't run far ahead if updates stall
}

function addNotes(notes: LiveNote[]) {
  feed.notes.push(...notes);
  const newest = feed.notes[feed.notes.length - 1]?.time ?? 0;
  const firstKept = feed.notes.findIndex((n) => n.time >= newest - KEEP_BEATS);
  if (firstKept > 0) feed.notes.splice(0, firstKept);
}

// ------------------------------------------------------------------ plugin / demo sources

const inPlugin = Array.isArray(window.__JUCE__?.initialisationData?.__juce__functions) &&
  (window.__JUCE__.initialisationData.__juce__functions as string[]).length > 0;

if (inPlugin) {
  window.__JUCE__.backend.addEventListener("liveNotes", (notes: LiveNote[]) => addNotes(notes));
  window.__JUCE__.backend.addEventListener("engineStatus", (status: Omit<LiveStatus, "receivedAt">) => {
    feed.status = { ...status, receivedAt: performance.now() };
  });
} else {
  startDemo();
}

// Demo: C-E-G arpeggiated Up at 1/16 notes through a range of 1 to 4 octaves (one more every
// bar), every 4th bar at 1/8 notes, gate and velocity swelling, at 120 BPM.
function startDemo() {
  feed.demo = true;
  const bpm = 120;
  const start = performance.now();
  let next = 0; // timeline of the next note
  let step = 0;
  const tick = () => {
    const now = performance.now();
    const timeline = ((now - start) / 1000) * (bpm / 60);
    const notes: LiveNote[] = [];
    while (next <= timeline) {
      const bar = Math.floor(next / 4);
      const octaves = (bar % 4) + 1;
      const stepBeats = bar % 4 === 3 ? 0.5 : 0.25;
      const pitches: number[] = [];
      for (let o = 0; o < octaves; o++) pitches.push(60 + 12 * o, 64 + 12 * o, 67 + 12 * o);
      notes.push({
        time: next,
        beat: next + 1,
        length: stepBeats * (0.7 + 0.3 * Math.sin(next / 3)),
        pitch: pitches[step % pitches.length],
        velocity: Math.round(64 + 60 * Math.sin(next / 2.5)),
      });
      step++;
      next += stepBeats;
    }
    if (notes.length) addNotes(notes);
    feed.status = { playing: true, bpm, ppq: timeline, timeline, beatsPerBar: 4, receivedAt: now };
  };
  setInterval(tick, 33);
}
