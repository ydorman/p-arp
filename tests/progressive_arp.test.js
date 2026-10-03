const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, pairNotes } = require("./scripter_mock");

const SCRIPT = "progressive_arp.js";

// Menu indices
const PATTERN = { UP: 0, DOWN: 1, UP_DOWN: 2, DOWN_UP: 3, AS_PLAYED: 4, RANDOM: 5 };
const SHAPE = { UP: 0, DOWN: 1, TRIANGLE: 2 };
const TRIGGER = { CYCLE: 0, STEP: 1 };
const SUBDIV = { HALF: 0, QUARTER: 1, EIGHTH: 2, SIXTEENTH: 3, THIRTYSECOND: 4, SIXTYFOURTH: 5 };

/** Load the arp with named parameter overrides, e.g. { PARAM_PATTERN: 0 }. */
function arp(named = {}, options = {}) {
  const probe = loadScript(SCRIPT);
  const params = {};
  for (const [name, value] of Object.entries(named)) {
    assert.ok(name in probe.ctx, `unknown parameter constant ${name}`);
    params[probe.ctx[name]] = value;
  }
  return loadScript(SCRIPT, Object.assign({}, options, { params }));
}

/** Deterministic pseudo-random generator (LCG) returning values in [0, 1). */
function seededRandom(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Array.from: arrays created inside the script's vm context fail strict deepEqual against host arrays.
const pitches = (notes) => Array.from(notes, (n) => n.pitch);
const beats = (notes) => notes.map((n) => n.beat);
const before = (notes, beat) => notes.filter((n) => n.beat < beat - 1e-9);

// A plain 1-octave Up arpeggiator at 1/8 notes, with no modulation active.
const PLAIN = {
  PARAM_PATTERN: PATTERN.UP,
  PARAM_BASE_OCTAVE: 1,
  PARAM_BASE_SUBDIV: SUBDIV.EIGHTH,
  PARAM_GATE: 80,
};

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

describe("getSubdivisionBeatLength", () => {
  it("maps n to 4 / 2^n beats", () => {
    const { ctx } = arp();
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(ctx.getSubdivisionBeatLength), [2, 1, 0.5, 0.25, 0.125, 0.0625]);
  });
});

describe("quantizeBeatToGrid", () => {
  const { ctx } = arp();
  it("keeps beats that are on the grid", () => {
    assert.equal(ctx.quantizeBeatToGrid(1.0, 0.5), 1.0);
    assert.equal(ctx.quantizeBeatToGrid(2.5, 0.5), 2.5);
  });
  it("tolerates floating point noise", () => {
    assert.equal(ctx.quantizeBeatToGrid(2.5000001, 0.5), 2.5);
    assert.equal(ctx.quantizeBeatToGrid(2.4999999, 0.5), 2.5);
  });
  it("snaps off-grid beats forward to the next grid line", () => {
    assert.equal(ctx.quantizeBeatToGrid(2.1, 0.5), 2.5);
    assert.equal(ctx.quantizeBeatToGrid(3.25, 0.5), 3.5);
    assert.equal(ctx.quantizeBeatToGrid(1.01, 2), 3.0);
  });
});

describe("stepSeriesValue", () => {
  const { ctx } = arp();
  function run(start, dir, min, max, shape, steps) {
    const out = [];
    let state = { val: start, dir };
    for (let i = 0; i < steps; i++) {
      state = ctx.stepSeriesValue(state.val, state.dir, min, max, shape);
      out.push(state.val);
    }
    return out;
  }

  it("Up is a rising sawtooth", () => {
    assert.deepEqual(run(1, 1, 1, 3, SHAPE.UP, 6), [2, 3, 1, 2, 3, 1]);
  });
  it("Down is a falling sawtooth", () => {
    assert.deepEqual(run(3, -1, 1, 3, SHAPE.DOWN, 6), [2, 1, 3, 2, 1, 3]);
  });
  it("Triangle bounces without repeating the ends", () => {
    assert.deepEqual(run(2, 1, 1, 3, SHAPE.TRIANGLE, 8), [3, 2, 1, 2, 3, 2, 1, 2]);
  });
  it("returns min when the range is a single value", () => {
    assert.deepEqual(run(2, 1, 2, 2, SHAPE.TRIANGLE, 3), [2, 2, 2]);
  });
  it("clamps an out-of-range current value back into range", () => {
    assert.deepEqual(run(9, 1, 1, 3, SHAPE.UP, 2), [1, 2]);
  });
});

