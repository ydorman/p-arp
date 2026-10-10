/**
 * Progressive Arpeggiator for Logic Pro Scripter
 * 
 * An arpeggiator that modulates parameters (Pattern, Octave Range, Subdivision,
 * Gate Length, Velocity, Swing) across a series around each parameter's Base value,
 * advancing on each arp cycle or note step. Optional humanization adds random
 * velocity and note length variation on top.
 */

var NeedsTimingInfo = true;

// ----------------------------------------------------------------------------
// RATES (subdivisions)
// ----------------------------------------------------------------------------
// Every note value from 1/1 to 1/128 in straight, dotted and triplet form, ordered from
// slowest to fastest for the menu, e.g. ... 1/4, 1/8 dotted, 1/4 triplet, 1/8 ...
// family: "straight" | "dotted" | "triplet"
// power:  note value as 1/2^power (0 = 1/1 ... 7 = 1/128). The subdivision series moves in
//         doublings within the base rate's family (1/8 <-> 1/16, 1/8 triplet <-> 1/16 triplet).
// beats:  step length (1 beat = quarter note)
// grid:   snap grid for this rate. Straight and triplet rates snap to their own length;
//         dotted rates snap to their pulse (a third of their length, e.g. 1/8 dotted -> 1/16),
//         since a dotted grid only lines up with the bar every 3 notes.
var RATE_MAX_POWER = 7;

function buildRates() {
  var rates = [];
  for (var power = 0; power <= RATE_MAX_POWER; power++) {
    var d = Math.pow(2, power);
    var straight = 4.0 / d;
    rates.push({ name: "1/" + d + " dotted", family: "dotted", power: power, beats: straight * 1.5, grid: straight / 2 });
    rates.push({ name: "1/" + d, family: "straight", power: power, beats: straight, grid: straight });
    rates.push({ name: "1/" + d + " triplet", family: "triplet", power: power, beats: straight * 2 / 3, grid: straight * 2 / 3 });
  }
  rates.sort(function(a, b) { return b.beats - a.beats; });
  return rates;
}
var RATES = buildRates();

// Index of the rate with the given family and power
function findRate(family, power) {
  for (var i = 0; i < RATES.length; i++) {
    if (RATES[i].family === family && RATES[i].power === power) return i;
  }
  return -1;
}

function getRateNames() {
  var names = [];
  for (var i = 0; i < RATES.length; i++) {
    names.push(RATES[i].name);
  }
  return names;
}

function getRateIndex(name) {
  for (var i = 0; i < RATES.length; i++) {
    if (RATES[i].name === name) return i;
  }
  return -1;
}

// ----------------------------------------------------------------------------
// PLUGIN UI PARAMETERS
// ----------------------------------------------------------------------------
var PluginParameters = [
  // --- CORE ARP CONTROLS ---
  {
    name: "Latch Chord",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Advance Trigger",
    type: "menu",
    valueStrings: ["Per Arp Cycle", "Per Note Step", "Per Beat", "Per Bar", "Per 2 Bars"],
    defaultValue: 0 // Per Arp Cycle
  },
  {
    name: "Progression Shape",
    type: "menu",
    valueStrings: ["Up", "Down", "Up-Down (Triangle)"],
    defaultValue: 0 // Up
  },
  {
    name: "Link Series",
    type: "menu",
    valueStrings: ["Off", "Shared Phase", "Restart Together"],
    defaultValue: 0 // Off: each series moves on its own
  },
  {
    name: "Global Range",
    type: "lin",
    minValue: 0,
    maxValue: 100,
    numberOfSteps: 100,
    defaultValue: 100, // scales every series' Spread (-) and (+): 100% = as set, 0% = stays at base
    unit: "%"
  },
  {
    name: "Series Curve",
    type: "menu",
    valueStrings: ["Linear", "Accelerating", "Decelerating", "Fibonacci", "Primes", "Random", "Custom"],
    defaultValue: 0 // Linear: every series steps through each value of its range
  },

  // --- PATTERN SERIES GAUGE ---
  {
    name: "Arp Pattern",
    type: "menu",
    valueStrings: ["Up", "Down", "Up/Down", "Down/Up", "As Played", "Random"],
    defaultValue: 2 // Up/Down
  },
  {
    name: "Pattern Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Pattern Spread (-) Before",
    type: "lin",
    minValue: 0,
    maxValue: 5,
    numberOfSteps: 5,
    defaultValue: 1
  },
  {
    name: "Pattern Spread (+) After",
    type: "lin",
    minValue: 0,
    maxValue: 5,
    numberOfSteps: 5,
    defaultValue: 1
  },

  // --- OCTAVE SERIES GAUGE ---
  {
    name: "Base Octave Range",
    type: "lin",
    minValue: 1,
    maxValue: 4,
    numberOfSteps: 3,
    defaultValue: 2
  },
  {
    name: "Octave Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Octave Spread (-) Below",
    type: "lin",
    minValue: 0,
    maxValue: 3,
    numberOfSteps: 3,
    defaultValue: 1
  },
  {
    name: "Octave Spread (+) Above",
    type: "lin",
    minValue: 0,
    maxValue: 3,
    numberOfSteps: 3,
    defaultValue: 1
  },
  {
    name: "Octave Mode",
    type: "menu",
    valueStrings: ["Range", "Transpose"],
    defaultValue: 0 // Range: each step adds an octave to the cycle; Transpose: shifts the cycle
  },

  // --- SUBDIVISION SERIES GAUGE ---
  {
    name: "Base Subdivision",
    type: "menu",
    valueStrings: getRateNames(),
    defaultValue: getRateIndex("1/8")
  },
  {
    name: "Subdiv Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Subdiv Spread (-) Slower",
    type: "lin",
    minValue: 0,
    maxValue: 7,
    numberOfSteps: 7,
    defaultValue: 1 // steps are doublings within the base rate's family (1/8 -> 1/16)
  },
  {
    name: "Subdiv Spread (+) Faster",
    type: "lin",
    minValue: 0,
    maxValue: 7,
    numberOfSteps: 7,
    defaultValue: 1 // steps are doublings within the base rate's family (1/8 -> 1/16)
  },
  {
    name: "Subdiv Change Timing",
    type: "menu",
    valueStrings: ["Snap to Grid", "Flow (realign each pass)", "Free (no snapping)"],
    defaultValue: 0 // Snap to Grid
  },

  // --- GATE LENGTH SERIES GAUGE ---
  {
    name: "Gate Length (%)",
    type: "lin",
    minValue: 10,
    maxValue: 100,
    numberOfSteps: 90,
    defaultValue: 80,
    unit: "%"
  },
  {
    name: "Gate Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Gate Spread (-) Shorter",
    type: "lin",
    minValue: 0,
    maxValue: 90,
    numberOfSteps: 90,
    defaultValue: 40,
    unit: "%"
  },
  {
    name: "Gate Spread (+) Longer",
    type: "lin",
    minValue: 0,
    maxValue: 90,
    numberOfSteps: 90,
    defaultValue: 20,
    unit: "%"
  },
  {
    name: "Gate Steps (per side)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 4
  },

  // --- VELOCITY SERIES GAUGE ---
  {
    name: "Velocity Base",
    type: "lin",
    minValue: 1,
    maxValue: 127,
    numberOfSteps: 126,
    defaultValue: 70
  },
  {
    name: "Velocity Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Velocity Spread (-) Down",
    type: "lin",
    minValue: 0,
    maxValue: 64,
    numberOfSteps: 64,
    defaultValue: 25
  },
  {
    name: "Velocity Spread (+) Up",
    type: "lin",
    minValue: 0,
    maxValue: 64,
    numberOfSteps: 64,
    defaultValue: 25
  },
  {
    name: "Velocity Steps (per side)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 4
  },

  // --- SWING SERIES GAUGE ---
  {
    name: "Swing (%)",
    type: "lin",
    minValue: 50,
    maxValue: 75,
    numberOfSteps: 25,
    defaultValue: 50, // 50% = straight, 66% = triplet feel, 75% = dotted
    unit: "%"
  },
  {
    name: "Swing Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Swing Spread (-) Straighter",
    type: "lin",
    minValue: 0,
    maxValue: 25,
    numberOfSteps: 25,
    defaultValue: 0,
    unit: "%"
  },
  {
    name: "Swing Spread (+) Swingier",
    type: "lin",
    minValue: 0,
    maxValue: 25,
    numberOfSteps: 25,
    defaultValue: 16,
    unit: "%"
  },
  {
    name: "Swing Steps (per side)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 4
  },

  // --- HUMANIZE (random, independent of the series) ---
  {
    name: "Humanize Velocity (+/-)",
    type: "lin",
    minValue: 0,
    maxValue: 40,
    numberOfSteps: 40,
    defaultValue: 0
  },
  {
    name: "Humanize Gate (+/- %)",
    type: "lin",
    minValue: 0,
    maxValue: 40,
    numberOfSteps: 40,
    defaultValue: 0,
    unit: "%"
  },

  // --- CUSTOM SERIES (used when Series Curve = Custom) ---
  {
    name: "Custom Length",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 4
  },
  {
    name: "Custom Step 1",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 1 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 2",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 5 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 3",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 6 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 4",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 8 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 5",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 2 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 6",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 3 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 7",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 4 // 1 = each series' min ... 8 = its max
  },
  {
    name: "Custom Step 8",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 7 // 1 = each series' min ... 8 = its max
  },

  // --- DEBUG ---
  {
    name: "Debug Log",
    type: "checkbox",
    defaultValue: 0 // Logs settings, input notes and generated notes to the Scripter console
  }
];

