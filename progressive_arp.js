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

// Series counters & direction state (for Up-Down / Triangle bounce)
var currentPatternN = 2;       // Arp Pattern menu index 0..5
var patternDir = 1;

var currentOctaveN = 1;
var octaveDir = 1;

var currentSubdivN = 3;
var subdivDir = 1;

var currentGateStep = 0;       // -4 to +4 (0 is exact base)
var gateDir = 1;

var currentVelocityStep = 0;   // -4 to +4 (0 is exact base)
var velocityDir = 1;

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

// Calculate velocity given step k (-4..+4) around Velocity Base
function calculateVelocity(k) {
  var base = GetParameter(PARAM_VEL_BASE);
  if (!GetParameter(PARAM_VEL_ACTIVE)) {
    return base;
  }
  var spreadDown = GetParameter(PARAM_VEL_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_VEL_SPREAD_UP);

  var vel = base;
  if (k < 0) {
    vel = base - Math.round((spreadDown * Math.abs(k)) / 4.0);
  } else if (k > 0) {
    vel = base + Math.round((spreadUp * k) / 4.0);
  }
  return Math.min(127, Math.max(1, vel));
}

// Calculate gate length (%) given step k (-4..+4) around the Gate Length base
function calculateGate(k) {
  var base = GetParameter(PARAM_GATE);
  if (!GetParameter(PARAM_GATE_ACTIVE)) {
    return base;
  }
  var spreadDown = GetParameter(PARAM_GATE_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_GATE_SPREAD_UP);

  var gate = base;
  if (k < 0) {
    gate = base - Math.round((spreadDown * Math.abs(k)) / 4.0);
  } else if (k > 0) {
    gate = base + Math.round((spreadUp * k) / 4.0);
  }
  return Math.min(100, Math.max(10, gate));
}

// Arp pattern currently in effect (series value when Pattern Mod is active)
function getCurrentPattern() {
  if (GetParameter(PARAM_PAT_ACTIVE)) {
    return currentPatternN;
  }
  return GetParameter(PARAM_PATTERN);
}

// Compute dynamic Pattern bounds around the Arp Pattern menu (in menu order)
function getPatternBounds() {
  var base = GetParameter(PARAM_PATTERN);
  var spreadDown = GetParameter(PARAM_PAT_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_PAT_SPREAD_UP);
  var minVal = Math.max(0, base - spreadDown);
  var maxVal = Math.min(5, base + spreadUp);
  return { base: base, minVal: minVal, maxVal: maxVal };
}

// Compute dynamic Octave bounds around Base Octave
function getOctaveBounds() {
  var base = GetParameter(PARAM_BASE_OCTAVE);
  var spreadDown = GetParameter(PARAM_OCT_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_OCT_SPREAD_UP);
  var minVal = Math.max(1, base - spreadDown);
  var maxVal = Math.min(4, base + spreadUp);
  return { base: base, minVal: minVal, maxVal: maxVal };
}

// Compute dynamic Subdivision bounds around Base Subdivision
function getSubdivBounds() {
  var base = GetParameter(PARAM_BASE_SUBDIV) + 1; // 1..6
  var spreadDown = GetParameter(PARAM_SUB_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_SUB_SPREAD_UP);
  var minVal = Math.max(1, base - spreadDown);
  var maxVal = Math.min(6, base + spreadUp);
  return { base: base, minVal: minVal, maxVal: maxVal };
}

// Compute dynamic Velocity step bounds around Base Velocity
function getVelocityBounds() {
  var spreadDown = GetParameter(PARAM_VEL_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_VEL_SPREAD_UP);
  var minK = (spreadDown > 0) ? -4 : 0;
  var maxK = (spreadUp > 0) ? 4 : 0;
  return { baseK: 0, minK: minK, maxK: maxK };
}