describe("series bounds", () => {
  it("octave bounds are clamped to 1..4", () => {
    const { ctx } = arp({ PARAM_BASE_OCTAVE: 4, PARAM_OCT_SPREAD_DOWN: 3, PARAM_OCT_SPREAD_UP: 3 });
    const b = ctx.getSeriesBounds("octave");
    assert.deepEqual([b.minPos, b.basePos, b.maxPos], [1, 4, 4]);
  });
  it("subdivision bounds are clamped to n=1..6", () => {
    const { ctx } = arp({ PARAM_BASE_SUBDIV: SUBDIV.SIXTEENTH, PARAM_SUB_SPREAD_DOWN: 1, PARAM_SUB_SPREAD_UP: 3 });
    const b = ctx.getSeriesBounds("subdiv");
    assert.deepEqual([b.minPos, b.basePos, b.maxPos], [3, 4, 6]);
  });
  it("pattern bounds are clamped to the menu range", () => {
    const { ctx } = arp({ PARAM_PATTERN: PATTERN.DOWN, PARAM_PAT_SPREAD_DOWN: 3, PARAM_PAT_SPREAD_UP: 5 });
    const b = ctx.getSeriesBounds("pattern");
    assert.deepEqual([b.minPos, b.basePos, b.maxPos], [PATTERN.UP, PATTERN.DOWN, PATTERN.RANDOM]);
  });
  it("velocity steps collapse on a side with zero spread", () => {
    const { ctx } = arp({ PARAM_VEL_SPREAD_DOWN: 0, PARAM_VEL_SPREAD_UP: 10 });
    const b = ctx.getSeriesBounds("velocity");
    assert.deepEqual([b.minPos, b.maxPos], [0, 4]);
  });
});

describe("velocity series values", () => {
  it("returns the base when velocity mod is off", () => {
    const { ctx } = arp({ PARAM_VEL_BASE: 70, PARAM_VEL_ACTIVE: 0 });
    ctx.seriesState.velocity.pos = 4;
    assert.equal(ctx.getSeriesValue("velocity"), 70);
  });
  it("spreads 4 steps on each side of the base", () => {
    const { ctx } = arp({ PARAM_VEL_BASE: 70, PARAM_VEL_ACTIVE: 1, PARAM_VEL_SPREAD_DOWN: 25, PARAM_VEL_SPREAD_UP: 25 });
    const k = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    assert.deepEqual(k.map((pos) => ctx.getSeriesValueAt("velocity", pos)), [45, 51, 57, 64, 70, 76, 83, 89, 95]);
  });
  it("clamps to 1..127", () => {
    const { ctx } = arp({ PARAM_VEL_BASE: 120, PARAM_VEL_ACTIVE: 1, PARAM_VEL_SPREAD_DOWN: 64, PARAM_VEL_SPREAD_UP: 64 });
    assert.equal(ctx.getSeriesValueAt("velocity", 4), 127);
    const low = arp({ PARAM_VEL_BASE: 10, PARAM_VEL_ACTIVE: 1, PARAM_VEL_SPREAD_DOWN: 64, PARAM_VEL_SPREAD_UP: 64 });
    assert.equal(low.ctx.getSeriesValueAt("velocity", -4), 1);
  });
});