// Parameter indices
var PARAM_LATCH = 0;
var PARAM_ADVANCE_TRIGGER = 1;
var PARAM_PROG_SHAPE = 2;
var PARAM_LINK = 3;
var PARAM_GLOBAL_RANGE = 4;
var PARAM_CURVE = 5;

var PARAM_PATTERN = 6;
var PARAM_PAT_ACTIVE = 7;
var PARAM_PAT_SPREAD_DOWN = 8;
var PARAM_PAT_SPREAD_UP = 9;

var PARAM_BASE_OCTAVE = 10;
var PARAM_OCT_ACTIVE = 11;
var PARAM_OCT_SPREAD_DOWN = 12;
var PARAM_OCT_SPREAD_UP = 13;
var PARAM_OCT_MODE = 14;

var PARAM_BASE_SUBDIV = 15;
var PARAM_SUB_ACTIVE = 16;
var PARAM_SUB_SPREAD_DOWN = 17;
var PARAM_SUB_SPREAD_UP = 18;
var PARAM_SUB_TIMING = 19;

var PARAM_GATE = 20;
var PARAM_GATE_ACTIVE = 21;
var PARAM_GATE_SPREAD_DOWN = 22;
var PARAM_GATE_SPREAD_UP = 23;
var PARAM_GATE_STEPS = 24;

var PARAM_VEL_BASE = 25;
var PARAM_VEL_ACTIVE = 26;
var PARAM_VEL_SPREAD_DOWN = 27;
var PARAM_VEL_SPREAD_UP = 28;
var PARAM_VEL_STEPS = 29;

var PARAM_SWING = 30;
var PARAM_SWING_ACTIVE = 31;
var PARAM_SWING_SPREAD_DOWN = 32;
var PARAM_SWING_SPREAD_UP = 33;
var PARAM_SWING_STEPS = 34;

var PARAM_HUMANIZE_VEL = 35;
var PARAM_HUMANIZE_GATE = 36;

var PARAM_CUSTOM_LENGTH = 37;
var PARAM_CUSTOM_STEP_1 = 38; // Custom Step 1..8 are consecutive

var PARAM_DEBUG = 46;

// Advance Trigger menu
var TRIGGER_CYCLE = 0;
var TRIGGER_STEP = 1;
var TRIGGER_BEAT = 2;
var TRIGGER_BAR = 3;
var TRIGGER_TWO_BARS = 4;

// Octave Mode menu
var OCTAVE_RANGE = 0;
var OCTAVE_TRANSPOSE = 1;

// Series Curve menu
var CURVE_LINEAR = 0;
var CURVE_ACCELERATING = 1;
var CURVE_DECELERATING = 2;
var CURVE_FIBONACCI = 3;
var CURVE_PRIMES = 4;
var CURVE_RANDOM = 5;
var CURVE_CUSTOM = 6;

// Link Series menu
var LINK_OFF = 0;
var LINK_SHARED = 1;
var LINK_RESTART = 2;

// Subdiv Change Timing menu
var TIMING_SNAP = 0;
var TIMING_FLOW = 1;
var TIMING_FREE = 2;

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------
var heldNotes = [];            // Raw held notes: [{ pitch, velocity }]
var latchedNotes = [];         // Notes kept when latch is on
var sequenceNotes = [];        // Expanded notes for current cycle
var currentStepIndex = 0;
var nextBeatToSchedule = 0;
var pendingRealign = null;     // null | "chord" | "rate" | "beat": snap the next note to a grid before playing it
var chordStartBeat = -1;       // Beat position of the note that started the current chord
// A chord played up to this late after a grid line still starts on that line (its first note
// plays immediately) instead of waiting for the next one. 1/64 note = ~31 ms at 120 BPM.
var CHORD_LATE_TOLERANCE = 0.0625;
var swingStepCount = 0;        // Note counter for swing pairing (odd = off-beat)
var lastAdvanceBoundary = null; // Beat/bar index of the last time-based advance (null = start fresh)
var lastLateOnset = -1;        // A note played late (immediately); the next note must come after it
var wasPlaying = false;
var lastBlockStartBeat = -1;   // Track previous block to detect loop wraps
var activeSoundingPitches = {};// Currently ringing notes: { pitch: scheduledNoteOffBeat }

