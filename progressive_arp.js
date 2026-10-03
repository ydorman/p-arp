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
    valueStrings: ["Per Arp Cycle", "Per Note Step"],
    defaultValue: 0 // Per Arp Cycle
  },
  {
    name: "Progression Shape",
    type: "menu",
    valueStrings: ["Up", "Down", "Up-Down (Triangle)"],
    defaultValue: 0 // Up
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
    valueStrings: ["Snap to Grid", "Flow (realign each pass)"],
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
  }
];

// Parameter indices
var PARAM_LATCH = 0;
var PARAM_ADVANCE_TRIGGER = 1;
var PARAM_PROG_SHAPE = 2;

var PARAM_PATTERN = 3;
var PARAM_PAT_ACTIVE = 4;
var PARAM_PAT_SPREAD_DOWN = 5;
var PARAM_PAT_SPREAD_UP = 6;

var PARAM_BASE_OCTAVE = 7;
var PARAM_OCT_ACTIVE = 8;
var PARAM_OCT_SPREAD_DOWN = 9;
var PARAM_OCT_SPREAD_UP = 10;

var PARAM_BASE_SUBDIV = 11;
var PARAM_SUB_ACTIVE = 12;
var PARAM_SUB_SPREAD_DOWN = 13;
var PARAM_SUB_SPREAD_UP = 14;
var PARAM_SUB_TIMING = 15;

var PARAM_GATE = 16;
var PARAM_GATE_ACTIVE = 17;
var PARAM_GATE_SPREAD_DOWN = 18;
var PARAM_GATE_SPREAD_UP = 19;
var PARAM_GATE_STEPS = 20;

var PARAM_VEL_BASE = 21;
var PARAM_VEL_ACTIVE = 22;
var PARAM_VEL_SPREAD_DOWN = 23;
var PARAM_VEL_SPREAD_UP = 24;
var PARAM_VEL_STEPS = 25;

var PARAM_SWING = 26;
var PARAM_SWING_ACTIVE = 27;
var PARAM_SWING_SPREAD_DOWN = 28;
var PARAM_SWING_SPREAD_UP = 29;
var PARAM_SWING_STEPS = 30;

