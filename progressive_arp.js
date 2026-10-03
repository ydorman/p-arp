/**
 * Progressive Arpeggiator for Logic Pro Scripter
 * 
 * An arpeggiator that modulates parameters (Pattern, Octave Range, Subdivision,
 * Gate Length, Velocity) across a series around each parameter's Base value,
 * advancing on each arp cycle or note step.
 */

var NeedsTimingInfo = true;

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
    valueStrings: ["1/2 (n=1)", "1/4 (n=2)", "1/8 (n=3)", "1/16 (n=4)", "1/32 (n=5)", "1/64 (n=6)"],
    defaultValue: 2 // 1/8 (n=3)
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
    maxValue: 3,
    numberOfSteps: 3,
    defaultValue: 1
  },
  {
    name: "Subdiv Spread (+) Faster",
    type: "lin",
    minValue: 0,
    maxValue: 3,
    numberOfSteps: 3,
    defaultValue: 1
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

var PARAM_GATE = 15;
var PARAM_GATE_ACTIVE = 16;
var PARAM_GATE_SPREAD_DOWN = 17;
var PARAM_GATE_SPREAD_UP = 18;

var PARAM_VEL_BASE = 19;
var PARAM_VEL_ACTIVE = 20;
var PARAM_VEL_SPREAD_DOWN = 21;
var PARAM_VEL_SPREAD_UP = 22;

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------
var heldNotes = [];            // Raw held notes: [{ pitch, velocity }]
var latchedNotes = [];         // Notes kept when latch is on
var sequenceNotes = [];        // Expanded notes for current cycle
var currentStepIndex = 0;
var nextBeatToSchedule = 0;
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
// kind "scaled": the series walks steps k = -SCALED_STEPS..+SCALED_STEPS around the base;
//                spreadDown / spreadUp set the total distance covered on each side.
//                Position = k (0 is exactly the base). A side with zero spread has no steps.
//
// baseOffset converts the base parameter to a series value (e.g. subdivision menu index -> n).
var SCALED_STEPS = 4;

var SERIES = {
  pattern: {
    kind: "range", baseParam: PARAM_PATTERN, baseOffset: 0, activeParam: PARAM_PAT_ACTIVE,
    spreadDownParam: PARAM_PAT_SPREAD_DOWN, spreadUpParam: PARAM_PAT_SPREAD_UP,
    minValue: 0, maxValue: 5 // Arp Pattern menu indices
  },
  octave: {
    kind: "range", baseParam: PARAM_BASE_OCTAVE, baseOffset: 0, activeParam: PARAM_OCT_ACTIVE,
    spreadDownParam: PARAM_OCT_SPREAD_DOWN, spreadUpParam: PARAM_OCT_SPREAD_UP,
    minValue: 1, maxValue: 4 // octaves
  },
  subdiv: {
    kind: "range", baseParam: PARAM_BASE_SUBDIV, baseOffset: 1, activeParam: PARAM_SUB_ACTIVE,
    spreadDownParam: PARAM_SUB_SPREAD_DOWN, spreadUpParam: PARAM_SUB_SPREAD_UP,
    minValue: 1, maxValue: 6 // n in 2^n (menu index 0 is 1/2, n=1)
  },
  gate: {
    kind: "scaled", baseParam: PARAM_GATE, baseOffset: 0, activeParam: PARAM_GATE_ACTIVE,
    spreadDownParam: PARAM_GATE_SPREAD_DOWN, spreadUpParam: PARAM_GATE_SPREAD_UP,
    minValue: 10, maxValue: 100 // gate %
  },
  velocity: {
    kind: "scaled", baseParam: PARAM_VEL_BASE, baseOffset: 0, activeParam: PARAM_VEL_ACTIVE,
    spreadDownParam: PARAM_VEL_SPREAD_DOWN, spreadUpParam: PARAM_VEL_SPREAD_UP,
    minValue: 1, maxValue: 127 // MIDI velocity
  }
};
var SERIES_NAMES = ["pattern", "octave", "subdiv", "gate", "velocity"];

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

// Convert subdivision n (2^n) to beat length
// In Logic, 1 beat = quarter note (1/4)
// n=1: 1/2  -> 2.0 beats
// n=2: 1/4  -> 1.0 beat
// n=3: 1/8  -> 0.5 beats
// n=4: 1/16 -> 0.25 beats
// n=5: 1/32 -> 0.125 beats
// n=6: 1/64 -> 0.0625 beats
function getSubdivisionBeatLength(n) {
  return 4.0 / Math.pow(2, n);
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
    return {
      minPos: (spreadDown > 0) ? -SCALED_STEPS : 0,
      basePos: 0,
      maxPos: (spreadUp > 0) ? SCALED_STEPS : 0
    };
  }
  var base = getSeriesBase(name);
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
    return pos;
  }
  var base = getSeriesBase(name);
  var value = base;
  if (pos < 0) {
    value = base - Math.round((GetParameter(def.spreadDownParam) * Math.abs(pos)) / SCALED_STEPS);
  } else if (pos > 0) {
    value = base + Math.round((GetParameter(def.spreadUpParam) * pos) / SCALED_STEPS);
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

// Advance series for all active modulations
function advanceProgressions() {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  for (var i = 0; i < SERIES_NAMES.length; i++) {
    var name = SERIES_NAMES[i];
    if (!isSeriesActive(name)) continue;
    var b = getSeriesBounds(name);
    var state = seriesState[name];
    var result = stepSeriesValue(state.pos, state.dir, b.minPos, b.maxPos, shape);
    state.pos = result.val;
    state.dir = result.dir;
  }
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
  
  if (isLatch && heldNotes.length === 0) {
    // Starting a new chord in latch mode replaces the previous latched chord
    stopAllSoundingNotes();
    latchedNotes = [];
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
    
    var initialSubdivN = getSeriesValue("subdiv");
    nextBeatToSchedule = quantizeBeatToGrid(info.blockStartBeat, getSubdivisionBeatLength(initialSubdivN));
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
    var wrapSubdivN = getSeriesValue("subdiv");
    nextBeatToSchedule = quantizeBeatToGrid(info.blockStartBeat, getSubdivisionBeatLength(wrapSubdivN));
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
  if (nextBeatToSchedule < info.blockStartBeat || nextBeatToSchedule > info.blockEndBeat + 4.0) {
    var catchSubdivN = getSeriesValue("subdiv");
    nextBeatToSchedule = quantizeBeatToGrid(info.blockStartBeat, getSubdivisionBeatLength(catchSubdivN));
  }

  // 5. Schedule notes within the current audio block
  while (nextBeatToSchedule < info.blockEndBeat) {
    if (sequenceNotes.length === 0) break;

    // A. Calculate subdivision duration for this step
    var subdivN = getSeriesValue("subdiv");
    var stepBeatDuration = getSubdivisionBeatLength(subdivN);

    // CRITICAL: Ensure nextBeatToSchedule is locked to this subdivision's musical grid!
    // Prevents fractional beat drift when rates change or sliders are tweaked live.
    nextBeatToSchedule = quantizeBeatToGrid(nextBeatToSchedule, stepBeatDuration);
    if (nextBeatToSchedule >= info.blockEndBeat) {
      break; // Scheduled note belongs to the next audio block
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

    // C. Calculate velocity
    var velocity = noteData.velocity;
    if (isSeriesActive("velocity")) {
      velocity = getSeriesValue("velocity");
    }

    // D. Calculate Gate & Note-Off Beat
    var gate = getSeriesValue("gate") / 100.0;
    var noteLengthBeats = stepBeatDuration * gate;
    var noteOffBeat = nextBeatToSchedule + noteLengthBeats;

    // Prevent stuck notes at loop boundaries
    if (info.cycling && noteOffBeat >= info.rightCycleBeat) {
      noteOffBeat = Math.max(nextBeatToSchedule, info.rightCycleBeat - 0.005);
    }

    // E. Emit NoteOn and NoteOff
    var noteOn = new NoteOn();
    noteOn.pitch = noteData.pitch;
    noteOn.velocity = velocity;
    noteOn.sendAtBeat(nextBeatToSchedule);

    var noteOff = new NoteOff();
    noteOff.pitch = noteData.pitch;
    noteOff.velocity = 64;
    noteOff.sendAtBeat(noteOffBeat);

    // Track active sounding pitch until its NoteOff beat
    var prevOffBeat = activeSoundingPitches[noteData.pitch];
    activeSoundingPitches[noteData.pitch] = (prevOffBeat !== undefined) ? Math.max(prevOffBeat, noteOffBeat) : noteOffBeat;

    // F. Advance step index
    var advanceTrigger = GetParameter(PARAM_ADVANCE_TRIGGER); // 0 = Per Cycle, 1 = Per Step
    var isCycleEnd = false;

    currentStepIndex++;
    if (currentStepIndex >= sequenceNotes.length) {
      currentStepIndex = 0;
      isCycleEnd = true;
    }

    // G. Advance arithmetic series
    if (advanceTrigger === 1) { // Per Note Step
      advanceProgressions();
      rebuildSequence();
    } else if (isCycleEnd) {     // Per Arp Cycle
      advanceProgressions();
      rebuildSequence();
    }

    // Advance beat pointer
    nextBeatToSchedule += stepBeatDuration;
  }
}

// ----------------------------------------------------------------------------
// PARAMETER CHANGES & RESET
// ----------------------------------------------------------------------------

function ParameterChanged(param, value) {
  var shape = GetParameter(PARAM_PROG_SHAPE);

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