// ----------------------------------------------------------------------------
// SERIES DEFINITIONS
// ----------------------------------------------------------------------------
// Each modulation target is described once here; all series logic below is generic.
//
// kind "range":  the series walks whole values from (base - spreadDown) to (base + spreadUp),
//                clamped to [minValue, maxValue]. Position = the value itself.
// kind "scaled": the series walks steps k = -steps..+steps around the base, where steps
//                (per side) comes from stepsParam; spreadDown / spreadUp set the total
//                distance covered on each side.
//                Position = k (0 is exactly the base). A side with zero spread has no steps.
//
// baseOffset converts the base parameter to a series value (0 when the menu index is the value).
// Optional limits() overrides minValue / maxValue when they depend on other parameters.
// Optional baseToPos / posToValue map between the base parameter, series positions and the
// parameter value for range series whose positions are not the values themselves.
// cycleOnly series advance only at the end of an arp cycle, even when Advance Trigger is
// "Per Note Step" (switching patterns on every note just scrambles them).
var SERIES = {
  pattern: {
    kind: "range", baseParam: PARAM_PATTERN, baseOffset: 0, activeParam: PARAM_PAT_ACTIVE,
    spreadDownParam: PARAM_PAT_SPREAD_DOWN, spreadUpParam: PARAM_PAT_SPREAD_UP,
    minValue: 0, maxValue: 5, // Arp Pattern menu indices
    cycleOnly: true
  },
  octave: {
    kind: "range", baseParam: PARAM_BASE_OCTAVE, baseOffset: 0, activeParam: PARAM_OCT_ACTIVE,
    spreadDownParam: PARAM_OCT_SPREAD_DOWN, spreadUpParam: PARAM_OCT_SPREAD_UP,
    minValue: 1, maxValue: 4, // octaves (Range mode)
    // Transpose mode: the value is base + an octave offset of up to 3 either way
    limits: function() {
      if (GetParameter(PARAM_OCT_MODE) === OCTAVE_TRANSPOSE) {
        var base = GetParameter(PARAM_BASE_OCTAVE);
        return { min: base - 3, max: base + 3 };
      }
      return { min: 1, max: 4 };
    }
  },
  subdiv: {
    kind: "range", baseParam: PARAM_BASE_SUBDIV, baseOffset: 0, activeParam: PARAM_SUB_ACTIVE,
    spreadDownParam: PARAM_SUB_SPREAD_DOWN, spreadUpParam: PARAM_SUB_SPREAD_UP,
    minValue: 0, maxValue: RATE_MAX_POWER, // position = power (1/2^power) within the base rate's family
    baseToPos: function(rateIndex) { return RATES[rateIndex].power; },
    posToValue: function(power) { // -> index into RATES
      return findRate(RATES[GetParameter(PARAM_BASE_SUBDIV)].family, power);
    }
  },
  gate: {
    kind: "scaled", baseParam: PARAM_GATE, baseOffset: 0, activeParam: PARAM_GATE_ACTIVE,
    spreadDownParam: PARAM_GATE_SPREAD_DOWN, spreadUpParam: PARAM_GATE_SPREAD_UP, stepsParam: PARAM_GATE_STEPS,
    minValue: 10, maxValue: 100 // gate %
  },
  velocity: {
    kind: "scaled", baseParam: PARAM_VEL_BASE, baseOffset: 0, activeParam: PARAM_VEL_ACTIVE,
    spreadDownParam: PARAM_VEL_SPREAD_DOWN, spreadUpParam: PARAM_VEL_SPREAD_UP, stepsParam: PARAM_VEL_STEPS,
    minValue: 1, maxValue: 127 // MIDI velocity
  },
  swing: {
    kind: "scaled", baseParam: PARAM_SWING, baseOffset: 0, activeParam: PARAM_SWING_ACTIVE,
    spreadDownParam: PARAM_SWING_SPREAD_DOWN, spreadUpParam: PARAM_SWING_SPREAD_UP, stepsParam: PARAM_SWING_STEPS,
    minValue: 50, maxValue: 75 // swing %
  }
};
var SERIES_NAMES = ["pattern", "octave", "subdiv", "gate", "velocity", "swing"];

// Series state (for Up-Down / Triangle bounce): { name: { pos, dir } }
var seriesState = {};

// Link Series state.
// Shared Phase: a master position from -down..+up (0 = every series at its base), walked with
//   the progression shape; each series maps it onto its own range, so all reach their min, base
//   and max together (series with a shorter range hold values).
// Restart Together: count of advances; all series restart when the longest pass completes.
var linkState = { pos: 0, dir: 1, count: 0 };

// Series Curve state: index into the curve's step list, and direction (for Up-Down)
var curveState = { index: 0, dir: 1, lastRandom: -1 };
for (var si = 0; si < SERIES_NAMES.length; si++) {
  seriesState[SERIES_NAMES[si]] = { pos: 0, dir: 1 };
}

// ----------------------------------------------------------------------------
// DEBUG LOGGING
// ----------------------------------------------------------------------------
// With "Debug Log" on, every line goes to the Scripter console prefixed with [SARP], in a
// format that tests/replay.js can read back (settings, input notes, transport events) to
// re-run the same session outside Logic and compare the generated notes.
var beatsPerBar = 4;           // Updated from the host meter while playing (for bar|beat display)
var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function debugOn() {
  return GetParameter(PARAM_DEBUG) === 1;
}

function log(msg) {
  if (debugOn()) {
    Trace("[SARP] " + msg);
  }
}

// Logic convention: MIDI 60 = C3
function noteName(pitch) {
  return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 2) + "(" + pitch + ")";
}

// "@5.250 [2|1.250]" = absolute beat, then bar | beat within the bar
function fmtBeat(beat) {
  var bar = Math.floor((beat - 1.0) / beatsPerBar + 1e-9);
  var inBar = (beat - 1.0) - bar * beatsPerBar + 1.0;
  return "@" + beat.toFixed(3) + " [" + (bar + 1) + "|" + inBar.toFixed(3) + "]";
}

function fmtParamValue(index) {
  var p = PluginParameters[index];
  var v = GetParameter(index);
  if (p.type === "menu") return p.valueStrings[v];
  if (p.type === "checkbox") return v ? "On" : "Off";
  return String(v);
}

// One line per parameter group (groups are separated by blank comments in PluginParameters,
// so use fixed group sizes matching the layout above)
var SETTINGS_GROUPS = [
  [PARAM_LATCH, PARAM_ADVANCE_TRIGGER, PARAM_PROG_SHAPE, PARAM_LINK, PARAM_GLOBAL_RANGE, PARAM_CURVE],
  [PARAM_PATTERN, PARAM_PAT_ACTIVE, PARAM_PAT_SPREAD_DOWN, PARAM_PAT_SPREAD_UP],
  [PARAM_BASE_OCTAVE, PARAM_OCT_ACTIVE, PARAM_OCT_SPREAD_DOWN, PARAM_OCT_SPREAD_UP, PARAM_OCT_MODE],
  [PARAM_BASE_SUBDIV, PARAM_SUB_ACTIVE, PARAM_SUB_SPREAD_DOWN, PARAM_SUB_SPREAD_UP, PARAM_SUB_TIMING],
  [PARAM_GATE, PARAM_GATE_ACTIVE, PARAM_GATE_SPREAD_DOWN, PARAM_GATE_SPREAD_UP, PARAM_GATE_STEPS],
  [PARAM_VEL_BASE, PARAM_VEL_ACTIVE, PARAM_VEL_SPREAD_DOWN, PARAM_VEL_SPREAD_UP, PARAM_VEL_STEPS],
  [PARAM_SWING, PARAM_SWING_ACTIVE, PARAM_SWING_SPREAD_DOWN, PARAM_SWING_SPREAD_UP, PARAM_SWING_STEPS],
  [PARAM_HUMANIZE_VEL, PARAM_HUMANIZE_GATE],
  [PARAM_CUSTOM_LENGTH, PARAM_CUSTOM_STEP_1, PARAM_CUSTOM_STEP_1 + 1, PARAM_CUSTOM_STEP_1 + 2, PARAM_CUSTOM_STEP_1 + 3,
   PARAM_CUSTOM_STEP_1 + 4, PARAM_CUSTOM_STEP_1 + 5, PARAM_CUSTOM_STEP_1 + 6, PARAM_CUSTOM_STEP_1 + 7]
];