// Compute dynamic Gate step bounds around the Gate Length base
function getGateBounds() {
  var spreadDown = GetParameter(PARAM_GATE_SPREAD_DOWN);
  var spreadUp = GetParameter(PARAM_GATE_SPREAD_UP);
  var minK = (spreadDown > 0) ? -4 : 0;
  var maxK = (spreadUp > 0) ? 4 : 0;
  return { baseK: 0, minK: minK, maxK: maxK };
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

function resetPatternSeries(shape) {
  var pat = getPatternBounds();
  var start = getSeriesStart(shape, pat.minVal, pat.base, pat.maxVal);
  currentPatternN = start.val;
  patternDir = start.dir;
}

function resetOctaveSeries(shape) {
  var oct = getOctaveBounds();
  var start = getSeriesStart(shape, oct.minVal, oct.base, oct.maxVal);
  currentOctaveN = start.val;
  octaveDir = start.dir;
}

function resetSubdivSeries(shape) {
  var sub = getSubdivBounds();
  var start = getSeriesStart(shape, sub.minVal, sub.base, sub.maxVal);
  currentSubdivN = start.val;
  subdivDir = start.dir;
}

function resetGateSeries(shape) {
  var gate = getGateBounds();
  var start = getSeriesStart(shape, gate.minK, gate.baseK, gate.maxK);
  currentGateStep = start.val;
  gateDir = start.dir;
}

function resetVelocitySeries(shape) {
  var vel = getVelocityBounds();
  var start = getSeriesStart(shape, vel.minK, vel.baseK, vel.maxK);
  currentVelocityStep = start.val;
  velocityDir = start.dir;
}

// Reset series counters and directions based on chosen shape and ranges around Base
function resetSeriesState() {
  var shape = GetParameter(PARAM_PROG_SHAPE);
  resetPatternSeries(shape);
  resetOctaveSeries(shape);
  resetSubdivSeries(shape);
  resetGateSeries(shape);
  resetVelocitySeries(shape);
}

// Advance series for all active modulations
function advanceProgressions() {
  var shape = GetParameter(PARAM_PROG_SHAPE);

  if (GetParameter(PARAM_PAT_ACTIVE)) {
    var pat = getPatternBounds();
    var patResult = stepSeriesValue(
      currentPatternN,
      patternDir,
      pat.minVal,
      pat.maxVal,
      shape
    );
    currentPatternN = patResult.val;
    patternDir = patResult.dir;
  }

  if (GetParameter(PARAM_OCT_ACTIVE)) {
    var oct = getOctaveBounds();
    var octResult = stepSeriesValue(
      currentOctaveN,
      octaveDir,
      oct.minVal,
      oct.maxVal,
      shape
    );
    currentOctaveN = octResult.val;
    octaveDir = octResult.dir;
  }

  if (GetParameter(PARAM_SUB_ACTIVE)) {
    var sub = getSubdivBounds();
    var subResult = stepSeriesValue(
      currentSubdivN,
      subdivDir,
      sub.minVal,
      sub.maxVal,
      shape
    );
    currentSubdivN = subResult.val;
    subdivDir = subResult.dir;
  }

  if (GetParameter(PARAM_GATE_ACTIVE)) {
    var gate = getGateBounds();
    var gateResult = stepSeriesValue(
      currentGateStep,
      gateDir,
      gate.minK,
      gate.maxK,
      shape
    );
    currentGateStep = gateResult.val;
    gateDir = gateResult.dir;
  }

  if (GetParameter(PARAM_VEL_ACTIVE)) {
    var vel = getVelocityBounds();
    var velResult = stepSeriesValue(
      currentVelocityStep,
      velocityDir,
      vel.minK,
      vel.maxK,
      shape
    );
    currentVelocityStep = velResult.val;
    velocityDir = velResult.dir;
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
  var octaves = GetParameter(PARAM_BASE_OCTAVE);
  if (GetParameter(PARAM_OCT_ACTIVE)) {
    octaves = currentOctaveN;
  }

  // Sort notes by pitch for standard patterns
  var pattern = getCurrentPattern();
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
    
    var initialSubdivN = GetParameter(PARAM_SUB_ACTIVE) ? currentSubdivN : (GetParameter(PARAM_BASE_SUBDIV) + 1);
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
    var wrapSubdivN = GetParameter(PARAM_SUB_ACTIVE) ? currentSubdivN : (GetParameter(PARAM_BASE_SUBDIV) + 1);
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
    var catchSubdivN = GetParameter(PARAM_SUB_ACTIVE) ? currentSubdivN : (GetParameter(PARAM_BASE_SUBDIV) + 1);
    nextBeatToSchedule = quantizeBeatToGrid(info.blockStartBeat, getSubdivisionBeatLength(catchSubdivN));
  }

  // 5. Schedule notes within the current audio block
  while (nextBeatToSchedule < info.blockEndBeat) {
    if (sequenceNotes.length === 0) break;

    // A. Calculate subdivision duration for this step
    var subdivN = (GetParameter(PARAM_BASE_SUBDIV) + 1); // menu index 0 is 1/2 (n=1)
    if (GetParameter(PARAM_SUB_ACTIVE)) {
      subdivN = currentSubdivN;
    }
    var stepBeatDuration = getSubdivisionBeatLength(subdivN);

    // CRITICAL: Ensure nextBeatToSchedule is locked to this subdivision's musical grid!
    // Prevents fractional beat drift when rates change or sliders are tweaked live.
    nextBeatToSchedule = quantizeBeatToGrid(nextBeatToSchedule, stepBeatDuration);
    if (nextBeatToSchedule >= info.blockEndBeat) {
      break; // Scheduled note belongs to the next audio block
    }

    // B. Select note
    var pattern = getCurrentPattern();
    var noteData;
    if (pattern === 5) { // Random
      var randIdx = Math.floor(Math.random() * sequenceNotes.length);
      noteData = sequenceNotes[randIdx];
    } else {
      noteData = sequenceNotes[currentStepIndex];
    }

    // C. Calculate velocity
    var velocity = noteData.velocity;
    if (GetParameter(PARAM_VEL_ACTIVE)) {
      velocity = calculateVelocity(currentVelocityStep);
    }

    // D. Calculate Gate & Note-Off Beat
    var gate = calculateGate(currentGateStep) / 100.0;
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

  // Pattern bounds around Arp Pattern
  var pat = getPatternBounds();
  if (currentPatternN < pat.minVal || currentPatternN > pat.maxVal || param === PARAM_PAT_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_PATTERN) {
    resetPatternSeries(shape);
  }

  // Octave bounds around Base Octave
  var oct = getOctaveBounds();
  if (currentOctaveN < oct.minVal || currentOctaveN > oct.maxVal || param === PARAM_OCT_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_BASE_OCTAVE) {
    resetOctaveSeries(shape);
  }

  // Subdivision bounds around Base Subdivision
  var sub = getSubdivBounds();
  if (currentSubdivN < sub.minVal || currentSubdivN > sub.maxVal || param === PARAM_SUB_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_BASE_SUBDIV) {
    resetSubdivSeries(shape);
  }

  // Gate bounds around Gate Length base
  var gate = getGateBounds();
  if (currentGateStep < gate.minK || currentGateStep > gate.maxK || param === PARAM_GATE_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_GATE) {
    resetGateSeries(shape);
  }

  // Velocity bounds around Base Velocity
  var vel = getVelocityBounds();
  if (currentVelocityStep < vel.minK || currentVelocityStep > vel.maxK || param === PARAM_VEL_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_VEL_BASE) {
    resetVelocitySeries(shape);
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