describe("configurable steps", () => {
  it("velocity steps per side set the series resolution", () => {
    const { ctx } = arp({
      PARAM_VEL_BASE: 70, PARAM_VEL_ACTIVE: 1, PARAM_VEL_SPREAD_DOWN: 24, PARAM_VEL_SPREAD_UP: 24, PARAM_VEL_STEPS: 2,
    });
    const b = ctx.getSeriesBounds("velocity");
    assert.deepEqual([b.minPos, b.maxPos], [-2, 2]);
    assert.deepEqual([-2, -1, 0, 1, 2].map((pos) => ctx.getSeriesValueAt("velocity", pos)), [46, 58, 70, 82, 94]);
  });

  it("a single step jumps straight to the spread ends", () => {
    const { ctx } = arp({
      PARAM_GATE: 60, PARAM_GATE_ACTIVE: 1, PARAM_GATE_SPREAD_DOWN: 30, PARAM_GATE_SPREAD_UP: 40, PARAM_GATE_STEPS: 1,
    });
    assert.deepEqual([-1, 0, 1].map((pos) => ctx.getSeriesValueAt("gate", pos)), [30, 60, 100]);
  });

  it("gate and velocity steps are independent", () => {
    const { ctx } = arp({ PARAM_GATE_STEPS: 8, PARAM_VEL_STEPS: 1 });
    assert.equal(ctx.getSeriesBounds("gate").maxPos, 8);
    assert.equal(ctx.getSeriesBounds("velocity").maxPos, 1);
  });

  it("plays the shorter velocity walk during playback", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_VEL_ACTIVE: 1, PARAM_VEL_BASE: 70, PARAM_VEL_SPREAD_DOWN: 24, PARAM_VEL_SPREAD_UP: 24, PARAM_VEL_STEPS: 2,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP, PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    host.noteOn(60);
    host.play(3);
    assert.deepEqual(before(host.noteOns(), 4).map((n) => n.velocity), [46, 58, 70, 82, 94, 46]);
  });

  it("reducing steps restarts a series that falls outside the new range", () => {
    const host = arp({ PARAM_VEL_ACTIVE: 1, PARAM_VEL_STEPS: 8, PARAM_PROG_SHAPE: SHAPE.DOWN });
    assert.equal(host.ctx.seriesState.velocity.pos, 8);
    host.setParam(host.ctx.PARAM_VEL_STEPS, 3);
    assert.equal(host.ctx.seriesState.velocity.pos, 3);
  });
});

describe("gate series values", () => {
  it("returns the base when gate mod is off", () => {
    const { ctx } = arp({ PARAM_GATE: 80, PARAM_GATE_ACTIVE: 0 });
    ctx.seriesState.gate.pos = -4;
    assert.equal(ctx.getSeriesValue("gate"), 80);
  });
  it("spreads 4 steps on each side of the base", () => {
    const { ctx } = arp({ PARAM_GATE: 80, PARAM_GATE_ACTIVE: 1, PARAM_GATE_SPREAD_DOWN: 40, PARAM_GATE_SPREAD_UP: 20 });
    const k = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    assert.deepEqual(k.map((pos) => ctx.getSeriesValueAt("gate", pos)), [40, 50, 60, 70, 80, 85, 90, 95, 100]);
  });
  it("clamps to 10..100", () => {
    const { ctx } = arp({ PARAM_GATE: 20, PARAM_GATE_ACTIVE: 1, PARAM_GATE_SPREAD_DOWN: 40, PARAM_GATE_SPREAD_UP: 90 });
    assert.equal(ctx.getSeriesValueAt("gate", -4), 10);
    assert.equal(ctx.getSeriesValueAt("gate", 4), 100);
  });
});

// ----------------------------------------------------------------------------
// Sequence building
// ----------------------------------------------------------------------------

describe("rebuildSequence patterns", () => {
  function sequence(pattern, octaves, played = [60, 64, 67]) {
    const host = arp({ PARAM_PATTERN: pattern, PARAM_BASE_OCTAVE: octaves });
    played.forEach((p) => host.noteOn(p));
    return pitches(host.ctx.sequenceNotes);
  }

  it("Up", () => assert.deepEqual(sequence(PATTERN.UP, 1), [60, 64, 67]));
  it("Down", () => assert.deepEqual(sequence(PATTERN.DOWN, 1), [67, 64, 60]));
  it("Up/Down does not repeat the ends", () => assert.deepEqual(sequence(PATTERN.UP_DOWN, 1), [60, 64, 67, 64]));
  it("Down/Up does not repeat the ends", () => assert.deepEqual(sequence(PATTERN.DOWN_UP, 1), [67, 64, 60, 64]));
  it("As Played keeps input order", () => assert.deepEqual(sequence(PATTERN.AS_PLAYED, 1, [67, 60, 64]), [67, 60, 64]));
  it("Up sorts notes played out of order", () => assert.deepEqual(sequence(PATTERN.UP, 1, [67, 60, 64]), [60, 64, 67]));
  it("expands across octaves", () => {
    assert.deepEqual(sequence(PATTERN.UP_DOWN, 2), [60, 64, 67, 72, 76, 79, 76, 72, 67, 64]);
  });
  it("drops notes transposed above 127", () => {
    assert.deepEqual(sequence(PATTERN.UP, 2, [120]), [120]);
  });
});