function logSettings() {
  if (!debugOn()) return;
  for (var g = 0; g < SETTINGS_GROUPS.length; g++) {
    var parts = [];
    for (var i = 0; i < SETTINGS_GROUPS[g].length; i++) {
      var index = SETTINGS_GROUPS[g][i];
      parts.push(PluginParameters[index].name + " = " + fmtParamValue(index));
    }
    log("SET " + parts.join(" ; "));
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Immediately stop all notes that were triggered by the arpeggiator
function stopAllSoundingNotes() {
  for (var pitchStr in activeSoundingPitches) {
    if (activeSoundingPitches.hasOwnProperty(pitchStr)) {
      log("FLUSH immediate NoteOff " + noteName(parseInt(pitchStr, 10)));
      var noteOff = new NoteOff();
      noteOff.pitch = parseInt(pitchStr, 10);
      noteOff.velocity = 64;
      noteOff.send();
    }
  }
  activeSoundingPitches = {};
}

// Forget notes whose scheduled NoteOff has already been sent
function pruneSoundingNotes(currentBeat) {
  for (var pitchStr in activeSoundingPitches) {
    if (activeSoundingPitches.hasOwnProperty(pitchStr) && activeSoundingPitches[pitchStr] <= currentBeat) {
      delete activeSoundingPitches[pitchStr];
    }
  }
}

function getActiveNotes() {
  if (GetParameter(PARAM_LATCH)) {
    return latchedNotes.length > 0 ? latchedNotes : heldNotes;
  }
  return heldNotes;
}

// Step length in beats of a rate (index into RATES). In Logic, 1 beat = quarter note (1/4).
function getRateBeats(rateIndex) {
  return RATES[rateIndex].beats;
}

// Snap grid in beats for a rate (index into RATES)
function getRateGrid(rateIndex) {
  return RATES[rateIndex].grid;
}

// Swing timing for a step.
// Steps are paired (on-beat, off-beat); swing (50..75%) is the off-beat's position within the
// pair, so the off-beat is delayed and the pair's time is split swing : (100 - swing).
// Returns { offset, length }: onset delay and the step's swung slot length, in beats.
function getSwingTiming(isOffBeat, stepDuration, swingPercent) {
  var s = swingPercent / 100.0;
  if (!isOffBeat) {
    return { offset: 0, length: 2 * s * stepDuration };
  }
  return { offset: (2 * s - 1) * stepDuration, length: 2 * (1 - s) * stepDuration };
}

// Snap the schedule pointer forward to a grid line, and restart swing pairing so that
// notes on even grid ticks of the current rate are on-beats.
function alignSchedule(beat, gridLength, stepDuration) {
  nextBeatToSchedule = quantizeBeatToGrid(beat, gridLength);
  swingStepCount = Math.round((nextBeatToSchedule - 1.0) / stepDuration) % 2;
}

// Uniform random offset in [-amount, +amount]
function randomOffset(amount) {
  if (amount <= 0) return 0;
  return (Math.random() * 2 - 1) * amount;
}

// Quantize a beat position to the musical grid of a given step duration.
// In Logic, beat 1.0 is the first downbeat of bar 1.
// If beat is slightly off-grid or between grid lines, snap forward to the nearest valid grid line.
function quantizeBeatToGrid(beat, stepDuration) {
  var ticks = (beat - 1.0) / stepDuration;
  var roundedTicks = Math.round(ticks);
  if (Math.abs(ticks - roundedTicks) < 0.001) {
    // Already on the grid (within floating-point tolerance)
    return 1.0 + (roundedTicks * stepDuration);
  }
  // Off the grid: snap forward to the next valid grid tick
  return 1.0 + (Math.ceil(ticks) * stepDuration);
}

function isSeriesActive(name) {
  return !!GetParameter(SERIES[name].activeParam);
}

function getSeriesBase(name) {
  return GetParameter(SERIES[name].baseParam) + SERIES[name].baseOffset;
}

// Position bounds of a series around its base: { minPos, basePos, maxPos }
// A series' spread below / above its base, scaled by the Global Range knob.
// Range series move in whole values, so their scaled spread is rounded to whole steps.
function getEffectiveSpread(name, below) {
  var def = SERIES[name];
  var spread = GetParameter(below ? def.spreadDownParam : def.spreadUpParam);
  var scaled = spread * GetParameter(PARAM_GLOBAL_RANGE) / 100.0;
  return (def.kind === "range") ? Math.round(scaled) : scaled;
}

function getSeriesBounds(name) {
  var def = SERIES[name];
  var spreadDown = getEffectiveSpread(name, true);
  var spreadUp = getEffectiveSpread(name, false);
  if (def.kind === "scaled") {
    var steps = GetParameter(def.stepsParam);
    return {
      minPos: (spreadDown > 0) ? -steps : 0,
      basePos: 0,
      maxPos: (spreadUp > 0) ? steps : 0
    };
  }
  var base = def.baseToPos ? def.baseToPos(GetParameter(def.baseParam)) : getSeriesBase(name);
  var limits = def.limits ? def.limits() : { min: def.minValue, max: def.maxValue };
  return {
    minPos: Math.max(limits.min, base - spreadDown),
    basePos: base,
    maxPos: Math.min(limits.max, base + spreadUp)
  };
}

// Parameter value at a given series position
function getSeriesValueAt(name, pos) {
  var def = SERIES[name];
  if (def.kind === "range") {
    return def.posToValue ? def.posToValue(pos) : pos;
  }
  var base = getSeriesBase(name);
  var steps = GetParameter(def.stepsParam);
  var value = base;
  if (pos < 0) {
    value = base - Math.round((getEffectiveSpread(name, true) * Math.abs(pos)) / steps);
  } else if (pos > 0) {
    value = base + Math.round((getEffectiveSpread(name, false) * pos) / steps);
  }
  return Math.min(def.maxValue, Math.max(def.minValue, value));
}

// Parameter value currently in effect (the base when the series is not active)
function getSeriesValue(name) {
  if (!isSeriesActive(name)) {
    return getSeriesBase(name);
  }
  return getSeriesValueAt(name, seriesState[name].pos);
}

// Step a series value across [minVal, maxVal] according to shape:
// 0 = Up (Sawtooth: min -> max -> min)
// 1 = Down (Sawtooth: max -> min -> max)
// 2 = Up-Down (Triangle: min -> max -> min smoothly)
function stepSeriesValue(currentVal, currentDir, minVal, maxVal, shape) {
  if (minVal >= maxVal) {
    return { val: minVal, dir: 1 };
  }

  var val = currentVal;
  var dir = currentDir;

  // Clamp within bounds
  if (val < minVal) {
    val = minVal;
    dir = 1;
  } else if (val > maxVal) {
    val = maxVal;
    dir = -1;
  }

  if (shape === 0) { // Up: e.g. min -> ... -> max -> min
    val++;
    if (val > maxVal) {
      val = minVal;
    }
    dir = 1;
  } else if (shape === 1) { // Down: e.g. max -> ... -> min -> max
    val--;
    if (val < minVal) {
      val = maxVal;
    }
    dir = -1;
  } else if (shape === 2) { // Up-Down (Triangle)
    if (dir >= 0) {
      val++;
      if (val >= maxVal) {
        val = maxVal;
        dir = -1; // Bounce downward
      }
    } else {
      val--;
      if (val <= minVal) {
        val = minVal;
        dir = 1; // Bounce upward
      }
    }
  }

  return { val: val, dir: dir };
}

// Starting point of a series for the chosen shape:
// Up starts at min, Down starts at max, Up-Down (Triangle) starts at the Base centerpoint
function getSeriesStart(shape, minVal, base, maxVal) {
  if (shape === 0) {
    return { val: minVal, dir: 1 };
  } else if (shape === 1) {
    return { val: maxVal, dir: -1 };
  }
  return { val: base, dir: (base < maxVal) ? 1 : -1 };
}

function resetSeries(name, shape) {
  var b = getSeriesBounds(name);
  var start = getSeriesStart(shape, b.minPos, b.basePos, b.maxPos);
  seriesState[name].pos = start.val;
  seriesState[name].dir = start.dir;
}

// Reset series counters and directions based on chosen shape and ranges around Base
function resetSeriesState() {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    resetSeries(SERIES_NAMES[i], shape);
  }
  var range = getLinkRange();
  var start = getSeriesStart(shape, -range.down, 0, range.up);
  linkState.pos = start.val;
  linkState.dir = start.dir;
  linkState.count = 0;
  if (isCurveActive()) {
    resetCurve();
  }
  lastAdvanceBoundary = null; // time-based triggers start counting from the next note
}

// Length in beats of a time-based Advance Trigger unit, or 0 for cycle/step triggers
function getAdvanceUnitBeats() {
  var trigger = GetParameter(PARAM_ADVANCE_TRIGGER);
  if (trigger === TRIGGER_BEAT) return 1.0;
  if (trigger === TRIGGER_BAR) return beatsPerBar;
  if (trigger === TRIGGER_TWO_BARS) return 2 * beatsPerBar;
  return 0;
}

// ----------------------------------------------------------------------------
// SERIES CURVES
// ----------------------------------------------------------------------------
// A non-linear curve is a list of steps on a 1..8 scale (1 = each series' min, 8 = its max).
// All active series follow the same step list together, each scaled onto its own range.
// The Progression Shape plays the list forward (Up), backward (Down) or forward then back
// (Up-Down); Random picks a step at random, never repeating the previous one.
function isCurveActive() {
  return GetParameter(PARAM_CURVE) !== CURVE_LINEAR;
}

// Step list for the selected curve (values on the 1..8 scale, may be fractional)
function getCurveSteps() {
  var curve = GetParameter(PARAM_CURVE);
  var steps = [];
  var i;
  if (curve === CURVE_ACCELERATING) {
    for (i = 0; i < 8; i++) steps.push(1 + 7 * Math.pow(i / 7, 2));
  } else if (curve === CURVE_DECELERATING) {
    for (i = 0; i < 8; i++) steps.push(1 + 7 * (1 - Math.pow(1 - i / 7, 2)));
  } else if (curve === CURVE_FIBONACCI) {
    steps = [1, 2, 3, 5, 8];
  } else if (curve === CURVE_PRIMES) {
    steps = [2, 3, 5, 7];
  } else if (curve === CURVE_CUSTOM) {
    var length = GetParameter(PARAM_CUSTOM_LENGTH);
    for (i = 0; i < length; i++) steps.push(GetParameter(PARAM_CUSTOM_STEP_1 + i));
  } else { // Random (and Linear, unused): every step of the scale
    for (i = 1; i <= 8; i++) steps.push(i);
  }
  return steps;
}

// A series' position for a step on the 1..8 scale
function getCurvePos(name, step) {
  var b = getSeriesBounds(name);
  return b.minPos + Math.round((step - 1) / 7 * (b.maxPos - b.minPos));
}

// Move every active series to the current curve step (cycleOnly series only at a cycle end)
function applyCurve(isCycleEnd) {
  var steps = getCurveSteps();
  var step = steps[Math.min(curveState.index, steps.length - 1)];
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    if (SERIES[name].cycleOnly && !isCycleEnd) continue;
    seriesState[name].pos = getCurvePos(name, step);
  }
}

