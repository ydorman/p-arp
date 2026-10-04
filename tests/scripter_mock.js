/**
 * Minimal fake of the Logic Pro Scripter runtime, so Scripter scripts can be
 * loaded and exercised in Node without modification.
 *
 * Only the API surface used by the scripts in this repo is mocked:
 * NoteOn / NoteOff / Event (send, sendAtBeat), GetParameter, GetTimingInfo, Trace.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEFAULT_BLOCK_BEATS = 0.0232; // ~512 samples @ 44.1kHz, 120 BPM (deliberately off-grid)

function loadScript(relativePath, options = {}) {
  const src = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

  // Everything sent by the script, in send order: { type, pitch, velocity, beat }
  const events = [];
  let straddle = false;
  const traces = [];
  const params = [];
  let timing = {
    playing: false,
    blockStartBeat: 1.0,
    blockEndBeat: 1.0,
    tempo: 120,
    meterNumerator: 4,
    meterDenominator: 4,
    cycling: false,
    leftCycleBeat: 1.0,
    rightCycleBeat: 5.0,
  };

  class Event {
    send() {
      events.push(this._record(timing.blockStartBeat));
    }
    sendAtBeat(beat) {
      events.push(this._record(beat));
    }
    _record(beat) {
      return { type: this.constructor.name, pitch: this.pitch, velocity: this.velocity, beat };
    }
  }
  class NoteOn extends Event {
    constructor() {
      super();
      this.pitch = 60;
      this.velocity = 100;
    }
  }
  class NoteOff extends Event {
    constructor() {
      super();
      this.pitch = 60;
      this.velocity = 64;
    }
  }
  class ControlChange extends Event {}

  const ctx = vm.createContext({
    Event,
    NoteOn,
    NoteOff,
    ControlChange,
    // options.random replaces Math.random inside the script (for deterministic tests)
    Math: options.random ? Object.assign(Object.create(Math), { random: options.random }) : Math,
    GetParameter: (index) => params[index],
    GetTimingInfo: () => Object.assign({}, timing),
    Trace: (msg) => traces.push(String(msg)),
  });
  vm.runInContext(src, ctx, { filename: relativePath });

  // Initialise parameters to their defaults, then apply overrides.
  ctx.PluginParameters.forEach((p, i) => {
    params[i] = p.defaultValue !== undefined ? p.defaultValue : p.minValue || 0;
  });
  for (const [index, value] of Object.entries(options.params || {})) {
    params[index] = value;
  }
  if (typeof ctx.ParameterChanged === "function") {
    ctx.PluginParameters.forEach((_, i) => ctx.ParameterChanged(i, params[i]));
  }

  const host = {
    ctx,
    events,
    traces,

    setParam(index, value) {
      params[index] = value;
      if (typeof ctx.ParameterChanged === "function") ctx.ParameterChanged(index, value);
    },

    noteOn(pitch, velocity = 100, beat = timing.blockEndBeat) {
      const e = new NoteOn();
      e.pitch = pitch;
      e.velocity = velocity;
      e.beatPos = beat;
      ctx.HandleMIDI(e);
    },

    noteOff(pitch, beat = timing.blockEndBeat) {
      const e = new NoteOff();
      e.pitch = pitch;
      e.beatPos = beat;
      ctx.HandleMIDI(e);
    },

    /** Advance the transport by `beats`, calling ProcessMIDI once per audio block. */
    play(beats, { blockBeats = DEFAULT_BLOCK_BEATS } = {}) {
      if (!timing.playing) {
        timing.playing = true;
        timing.blockEndBeat = timing.blockStartBeat;
      }
      // Count elapsed beats rather than playhead position, which jumps back on cycle wraps.
      let remaining = beats;
      while (remaining > 1e-9) {
        let start = timing.blockEndBeat;
        if (timing.cycling && start >= timing.rightCycleBeat - 1e-9) {
          // DAW cycle wrap; with straddle, the previous block ran past the loop end and the
          // next block starts the same distance past the loop start (as Logic appears to do)
          start = timing.leftCycleBeat + (straddle ? start - timing.rightCycleBeat : 0);
        }
        // The last block ends exactly at the requested position
        let end = start + Math.min(blockBeats, remaining);
        if (timing.cycling && !straddle) end = Math.min(end, timing.rightCycleBeat);
        timing.blockStartBeat = start;
        timing.blockEndBeat = end;
        remaining -= end - start;
        ctx.ProcessMIDI();
      }
    },

    stop() {
      timing.playing = false;
      timing.blockStartBeat = timing.blockEndBeat;
      ctx.ProcessMIDI();
    },

    /** Loop between left and right. straddle: audio blocks may cross the loop end. */
    setCycle(left, right, options = {}) {
      timing.cycling = true;
      timing.leftCycleBeat = left;
      timing.rightCycleBeat = right;
      straddle = !!options.straddle;
    },

    /** Move the playhead (only while stopped). */
    locate(beat) {
      timing.blockStartBeat = beat;
      timing.blockEndBeat = beat;
    },

    get timing() {
      return Object.assign({}, timing);
    },

    noteOns() {
      return events.filter((e) => e.type === "NoteOn");
    },

    noteOffs() {
      return events.filter((e) => e.type === "NoteOff");
    },
  };

  return host;
}

/**
 * Pair every NoteOn with the next NoteOff of the same pitch (by beat).
 * Returns { pairs, unmatched } where unmatched NoteOns are stuck notes.
 */
function pairNotes(events) {
  const sorted = events
    .map((e, i) => Object.assign({ order: i }, e))
    .sort((a, b) => a.beat - b.beat || a.order - b.order);
  const open = {};
  const pairs = [];
  for (const e of sorted) {
    if (e.type === "NoteOn") {
      (open[e.pitch] = open[e.pitch] || []).push(e);
    } else if (e.type === "NoteOff" && open[e.pitch] && open[e.pitch].length) {
      const on = open[e.pitch].shift();
      pairs.push({ pitch: e.pitch, on: on.beat, off: e.beat, velocity: on.velocity });
    }
  }
  const unmatched = Object.values(open).flat();
  return { pairs, unmatched };
}

module.exports = { loadScript, pairNotes, DEFAULT_BLOCK_BEATS };