// ----------------------------------------------------------------------------
// Latch
// ----------------------------------------------------------------------------

describe("latch", () => {
  it("does not duplicate a note re-pressed while the chord is held", () => {
    const host = arp({ PARAM_LATCH: 1, PARAM_PATTERN: PATTERN.UP, PARAM_BASE_OCTAVE: 1 });
    host.noteOn(60);
    host.noteOn(64);
    host.noteOff(64);
    host.noteOn(64);
    host.noteOff(64);
    host.noteOff(60);
    assert.deepEqual(pitches(host.ctx.latchedNotes), [60, 64]);
    assert.deepEqual(pitches(host.ctx.sequenceNotes), [60, 64]);
  });

  it("keeps playing after all keys are released", () => {
    const host = arp(Object.assign({ PARAM_LATCH: 1 }, PLAIN));
    host.noteOn(60);
    host.noteOff(60);
    host.play(2);
    assert.ok(host.noteOns().length >= 4);
  });

  it("a new chord after releasing all keys replaces the latched chord", () => {
    const host = arp({ PARAM_LATCH: 1, PARAM_PATTERN: PATTERN.UP, PARAM_BASE_OCTAVE: 1 });
    [60, 64, 67].forEach((p) => host.noteOn(p));
    [60, 64, 67].forEach((p) => host.noteOff(p));
    host.noteOn(62);
    host.noteOn(65);
    assert.deepEqual(pitches(host.ctx.latchedNotes), [62, 65]);
  });
});

// ----------------------------------------------------------------------------
// Playback (simulated host transport)
// ----------------------------------------------------------------------------