function resetCurve() {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  var last = getCurveSteps().length - 1;
  curveState.index = (shape === 1) ? last : 0; // Down plays the list backward
  curveState.dir = (shape === 1) ? -1 : 1;
  curveState.lastRandom = -1;
  if (GetParameter(PARAM_CURVE) === CURVE_RANDOM) {
    curveState.index = pickRandomStep(last + 1);
  }
  applyCurve(true);
}

// Random step index that differs from the previous one
function pickRandomStep(count) {
  var index = Math.floor(Math.random() * count);
  if (count > 1 && index === curveState.lastRandom) {
    index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
  }
  curveState.lastRandom = index;
  return index;
}

// Returns { name: true } for every active series when the curve completes a pass
function advanceCurve(isCycleEnd) {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  var last = getCurveSteps().length - 1;
  var completed = false;
  if (GetParameter(PARAM_CURVE) === CURVE_RANDOM) {
    curveState.index = pickRandomStep(last + 1);
  } else {
    var result = stepSeriesValue(curveState.index, curveState.dir, 0, last, shape);
    curveState.index = result.val;
    curveState.dir = result.dir;
    var startIndex = (shape === 1) ? last : 0;
    var startDir = (shape === 1) ? -1 : 1;
    completed = (last > 0 && curveState.index === startIndex && curveState.dir === startDir);
  }
  applyCurve(isCycleEnd);
  return completed ? allCompleted() : {};
}

// Shared Phase master range: the largest distance below / above the base over active series
function getLinkRange() {
  var down = 0;
  var up = 0;
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    var b = getSeriesBounds(name);
    down = Math.max(down, b.basePos - b.minPos);
    up = Math.max(up, b.maxPos - b.basePos);
  }
  return { down: down, up: up };
}

// Shared Phase: a series' position for a master position (scaled onto the series' own range)
function getLinkedPos(name, masterPos, range) {
  var b = getSeriesBounds(name);
  if (masterPos >= 0) {
    if (range.up === 0) return b.basePos;
    return b.basePos + Math.round(masterPos / range.up * (b.maxPos - b.basePos));
  }
  return b.basePos - Math.round(-masterPos / range.down * (b.basePos - b.minPos));
}

// Number of advances for a series to complete one pass with the given shape
function getPassLength(name, shape) {
  var b = getSeriesBounds(name);
  var span = b.maxPos - b.minPos;
  if (span === 0) return 1;
  return (shape === 2) ? 2 * span : span + 1;
}

// Advance series for all active modulations.
// isCycleEnd: true when called at the end of an arp cycle (cycleOnly series advance only then)
// Returns { name: true } for each series that just completed a full pass (back at its start);
// with Link Series on, all series complete their pass together.
function advanceProgressions(isCycleEnd) {
  if (isCurveActive()) {
    return advanceCurve(isCycleEnd);
  }
  var link = GetParameter(PARAM_LINK);
  if (link === LINK_SHARED) {
    return advanceShared(isCycleEnd);
  }
  if (link === LINK_RESTART) {
    return advanceRestartTogether(isCycleEnd);
  }
  return advanceIndependent(isCycleEnd);
}

// Mark every active series as having completed a pass
function allCompleted() {
  var completed = {};
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    if (isSeriesActive(SERIES_NAMES[i])) completed[SERIES_NAMES[i]] = true;
  }
  return completed;
}