var PARAM_HUMANIZE_VEL = 31;
var PARAM_HUMANIZE_GATE = 32;

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------
var heldNotes = [];            // Raw held notes: [{ pitch, velocity }]
var latchedNotes = [];         // Notes kept when latch is on
var sequenceNotes = [];        // Expanded notes for current cycle
var currentStepIndex = 0;
var nextBeatToSchedule = 0;
var pendingRealign = null;     // null | "chord" | "rate" | "beat": snap the next note to a grid before playing it
var swingStepCount = 0;        // Note counter for swing pairing (odd = off-beat)
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
    minValue: 1, maxValue: 4 // octaves
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
for (var si = 0; si < SERIES_NAMES.length; si++) {
  seriesState[SERIES_NAMES[si]] = { pos: 0, dir: 1 };
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Immediately stop all notes that were triggered by the arpeggiator
function stopAllSoundingNotes() {
  for (var pitchStr in activeSoundingPitches) {
    if (activeSoundingPitches.hasOwnProperty(pitchStr)) {
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
function getSeriesBounds(name) {
  var def = SERIES[name];
  var spreadDown = GetParameter(def.spreadDownParam);
  var spreadUp = GetParameter(def.spreadUpParam);
  if (def.kind === "scaled") {
    var steps = GetParameter(def.stepsParam);
    return {
      minPos: (spreadDown > 0) ? -steps : 0,
      basePos: 0,
      maxPos: (spreadUp > 0) ? steps : 0
    };
  }
  var base = def.baseToPos ? def.baseToPos(GetParameter(def.baseParam)) : getSeriesBase(name);
  return {
    minPos: Math.max(def.minValue, base - spreadDown),
    basePos: base,
    maxPos: Math.min(def.maxValue, base + spreadUp)
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
    value = base - Math.round((GetParameter(def.spreadDownParam) * Math.abs(pos)) / steps);
  } else if (pos > 0) {
    value = base + Math.round((GetParameter(def.spreadUpParam) * pos) / steps);
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
}

// Advance series for all active modulations.
// isCycleEnd: true when called at the end of an arp cycle (cycleOnly series advance only then)
// Returns { name: true } for each series that just completed a full pass (back at its start).
function advanceProgressions(isCycleEnd) {
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

  // Determine current octave count
  var octaves = getSeriesValue("octave");

  // Sort notes by pitch for standard patterns
  var pattern = getSeriesValue("pattern");
  if (pattern !== 4) { // Not "As Played"
    baseNotes.sort(function(a, b) { return a.pitch - b.pitch; });
  }

  // Build multi-octave list
  var expanded = [];
  for (var oct = 0; oct < octaves; oct++) {
    for (var i = 0; i < baseNotes.length; i++) {
      var transposedPitch = baseNotes[i].pitch + (oct * 12);
      if (transposedPitch <= 127) {
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
  if (event instanceof NoteOn) {
    if (event.velocity === 0) {
      handleNoteOff(event.pitch);
    } else {
      handleNoteOn(event.pitch, event.velocity);
    }
  } else if (event instanceof NoteOff) {
    handleNoteOff(event.pitch);
  } else {
    // Pass CC, PitchBend, etc. directly
    event.send();
  }
}

function handleNoteOn(pitch, velocity) {
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

  // 1. Detect DAW playback start
  if (info.playing && !wasPlaying) {
    wasPlaying = true;
    lastBlockStartBeat = info.blockStartBeat;
    resetSeriesState();
    currentStepIndex = 0;
    rebuildSequence();
    
    var initialRate = getSeriesValue("subdiv");
    alignSchedule(info.blockStartBeat, getRateGrid(initialRate), getRateBeats(initialRate));
    pendingRealign = null;
  }
  
  // 2. Detect DAW playback stop
  if (!info.playing && wasPlaying) {
    wasPlaying = false;
    lastBlockStartBeat = -1;
    stopAllSoundingNotes();
    return;
  }

  if (!info.playing) return;

  // 3. Detect DAW Loop Wrap or Backward Jump (e.g. 8-bar loop cycling)
  if (lastBlockStartBeat >= 0 && info.blockStartBeat < lastBlockStartBeat) {
    stopAllSoundingNotes();
    var wrapRate = getSeriesValue("subdiv");
    alignSchedule(info.blockStartBeat, getRateGrid(wrapRate), getRateBeats(wrapRate));
    pendingRealign = null;
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
  // (the schedule can legitimately run one slowest step, 6 beats, past the block)
  if (nextBeatToSchedule < info.blockStartBeat || nextBeatToSchedule > info.blockEndBeat + 8.0) {
    var catchRate = getSeriesValue("subdiv");
    alignSchedule(info.blockStartBeat, getRateGrid(catchRate), getRateBeats(catchRate));
    pendingRealign = null;
  }

  // A new chord starts from now, not from where the previous chord's schedule left off
  // (which may be beyond this block); it is snapped to the grid in the loop below
  if (pendingRealign === "chord") {
    nextBeatToSchedule = info.blockStartBeat;
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
    //                 note's step ends), so rate changes keep their exact rhythm; the schedule
    //                 snaps only when requested.
    // Requested snaps (both modes):
    //   "chord": to this rate's grid, from now (a new chord ignores where the old one left off)
    //   "rate":  to this rate's grid (rate controls changed by hand)
    //   "beat":  to the beat, or this rate's grid if coarser (Flow: subdivision series completed a pass)
    var snapToGrid = (GetParameter(PARAM_SUB_TIMING) === 0);
    if (pendingRealign || snapToGrid) {
      var gridLength = (pendingRealign === "beat") ? Math.max(1.0, stepGrid) : stepGrid;
      alignSchedule(nextBeatToSchedule, gridLength, stepBeatDuration);
      pendingRealign = null;
      if (nextBeatToSchedule >= info.blockEndBeat) {
        break; // Scheduled note belongs to the next audio block
      }
    }

    // B. Select note
    var pattern = getSeriesValue("pattern");
    var noteData;
    if (pattern === 5) { // Random
      var randIdx = Math.floor(Math.random() * sequenceNotes.length);
      noteData = sequenceNotes[randIdx];
    } else {
      noteData = sequenceNotes[currentStepIndex];
    }

    // C. Calculate velocity (series, then humanize)
    var velocity = noteData.velocity;
    if (isSeriesActive("velocity")) {
      velocity = getSeriesValue("velocity");
    }
    velocity = Math.round(velocity + randomOffset(GetParameter(PARAM_HUMANIZE_VEL)));
    velocity = Math.min(127, Math.max(1, velocity));

    // D. Apply swing: the grid pointer stays on the straight grid; only this note's timing moves
    var swing = getSwingTiming(swingStepCount % 2 === 1, stepBeatDuration, getSeriesValue("swing"));
    var noteOnBeat = nextBeatToSchedule + swing.offset;

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

    // G. Advance step index
    var advanceTrigger = GetParameter(PARAM_ADVANCE_TRIGGER); // 0 = Per Cycle, 1 = Per Step
    var isCycleEnd = false;

    currentStepIndex++;
    if (currentStepIndex >= sequenceNotes.length) {
      currentStepIndex = 0;
      isCycleEnd = true;
    }

    // H. Advance beat pointer by this note's step (before the series changes the rate)
    nextBeatToSchedule += stepBeatDuration;
    swingStepCount++;

    // I. Advance arithmetic series; realign to the beat when the subdivision series starts over
    if (advanceTrigger === 1 || isCycleEnd) { // Per Note Step, or Per Arp Cycle at cycle end
      var completed = advanceProgressions(isCycleEnd);
      if (completed.subdiv && !snapToGrid) {
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

  // Rate controls changed by hand: snap the next note to the new rate's grid
  var sub = SERIES.subdiv;
  if (param === sub.baseParam || param === sub.activeParam || param === sub.spreadDownParam || param === sub.spreadUpParam) {
    pendingRealign = "rate";
  }

  // Restart a series when its position falls outside its bounds, or when its
  // base, active toggle, or the progression shape changes
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    var def = SERIES[name];
    var b = getSeriesBounds(name);
    var pos = seriesState[name].pos;
    if (pos < b.minPos || pos > b.maxPos || param === def.activeParam || param === def.baseParam || param === PARAM_PROG_SHAPE) {
      resetSeries(name, shape);
    }
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
  resetSeriesState();
}