describe("playback", () => {
  it("plays the pattern on the 1/8 grid with the configured gate", () => {
    const host = arp(PLAIN);
    [60, 64, 67].forEach((p) => host.noteOn(p, 90));
    host.play(2);
    const ons = before(host.noteOns(), 3);
    assert.deepEqual(beats(ons), [1, 1.5, 2, 2.5]);
    assert.deepEqual(pitches(ons), [60, 64, 67, 60]);
    assert.deepEqual(ons.map((n) => n.velocity), [90, 90, 90, 90]);
    const { pairs } = pairNotes(host.events);
    for (const p of pairs) assert.ok(Math.abs(p.off - p.on - 0.4) < 1e-9, `gate length ${p.off - p.on}`);
  });

  it("produces nothing with no notes held", () => {
    const host = arp(PLAIN);
    host.play(2);
    assert.equal(host.events.length, 0);
  });

  it("releasing the chord stops sounding notes immediately", () => {
    const host = arp(PLAIN);
    host.noteOn(60);
    host.play(0.1); // NoteOn at 1.0, NoteOff scheduled at 1.4
    host.noteOff(60);
    const offs = host.noteOffs();
    assert.ok(offs.some((e) => e.beat < 1.4), "expected an immediate NoteOff");
    host.play(2);
    assert.equal(host.noteOns().length, 1, "no new notes after release");
  });

  it("stopping the transport only sends NoteOffs for notes still sounding", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_GATE: 50 }));
    host.noteOn(60);
    host.play(0.3); // NoteOn at 1.0 ended at 1.25; nothing sounding at 1.3
    host.stop();
    assert.equal(host.noteOffs().length, 1);

    const sounding = arp(Object.assign({}, PLAIN, { PARAM_GATE: 50 }));
    sounding.noteOn(60);
    sounding.play(0.1); // still sounding at 1.1
    sounding.stop();
    assert.equal(sounding.noteOffs().length, 2, "scheduled NoteOff plus the stop flush");
  });

  it("forgets sounding notes once their NoteOff has passed", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_GATE: 10 }));
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(4);
    const start = host.timing.blockStartBeat;
    for (const [pitch, offBeat] of Object.entries(host.ctx.activeSoundingPitches)) {
      assert.ok(offBeat > start, `pitch ${pitch} ended at ${offBeat} but is still tracked at ${start}`);
    }
  });

  it("clips notes at the cycle end and keeps playing after the wrap", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_GATE: 100 }));
    host.setCycle(1, 3);
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(8); // four passes through the 2-beat cycle
    for (const off of host.noteOffs()) assert.ok(off.beat < 3, `NoteOff at ${off.beat} is past the cycle end`);
    assert.equal(host.noteOns().length, 16);
    assert.ok(host.noteOffs().length >= host.noteOns().length);
  });

  it("timing does not depend on the audio block size", () => {
    const settings = Object.assign({}, PLAIN, {
      PARAM_SUB_ACTIVE: 1,
      PARAM_BASE_SUBDIV: SUBDIV.SIXTEENTH,
      PARAM_SUB_SPREAD_DOWN: 2,
      PARAM_SUB_SPREAD_UP: 2,
      PARAM_PROG_SHAPE: SHAPE.TRIANGLE,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
    });
    const runs = [0.0232, 0.01, 0.1, 0.37].map((blockBeats) => {
      const host = arp(settings);
      [60, 64, 67].forEach((p) => host.noteOn(p));
      host.play(16, { blockBeats });
      return before(host.noteOns(), 16).map((n) => `${n.pitch}@${n.beat}`);
    });
    for (const r of runs.slice(1)) assert.deepEqual(r, runs[0]);
  });

  it("leaves no stuck notes across modulated settings", () => {
    const variants = [
      { PARAM_OCT_ACTIVE: 1, PARAM_ADVANCE_TRIGGER: TRIGGER.STEP, PARAM_PROG_SHAPE: SHAPE.TRIANGLE },
      { PARAM_SUB_ACTIVE: 1, PARAM_SUB_SPREAD_UP: 3, PARAM_PROG_SHAPE: SHAPE.DOWN },
      { PARAM_OCT_ACTIVE: 1, PARAM_SUB_ACTIVE: 1, PARAM_VEL_ACTIVE: 1, PARAM_PATTERN: PATTERN.RANDOM, PARAM_GATE: 100 },
      { PARAM_PAT_ACTIVE: 1, PARAM_PAT_SPREAD_UP: 2, PARAM_ADVANCE_TRIGGER: TRIGGER.STEP, PARAM_PROG_SHAPE: SHAPE.TRIANGLE },
      { PARAM_PAT_ACTIVE: 1, PARAM_GATE_ACTIVE: 1, PARAM_OCT_ACTIVE: 1, PARAM_SUB_ACTIVE: 1, PARAM_GATE: 90 },
    ];
    for (const v of variants) {
      const host = arp(Object.assign({}, PLAIN, v));
      [60, 64, 67].forEach((p) => host.noteOn(p));
      host.play(12);
      host.stop();
      const { unmatched } = pairNotes(host.events);
      assert.deepEqual(unmatched, [], `stuck notes with ${JSON.stringify(v)}`);
    }
  });
});

// ----------------------------------------------------------------------------
// Series modulation during playback
// ----------------------------------------------------------------------------