function advanceShared(isCycleEnd) {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  var range = getLinkRange();
  var result = stepSeriesValue(linkState.pos, linkState.dir, -range.down, range.up, shape);
  linkState.pos = result.val;
  linkState.dir = result.dir;
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    if (SERIES[name].cycleOnly && !isCycleEnd) continue; // picks up the shared phase at cycle end
    seriesState[name].pos = getLinkedPos(name, linkState.pos, range);
    seriesState[name].dir = linkState.dir;
  }
  var start = getSeriesStart(shape, -range.down, 0, range.up);
  if (range.down + range.up > 0 && linkState.pos === start.val && linkState.dir === start.dir) {
    return allCompleted();
  }
  return {};
}

function advanceRestartTogether(isCycleEnd) {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  advanceIndependent(isCycleEnd);
  // The longest pass among the series that advance on every trigger (cycleOnly series advance
  // at a different rate with Per Note Step, so they only restart along with the others)
  var perStep = (GetParameter(PARAM_ADVANCE_TRIGGER) === TRIGGER_STEP);
  var longest = 0;
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    if (SERIES[name].cycleOnly && perStep) continue;
    longest = Math.max(longest, getPassLength(name, shape));
  }
  linkState.count++;
  if (longest > 1 && linkState.count >= longest) {
    resetSeriesState();
    return allCompleted();
  }
  return {};
}

function advanceIndependent(isCycleEnd) {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  var completed = {};
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    if (SERIES[name].cycleOnly && !isCycleEnd) continue;
    var b = getSeriesBounds(name);
    var state = seriesState[name];
    var result = stepSeriesValue(state.pos, state.dir, b.minPos, b.maxPos, shape);
    state.pos = result.val;
    state.dir = result.dir;
    var start = getSeriesStart(shape, b.minPos, b.basePos, b.maxPos);
    if (b.minPos < b.maxPos && state.pos === start.val && state.dir === start.dir) {
      completed[name] = true;
    }
  }
  return completed;
}

// Rebuild the note sequence for the current cycle
function rebuildSequence() {
  var baseNotes = getActiveNotes().slice();
  if (baseNotes.length === 0) {
    sequenceNotes = [];
    currentStepIndex = 0;
    return;
  }

  // Octave Range: the series sets how many octaves the cycle spans.
  // Octave Transpose: the cycle always spans Base Octave Range octaves, shifted by the series'
  // offset from the base (same number of notes every cycle, different register).
  var octaves = getSeriesValue("octave");
  var transpose = 0;
  if (GetParameter(PARAM_OCT_MODE) === OCTAVE_TRANSPOSE) {
    transpose = (octaves - GetParameter(PARAM_BASE_OCTAVE)) * 12;
    octaves = GetParameter(PARAM_BASE_OCTAVE);
  }

  // Sort notes by pitch for standard patterns
  var pattern = getSeriesValue("pattern");
  if (pattern !== 4) { // Not "As Played"
    baseNotes.sort(function(a, b) { return a.pitch - b.pitch; });
  }

  // Build multi-octave list
  var expanded = [];
  for (var oct = 0; oct < octaves; oct++) {
    for (var i = 0; i < baseNotes.length; i++) {
      var transposedPitch = baseNotes[i].pitch + (oct * 12) + transpose;
      if (transposedPitch >= 0 && transposedPitch <= 127) {
        expanded.push({
          pitch: transposedPitch,
          velocity: baseNotes[i].velocity
        });
      }
    }
  }

  // Apply pattern direction
  sequenceNotes = [];
  if (expanded.length === 0) return;

  switch (pattern) {
    case 0: // Up
      sequenceNotes = expanded.slice();
      break;
    case 1: // Down
      sequenceNotes = expanded.slice().reverse();
      break;
    case 2: // Up/Down (without repeating top/bottom)
      sequenceNotes = expanded.slice();
      for (var j = expanded.length - 2; j > 0; j--) {
        sequenceNotes.push(expanded[j]);
      }
      break;
    case 3: // Down/Up
      sequenceNotes = expanded.slice().reverse();
      for (var k = expanded.length - 2; k > 0; k--) {
        sequenceNotes.push(expanded[expanded.length - 1 - k]);
      }
      break;
    case 4: // As Played
      sequenceNotes = expanded.slice();
      break;
    case 5: // Random
      sequenceNotes = expanded.slice();
      break;
  }

  if (currentStepIndex >= sequenceNotes.length) {
    currentStepIndex = 0;
  }
}

// ----------------------------------------------------------------------------
// MIDI EVENT HANDLING
// ----------------------------------------------------------------------------

function HandleMIDI(event) {
  var beat = (event.beatPos !== undefined) ? event.beatPos : GetTimingInfo().blockStartBeat;
  if (event instanceof NoteOn && event.velocity > 0) {
    log("IN on " + noteName(event.pitch) + " v" + event.velocity + " " + fmtBeat(beat));
    handleNoteOn(event.pitch, event.velocity, beat);
  } else if (event instanceof NoteOn || event instanceof NoteOff) {
    log("IN off " + noteName(event.pitch) + " " + fmtBeat(beat));
    handleNoteOff(event.pitch);
  } else {
    // Pass CC, PitchBend, etc. directly
    event.send();
  }
}

function handleNoteOn(pitch, velocity, beat) {
  var isLatch = GetParameter(PARAM_LATCH);
  var isNewChord = (heldNotes.length === 0);

  if (isLatch && isNewChord) {
    // Starting a new chord in latch mode replaces the previous latched chord
    stopAllSoundingNotes();
    latchedNotes = [];
  }

  if (isNewChord) {
    // A new chord restarts the series and the pattern, snapped to the grid of its starting rate
    resetSeriesState();
    currentStepIndex = 0;
    pendingRealign = "chord";
    chordStartBeat = (beat !== undefined) ? beat : -1;
    log("CHORD new chord: series and pattern restart");
  }

  // Add to held notes if not already present
  var exists = false;
  for (var i = 0; i < heldNotes.length; i++) {
    if (heldNotes[i].pitch === pitch) {
      heldNotes[i].velocity = velocity;
      exists = true;
      break;
    }
  }
  if (!exists) {
    heldNotes.push({ pitch: pitch, velocity: velocity });
  }

  if (isLatch) {
    var latchedExists = false;
    for (var j = 0; j < latchedNotes.length; j++) {
      if (latchedNotes[j].pitch === pitch) {
        latchedNotes[j].velocity = velocity;
        latchedExists = true;
        break;
      }
    }
    if (!latchedExists) {
      latchedNotes.push({ pitch: pitch, velocity: velocity });
    }
  }

  rebuildSequence();
}

function handleNoteOff(pitch) {
  for (var i = 0; i < heldNotes.length; i++) {
    if (heldNotes[i].pitch === pitch) {
      heldNotes.splice(i, 1);
      break;
    }
  }
  
  if (!GetParameter(PARAM_LATCH)) {
    if (heldNotes.length === 0) {
      // Releasing entire chord kills sounding arp notes immediately
      stopAllSoundingNotes();
    }
    rebuildSequence();
  }
}

// ----------------------------------------------------------------------------
// TIMING & SCHEDULING (ProcessMIDI)
// ----------------------------------------------------------------------------