describe("series modulation", () => {
  it("octave range grows per arp cycle (Up shape)", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_OCT_ACTIVE: 1,
      PARAM_OCT_SPREAD_DOWN: 0,
      PARAM_OCT_SPREAD_UP: 1,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(6);
    assert.deepEqual(pitches(before(host.noteOns(), 7)), [60, 64, 67, 60, 64, 67, 72, 76, 79, 60, 64, 67]);
  });

  it("subdivision speeds up per arp cycle and stays on the grid", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_SUB_ACTIVE: 1,
      PARAM_SUB_SPREAD_DOWN: 0,
      PARAM_SUB_SPREAD_UP: 1,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(4);
    // 1/8, 1/8, 1/8 | 1/16 x3 | back to 1/8 (snapped forward from 3.25 to 3.5)
    assert.deepEqual(beats(before(host.noteOns(), 5)), [1, 1.5, 2, 2.5, 2.75, 3, 3.5, 4, 4.5]);
  });

  it("velocity walks its 9 steps per note (Up shape)", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_VEL_ACTIVE: 1,
      PARAM_VEL_BASE: 70,
      PARAM_VEL_SPREAD_DOWN: 25,
      PARAM_VEL_SPREAD_UP: 25,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    host.noteOn(60);
    host.play(5);
    const vels = before(host.noteOns(), 6).map((n) => n.velocity);
    assert.deepEqual(vels, [45, 51, 57, 64, 70, 76, 83, 89, 95, 45]);
  });

  it("pattern alternates per arp cycle (Up shape)", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_PATTERN: PATTERN.UP,
      PARAM_PAT_ACTIVE: 1,
      PARAM_PAT_SPREAD_DOWN: 0,
      PARAM_PAT_SPREAD_UP: 1,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(4.5);
    // Up | Down | Up
    assert.deepEqual(pitches(before(host.noteOns(), 5.5)), [60, 64, 67, 67, 64, 60, 60, 64, 67]);
  });

  it("pattern advances only at cycle end even with Per Note Step", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_PATTERN: PATTERN.UP,
      PARAM_PAT_ACTIVE: 1,
      PARAM_PAT_SPREAD_DOWN: 0,
      PARAM_PAT_SPREAD_UP: 1,
      PARAM_VEL_ACTIVE: 1,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(4.5);
    const ons = before(host.noteOns(), 5.5);
    // Pattern still switches per cycle: Up | Down | Up
    assert.deepEqual(pitches(ons), [60, 64, 67, 67, 64, 60, 60, 64, 67]);
    // ...while velocity keeps advancing on every note
    assert.deepEqual(ons.map((n) => n.velocity), [45, 51, 57, 64, 70, 76, 83, 89, 95]);
  });

  it("pattern mod off ignores the series and uses the Arp Pattern menu", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_PATTERN: PATTERN.DOWN, PARAM_PAT_ACTIVE: 0 }));
    host.ctx.seriesState.pattern.pos = PATTERN.UP;
    [60, 64, 67].forEach((p) => host.noteOn(p));
    assert.deepEqual(pitches(host.ctx.sequenceNotes), [67, 64, 60]);
  });

  it("gate length walks its 9 steps per note (Up shape)", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_GATE: 80,
      PARAM_GATE_ACTIVE: 1,
      PARAM_GATE_SPREAD_DOWN: 40,
      PARAM_GATE_SPREAD_UP: 20,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    host.noteOn(60);
    host.play(5);
    const lengths = pairNotes(host.events).pairs.filter((p) => p.on < 5.75).map((p) => +(p.off - p.on).toFixed(6));
    // 1/8 step (0.5 beats) x [40, 50, 60, 70, 80, 85, 90, 95, 100, 40] %
    assert.deepEqual(lengths, [0.2, 0.25, 0.3, 0.35, 0.4, 0.425, 0.45, 0.475, 0.5, 0.2]);
  });

  it("triangle starts at the base and bounces", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_BASE_OCTAVE: 2,
      PARAM_OCT_ACTIVE: 1,
      PARAM_OCT_SPREAD_DOWN: 1,
      PARAM_OCT_SPREAD_UP: 1,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
      PARAM_PROG_SHAPE: SHAPE.TRIANGLE,
    }));
    const seen = [host.ctx.seriesState.octave.pos];
    for (let i = 0; i < 5; i++) {
      host.ctx.advanceProgressions(true);
      seen.push(host.ctx.seriesState.octave.pos);
    }
    assert.deepEqual(seen, [2, 3, 2, 1, 2, 3]);
  });

  it("triangle with base at the top of the range does not repeat the top after a parameter change", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_BASE_OCTAVE: 4,
      PARAM_OCT_SPREAD_DOWN: 1,
      PARAM_OCT_SPREAD_UP: 0,
      PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
      PARAM_PROG_SHAPE: SHAPE.TRIANGLE,
    }));
    host.setParam(host.ctx.PARAM_OCT_ACTIVE, 1);
    const seen = [host.ctx.seriesState.octave.pos];
    for (let i = 0; i < 3; i++) {
      host.ctx.advanceProgressions(true);
      seen.push(host.ctx.seriesState.octave.pos);
    }
    assert.deepEqual(seen, [4, 3, 4, 3]);
  });

  it("moving a Base restarts its series from the start of the new range", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_BASE_OCTAVE: 2,
      PARAM_OCT_ACTIVE: 1,
      PARAM_OCT_SPREAD_DOWN: 1,
      PARAM_OCT_SPREAD_UP: 1,
      PARAM_PROG_SHAPE: SHAPE.UP,
    }));
    host.ctx.advanceProgressions(true);
    host.ctx.advanceProgressions(true);
    assert.equal(host.ctx.seriesState.octave.pos, 3);
    host.setParam(host.ctx.PARAM_BASE_OCTAVE, 3);
    assert.equal(host.ctx.seriesState.octave.pos, 2);
  });
});

// ----------------------------------------------------------------------------
// Swing
// ----------------------------------------------------------------------------

describe("swing", () => {
  it("getSwingTiming splits each pair of steps swing : (100 - swing)", () => {
    const { ctx } = arp();
    const t = (beat, swing) => {
      const r = ctx.getSwingTiming(beat, 0.5, swing);
      return [r.offset, r.length];
    };
    assert.deepEqual(t(1.0, 50), [0, 0.5]);
    assert.deepEqual(t(1.5, 50), [0, 0.5]);
    assert.deepEqual(t(1.0, 75), [0, 0.75]);
    assert.deepEqual(t(1.5, 75), [0.25, 0.25]);
    assert.deepEqual(t(2.0, 75), [0, 0.75], "next pair starts on-beat again");
  });

  it("delays off-beat notes and keeps gate relative to the swung slot", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_SWING: 75, PARAM_GATE: 100 }));
    host.noteOn(60);
    host.play(2);
    const { pairs } = pairNotes(host.events);
    const notes = pairs.filter((p) => p.on < 3).map((p) => [p.on, p.off]);
    assert.deepEqual(notes, [[1, 1.75], [1.75, 2], [2, 2.75], [2.75, 3]]);
  });

  it("swings pairs at the current subdivision", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_BASE_SUBDIV: SUBDIV.SIXTEENTH, PARAM_SWING: 75 }));
    host.noteOn(60);
    host.play(1);
    assert.deepEqual(beats(before(host.noteOns(), 2)), [1, 1.375, 1.5, 1.875]);
  });

  it("is a series target with configurable steps", () => {
    const { ctx } = arp({
      PARAM_SWING: 50, PARAM_SWING_ACTIVE: 1, PARAM_SWING_SPREAD_DOWN: 0, PARAM_SWING_SPREAD_UP: 24, PARAM_SWING_STEPS: 4,
    });
    const b = ctx.getSeriesBounds("swing");
    assert.deepEqual([b.minPos, b.maxPos], [0, 4]);
    assert.deepEqual([0, 1, 2, 3, 4].map((pos) => ctx.getSeriesValueAt("swing", pos)), [50, 56, 62, 68, 74]);
  });

  it("clamps the swing series to 50..75%", () => {
    const { ctx } = arp({ PARAM_SWING: 70, PARAM_SWING_ACTIVE: 1, PARAM_SWING_SPREAD_DOWN: 25, PARAM_SWING_SPREAD_UP: 25 });
    assert.equal(ctx.getSeriesValueAt("swing", 4), 75);
    assert.equal(ctx.getSeriesValueAt("swing", -4), 50);
  });

  it("never schedules a swung note past the cycle end", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_SWING: 75, PARAM_GATE: 100 }));
    host.setCycle(1, 2.75); // the off-beat at grid 2.5 swings to 2.75 = loop end, so it must be skipped
    host.noteOn(60);
    host.play(6);
    for (const e of host.events) assert.ok(e.beat < 2.75, `${e.type} at ${e.beat} is past the cycle end`);
    assert.ok(host.noteOffs().length >= host.noteOns().length);
  });

  it("timing with swing does not depend on the audio block size", () => {
    const settings = Object.assign({}, PLAIN, {
      PARAM_SWING: 62, PARAM_SWING_ACTIVE: 1, PARAM_SWING_SPREAD_UP: 12,
      PARAM_SUB_ACTIVE: 1, PARAM_SUB_SPREAD_UP: 1, PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
    });
    const runs = [0.0232, 0.01, 0.37].map((blockBeats) => {
      const host = arp(settings);
      [60, 64, 67].forEach((p) => host.noteOn(p));
      host.play(12, { blockBeats });
      return before(host.noteOns(), 12).map((n) => `${n.pitch}@${n.beat}`);
    });
    for (const r of runs.slice(1)) assert.deepEqual(r, runs[0]);
  });
});