function ProcessMIDI() {
  var info = GetTimingInfo();

  if (info.meterNumerator && info.meterDenominator) {
    beatsPerBar = info.meterNumerator * 4 / info.meterDenominator;
  }

  // 1. Detect DAW playback start
  if (info.playing && !wasPlaying) {
    wasPlaying = true;
    log("START " + fmtBeat(info.blockStartBeat) + " tempo " + info.tempo +
        (info.cycling ? " cycle " + info.leftCycleBeat + "-" + info.rightCycleBeat : " no-cycle"));
    logSettings();
    lastBlockStartBeat = info.blockStartBeat;
    resetSeriesState();
    currentStepIndex = 0;
    rebuildSequence();
    
    var initialRate = getSeriesValue("subdiv");
    alignSchedule(info.blockStartBeat, getRateGrid(initialRate), getRateBeats(initialRate));
    pendingRealign = null;
    log("ALIGN start -> " + fmtBeat(nextBeatToSchedule) + " (" + RATES[initialRate].name + " grid)");
  }
  
  // 2. Detect DAW playback stop
  if (!info.playing && wasPlaying) {
    wasPlaying = false;
    log("STOP " + fmtBeat(info.blockStartBeat));
    lastBlockStartBeat = -1;
    stopAllSoundingNotes();
    return;
  }

  if (!info.playing) return;

  // 3. Detect DAW Loop Wrap or Backward Jump (e.g. 8-bar loop cycling)
  // Restart like a transport start, so every loop pass plays the same. If the first block after
  // the wrap starts just past the loop start (Logic's block can straddle the loop end), align
  // from the loop start so its downbeat still plays (immediately).
  if (lastBlockStartBeat >= 0 && info.blockStartBeat < lastBlockStartBeat) {
    stopAllSoundingNotes();
    resetSeriesState();
    currentStepIndex = 0;
    rebuildSequence();
    var wrapRate = getSeriesValue("subdiv");
    var wrapFrom = info.blockStartBeat;
    if (info.cycling && info.blockStartBeat >= info.leftCycleBeat && info.blockStartBeat - info.leftCycleBeat < CHORD_LATE_TOLERANCE) {
      wrapFrom = info.leftCycleBeat;
    }
    alignSchedule(wrapFrom, getRateGrid(wrapRate), getRateBeats(wrapRate));
    pendingRealign = null;
    log("LOOP wrap/jump back -> " + fmtBeat(nextBeatToSchedule) + " (" + RATES[wrapRate].name + " grid)");
  }
  lastBlockStartBeat = info.blockStartBeat;
  pruneSoundingNotes(info.blockStartBeat);

  var activeNotes = getActiveNotes();
  if (activeNotes.length === 0 || sequenceNotes.length === 0) {
    if (nextBeatToSchedule < info.blockEndBeat) {
      nextBeatToSchedule = info.blockEndBeat;
    }
    return;
  }

  // 4. Catch up if transport jumped forward or got out of range
  // (the schedule can legitimately run one slowest step, 6 beats, past the block; it can be up to
  // CHORD_LATE_TOLERANCE behind it after a late chord or a loop wrap, where the note plays
  // immediately; and a swung off-beat waits on its straight grid position until its delayed onset)
  var currentRate = getSeriesValue("subdiv");
  var maxSwingDelay = (2 * getSeriesValue("swing") / 100 - 1) * getRateBeats(currentRate);
  if (nextBeatToSchedule < info.blockStartBeat - CHORD_LATE_TOLERANCE - maxSwingDelay ||
      nextBeatToSchedule > info.blockEndBeat + 8.0) {
    var catchRate = getSeriesValue("subdiv");
    alignSchedule(info.blockStartBeat, getRateGrid(catchRate), getRateBeats(catchRate));
    pendingRealign = null;
    log("ALIGN catch-up (transport jump) -> " + fmtBeat(nextBeatToSchedule));
  }

  // A new chord starts from where it was played, not from where the previous chord's schedule
  // left off (which may be beyond this block); it is snapped forward to the grid in the loop
  // below. Starting slightly before the note's beat lets a chord that arrived just after a grid
  // line (or after the block containing it was processed) still start on that line.
  // The note's own beat is only trusted when it is within the tolerance before this block:
  // Logic can deliver a loop-start note (e.g. beat 9.0) in the block that crosses the loop end
  // (beat ~41), and lining up from 9.0 there would put the schedule 32 beats behind.
  if (pendingRealign === "chord") {
    var chordBeat = info.blockStartBeat;
    if (chordStartBeat >= 0 && chordStartBeat <= info.blockStartBeat &&
        info.blockStartBeat - chordStartBeat <= CHORD_LATE_TOLERANCE) {
      chordBeat = chordStartBeat;
    }
    nextBeatToSchedule = chordBeat - CHORD_LATE_TOLERANCE;
  }

  // 5. Schedule notes within the current audio block
  while (nextBeatToSchedule < info.blockEndBeat) {
    if (sequenceNotes.length === 0) break;

    // A. Calculate subdivision duration for this step
    var subdivN = getSeriesValue("subdiv");
    var stepBeatDuration = getRateBeats(subdivN);
    var stepGrid = getRateGrid(subdivN);

    // Grid alignment, per "Subdiv Change Timing":
    //   Snap to Grid: every note snaps forward to its own rate's grid, keeping the phrase anchored
    //                 to the beat (rate changes may leave a gap).
    //   Flow:         notes follow each other with no gaps (each note starts when the previous
    //                 note's step ends), and realign to the beat when the subdivision series
    //                 completes a pass.
    //   Free:         notes follow each other with no gaps and never realign on their own.
    // Requested snaps (all modes):
    //   "chord": to this rate's grid, from now (a new chord ignores where the old one left off)
    //   "rate":  to this rate's grid (rate controls changed by hand)
    //   "beat":  to the beat, or this rate's grid if coarser (Flow: subdivision series completed a pass)
    var timingMode = GetParameter(PARAM_SUB_TIMING);
    var snapToGrid = (timingMode === TIMING_SNAP);
    if (pendingRealign || snapToGrid) {
      var gridLength = (pendingRealign === "beat") ? Math.max(1.0, stepGrid) : stepGrid;
      var beforeAlign = nextBeatToSchedule;
      alignSchedule(nextBeatToSchedule, gridLength, stepBeatDuration);
      // After a late (immediately played) note, resync to a grid line after it, never onto it
      if (lastLateOnset >= 0 && nextBeatToSchedule <= lastLateOnset + 1e-9) {
        alignSchedule(lastLateOnset + gridLength * 0.5, gridLength, stepBeatDuration);
      }
      lastLateOnset = -1;
      if (pendingRealign || nextBeatToSchedule - beforeAlign > 1e-6) {
        log("ALIGN " + (pendingRealign || "snap") + " " + beforeAlign.toFixed(3) + " -> " + fmtBeat(nextBeatToSchedule) +
            " (grid " + gridLength.toFixed(4) + " beats)");
      }
      pendingRealign = null;
      if (nextBeatToSchedule >= info.blockEndBeat) {
        break; // Scheduled note belongs to the next audio block
      }
    }

    // Time-based Advance Trigger (Per Beat / Bar / 2 Bars): when this note is the first in a new
    // beat/bar, advance the series and restart the pattern from the top, then re-evaluate this
    // note with the new values (its rate and grid may have changed)
    var unitBeats = getAdvanceUnitBeats();
    if (unitBeats > 0) {
      var boundary = Math.floor((nextBeatToSchedule - 1.0) / unitBeats + 1e-6);
      if (lastAdvanceBoundary === null || boundary < lastAdvanceBoundary) {
        lastAdvanceBoundary = boundary;
      } else if (boundary > lastAdvanceBoundary) {
        lastAdvanceBoundary = boundary;
        var unitCompleted = advanceProgressions(true);
        if (unitCompleted.subdiv) {
          log("PASS subdivision series completed a pass" + (timingMode === TIMING_FLOW ? " -> realign to beat" : ""));
        }
        currentStepIndex = 0;
        rebuildSequence();
        log("ADVANCE " + (unitBeats === 1.0 ? "beat" : "bar") + " boundary " + fmtBeat(nextBeatToSchedule));
        if (unitCompleted.subdiv && timingMode === TIMING_FLOW) {
          pendingRealign = "beat";
        }
        continue;
      }
    }

    // B. Apply swing: the grid pointer stays on the straight grid; only this note's timing moves
    // (never in the past: a chord that started on a grid line just before this block plays now).
    // A note is only sent in the block where it starts: if swing pushes it past this block, wait.
    // Otherwise a chord released in between would leave the queued note playing after release.
    var swing = getSwingTiming(swingStepCount % 2 === 1, stepBeatDuration, getSeriesValue("swing"));
    var noteOnBeat = Math.max(nextBeatToSchedule + swing.offset, info.blockStartBeat);
    if (noteOnBeat >= info.blockEndBeat) {
      break;
    }

    // C. Select note
    var pattern = getSeriesValue("pattern");
    var noteData;
    if (pattern === 5) { // Random
      var randIdx = Math.floor(Math.random() * sequenceNotes.length);
      noteData = sequenceNotes[randIdx];
    } else {
      noteData = sequenceNotes[currentStepIndex];
    }

    // D. Calculate velocity (series, then humanize)
    var velocity = noteData.velocity;
    if (isSeriesActive("velocity")) {
      velocity = getSeriesValue("velocity");
    }
    velocity = Math.round(velocity + randomOffset(GetParameter(PARAM_HUMANIZE_VEL)));
    velocity = Math.min(127, Math.max(1, velocity));

    // E. Calculate Gate (series, then humanize) & Note-Off Beat, relative to the swung slot
    var gatePercent = getSeriesValue("gate") + randomOffset(GetParameter(PARAM_HUMANIZE_GATE));
    var gate = Math.min(100, Math.max(1, gatePercent)) / 100.0;
    var noteOffBeat = noteOnBeat + swing.length * gate;

    // Prevent stuck notes at loop boundaries (a swung note pushed past the loop end is skipped)
    var playNote = !(info.cycling && noteOnBeat >= info.rightCycleBeat);
    if (info.cycling && noteOffBeat >= info.rightCycleBeat) {
      noteOffBeat = Math.max(noteOnBeat, info.rightCycleBeat - 0.005);
    }

    // F. Emit NoteOn and NoteOff
    if (playNote) {
      var noteOn = new NoteOn();
      noteOn.pitch = noteData.pitch;
      noteOn.velocity = velocity;
      noteOn.sendAtBeat(noteOnBeat);

      var noteOff = new NoteOff();
      noteOff.pitch = noteData.pitch;
      noteOff.velocity = 64;
      noteOff.sendAtBeat(noteOffBeat);

      // Track active sounding pitch until its NoteOff beat
      var prevOffBeat = activeSoundingPitches[noteData.pitch];
      activeSoundingPitches[noteData.pitch] = (prevOffBeat !== undefined) ? Math.max(prevOffBeat, noteOffBeat) : noteOffBeat;
    }

    if (debugOn()) {
      log((playNote ? "OUT " : "SKIP (past loop end) ") + noteName(noteData.pitch) + " v" + velocity + " " + fmtBeat(noteOnBeat) +
          " len " + (noteOffBeat - noteOnBeat).toFixed(3) +
          " | rate " + RATES[subdivN].name + " oct " + getSeriesValue("octave") +
          " pat " + PluginParameters[PARAM_PATTERN].valueStrings[pattern] +
          " gate " + Math.round(gate * 100) + "% swing " + getSeriesValue("swing") + "%" +
          " | step " + (currentStepIndex + 1) + "/" + sequenceNotes.length);
    }

    // G. Advance step index
    var advanceTrigger = GetParameter(PARAM_ADVANCE_TRIGGER);
    var isCycleEnd = false;

    currentStepIndex++;
    if (currentStepIndex >= sequenceNotes.length) {
      currentStepIndex = 0;
      isCycleEnd = true;
    }

    // H. Advance beat pointer by this note's step (before the series changes the rate)
    nextBeatToSchedule += stepBeatDuration;
    swingStepCount++;

    // Safety net: at most one note is played "immediately" (late start). If the schedule is
    // still behind this block, jump forward and snap to the grid instead of firing every
    // missed step at once (which stacks notes into one loud burst).
    if (nextBeatToSchedule < info.blockStartBeat) {
      log("ALIGN behind " + nextBeatToSchedule.toFixed(3) + " -> resync from " + fmtBeat(info.blockStartBeat));
      nextBeatToSchedule = info.blockStartBeat;
      pendingRealign = "rate";
      lastLateOnset = noteOnBeat;
    }

    // I. Advance arithmetic series; realign to the beat when the subdivision series starts over
    if (advanceTrigger === TRIGGER_STEP || (advanceTrigger === TRIGGER_CYCLE && isCycleEnd)) {
      var completed = advanceProgressions(isCycleEnd);
      if (completed.subdiv) {
        log("PASS subdivision series completed a pass" + (timingMode === TIMING_FLOW ? " -> realign to beat" : ""));
      }
      if (completed.subdiv && timingMode === TIMING_FLOW) {
        pendingRealign = "beat";
      }
      rebuildSequence();
    }
  }
}