// ----------------------------------------------------------------------------
// Humanize
// ----------------------------------------------------------------------------

describe("humanize", () => {
  it("does nothing (and draws no random numbers) when set to 0", () => {
    let calls = 0;
    const host = arp(PLAIN, { random: () => { calls++; return 0.5; } });
    host.noteOn(60, 90);
    host.play(2);
    assert.equal(calls, 0);
    assert.ok(host.noteOns().every((n) => n.velocity === 90));
  });

  it("varies velocity within +/- the amount", () => {
    const host = arp(Object.assign({}, PLAIN, { PARAM_HUMANIZE_VEL: 10 }), { random: seededRandom(7) });
    host.noteOn(60, 100);
    host.play(16);
    const vels = host.noteOns().map((n) => n.velocity);
    assert.ok(vels.every((v) => v >= 90 && v <= 110), `out of range: ${vels}`);
    assert.ok(new Set(vels).size > 5, "expected varied velocities");
  });

  it("applies velocity humanize on top of the velocity series, clamped to 1..127", () => {
    const high = arp(Object.assign({}, PLAIN, { PARAM_VEL_ACTIVE: 1, PARAM_VEL_BASE: 120, PARAM_VEL_SPREAD_DOWN: 0, PARAM_VEL_SPREAD_UP: 0, PARAM_HUMANIZE_VEL: 40 }), { random: () => 0.9999 });
    high.noteOn(60);
    high.play(1);
    assert.ok(high.noteOns().every((n) => n.velocity === 127));

    const low = arp(Object.assign({}, PLAIN, { PARAM_HUMANIZE_VEL: 40 }), { random: () => 0 });
    low.noteOn(60, 20);
    low.play(1);
    assert.ok(low.noteOns().every((n) => n.velocity === 1));
  });

  it("varies note length within +/- the amount, clamped to the step", () => {
    const longer = arp(Object.assign({}, PLAIN, { PARAM_GATE: 80, PARAM_HUMANIZE_GATE: 40 }), { random: () => 0.9999 });
    longer.noteOn(60);
    longer.play(2);
    for (const p of pairNotes(longer.events).pairs) assert.ok(p.off - p.on <= 0.5 + 1e-9, "gate must not exceed 100%");

    const shorter = arp(Object.assign({}, PLAIN, { PARAM_GATE: 50, PARAM_HUMANIZE_GATE: 20 }), { random: () => 0 });
    shorter.noteOn(60);
    shorter.play(2);
    for (const p of pairNotes(shorter.events).pairs) assert.ok(Math.abs(p.off - p.on - 0.15) < 1e-9, `length ${p.off - p.on}`);
  });

  it("leaves no stuck notes with swing and humanize together", () => {
    const host = arp(Object.assign({}, PLAIN, {
      PARAM_SWING: 70, PARAM_HUMANIZE_VEL: 20, PARAM_HUMANIZE_GATE: 30, PARAM_GATE: 90,
      PARAM_OCT_ACTIVE: 1, PARAM_SUB_ACTIVE: 1, PARAM_ADVANCE_TRIGGER: TRIGGER.STEP,
    }), { random: seededRandom(3) });
    [60, 64, 67].forEach((p) => host.noteOn(p));
    host.play(12);
    host.stop();
    assert.deepEqual(pairNotes(host.events).unmatched, []);
  });
});