// ----------------------------------------------------------------------------
// PARAMETER CHANGES & RESET
// ----------------------------------------------------------------------------

function ParameterChanged(param, value) {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  if (wasPlaying && param !== PARAM_DEBUG) {
    log("PARAM " + PluginParameters[param].name + " = " + fmtParamValue(param) + " " + fmtBeat(GetTimingInfo().blockStartBeat));
  }

  // Rate controls changed by hand: snap the next note to the new rate's grid
  var sub = SERIES.subdiv;
  if (param === sub.baseParam || param === sub.activeParam || param === sub.spreadDownParam || param === sub.spreadUpParam ||
      (param === PARAM_GLOBAL_RANGE && isSeriesActive("subdiv"))) {
    pendingRealign = "rate";
  }

  // Restart a series when its position falls outside its bounds, or when its
  // base, active toggle, or the progression shape changes. Linked series (and series following
  // a curve) restart together; changing the curve or its steps restarts it.
  var linked = (GetParameter(PARAM_LINK) !== LINK_OFF) || isCurveActive();
  var resyncAll = (param === PARAM_LINK) || (param === PARAM_CURVE) ||
                  (param >= PARAM_CUSTOM_LENGTH && param <= PARAM_CUSTOM_STEP_1 + 7);
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    var def = SERIES[name];
    var b = getSeriesBounds(name);
    var pos = seriesState[name].pos;
    if (pos < b.minPos || pos > b.maxPos || param === def.activeParam || param === def.baseParam || param === PARAM_PROG_SHAPE) {
      if (linked) {
        resyncAll = true;
      } else {
        resetSeries(name, shape);
      }
    }
  }
  if (param === PARAM_LINK || param === PARAM_CURVE || (linked && (resyncAll || param === PARAM_ADVANCE_TRIGGER))) {
    resetSeriesState();
  }

  rebuildSequence();
}

function Reset() {
  stopAllSoundingNotes();
  heldNotes = [];
  latchedNotes = [];
  sequenceNotes = [];
  currentStepIndex = 0;
  wasPlaying = false;
  lastBlockStartBeat = -1;
  lastLateOnset = -1;
  resetSeriesState();
}
