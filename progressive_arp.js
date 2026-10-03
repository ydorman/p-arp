/**
 * Progressive Arpeggiator for Logic Pro Scripter
 * 
 * An arpeggiator that modulates parameters (Octave Range, Subdivision, Velocity)
 * across arithmetic progression series (1..8) on each cycle or step.
 */

var NeedsTimingInfo = true;

// ----------------------------------------------------------------------------
// PLUGIN UI PARAMETERS
// ----------------------------------------------------------------------------
var PluginParameters = [
  // --- CORE ARP CONTROLS ---
  {
    name: "Arp Pattern",
    type: "menu",
    valueStrings: ["Up", "Down", "Up/Down", "Down/Up", "As Played", "Random"],
    defaultValue: 2 // Up/Down
  },
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
    name: "Max Octaves (Modulo)",
    type: "lin",
    minValue: 1,
    maxValue: 4,
    numberOfSteps: 3,
    defaultValue: 4
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
var PARAM_PATTERN = 0;
var PARAM_GATE = 1;
var PARAM_LATCH = 2;
var PARAM_ADVANCE_TRIGGER = 3;
var PARAM_PROG_SHAPE = 4;

var PARAM_BASE_OCTAVE = 5;
var PARAM_OCT_ACTIVE = 6;
var PARAM_OCT_SPREAD_DOWN = 7;
var PARAM_OCT_SPREAD_UP = 8;
var PARAM_OCT_MAX = 9;

var PARAM_BASE_SUBDIV = 10;
var PARAM_SUB_ACTIVE = 11;
var PARAM_SUB_SPREAD_DOWN = 12;
var PARAM_SUB_SPREAD_UP = 13;

var PARAM_VEL_BASE = 14;
var PARAM_VEL_ACTIVE = 15;
var PARAM_VEL_SPREAD_DOWN = 16;
var PARAM_VEL_SPREAD_UP = 17;

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
var activeSoundingPitches = {};// Currently ringing notes: { pitch: true }

// Series counters & direction state (for Up-Down / Triangle bounce)
var currentOctaveN = 1;
var octaveDir = 1;

var currentSubdivN = 3;
var subdivDir = 1;

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

// Wrap a series value n according to a max stage modulo
// E.g. for max 4: n=1->1, n=4->4, n=5->1, n=6->2
function moduloStage(n, maxStages) {
  return ((n - 1) % maxStages) + 1;
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

// Reset series counters and directions based on chosen shape and ranges around Base
function resetSeriesState() {
  var shape = GetParameter(PARAM_PROG_SHAPE);

  // Octave (centered on Base Octave Range)
  var oct = getOctaveBounds();
  if (shape === 0) { // Up starts at min
    currentOctaveN = oct.minVal;
    octaveDir = 1;
  } else if (shape === 1) { // Down starts at max
    currentOctaveN = oct.maxVal;
    octaveDir = -1;
  } else { // Up-Down starts at Base centerpoint
    currentOctaveN = oct.base;
    octaveDir = (oct.base < oct.maxVal) ? 1 : -1;
  }

  // Subdivision (centered on Base Subdivision)
  var sub = getSubdivBounds();
  if (shape === 0) { // Up starts at min
    currentSubdivN = sub.minVal;
    subdivDir = 1;
  } else if (shape === 1) { // Down starts at max
    currentSubdivN = sub.maxVal;
    subdivDir = -1;
  } else { // Up-Down starts at Base centerpoint
    currentSubdivN = sub.base;
    subdivDir = (sub.base < sub.maxVal) ? 1 : -1;
  }

  // Velocity (centered on Velocity Base, k=0)
  var vel = getVelocityBounds();
  if (shape === 0) { // Up starts at min
    currentVelocityStep = vel.minK;
    velocityDir = 1;
  } else if (shape === 1) { // Down starts at max
    currentVelocityStep = vel.maxK;
    velocityDir = -1;
  } else { // Up-Down starts at Base centerpoint (k=0)
    currentVelocityStep = 0;
    velocityDir = (vel.maxK > 0) ? 1 : -1;
  }
}

// Advance series for all active modulations
function advanceProgressions() {
  var shape = GetParameter(PARAM_PROG_SHAPE);

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
    var maxOct = GetParameter(PARAM_OCT_MAX);
    octaves = moduloStage(currentOctaveN, maxOct);
  }

  // Sort notes by pitch for standard patterns
  var pattern = GetParameter(PARAM_PATTERN);
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
    latchedNotes.push({ pitch: pitch, velocity: velocity });
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
    var pattern = GetParameter(PARAM_PATTERN);
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
    var gate = GetParameter(PARAM_GATE) / 100.0;
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

    // Track active sounding pitch
    activeSoundingPitches[noteData.pitch] = true;

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

  // Octave bounds around Base Octave
  var oct = getOctaveBounds();
  if (currentOctaveN < oct.minVal || currentOctaveN > oct.maxVal || param === PARAM_OCT_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_BASE_OCTAVE) {
    if (shape === 0) currentOctaveN = oct.minVal;
    else if (shape === 1) currentOctaveN = oct.maxVal;
    else currentOctaveN = oct.base;
    octaveDir = (shape === 1) ? -1 : 1;
  }

  // Subdivision bounds around Base Subdivision
  var sub = getSubdivBounds();
  if (currentSubdivN < sub.minVal || currentSubdivN > sub.maxVal || param === PARAM_SUB_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_BASE_SUBDIV) {
    if (shape === 0) currentSubdivN = sub.minVal;
    else if (shape === 1) currentSubdivN = sub.maxVal;
    else currentSubdivN = sub.base;
    subdivDir = (shape === 1) ? -1 : 1;
  }

  // Velocity bounds around Base Velocity
  var vel = getVelocityBounds();
  if (currentVelocityStep < vel.minK || currentVelocityStep > vel.maxK || param === PARAM_VEL_ACTIVE || param === PARAM_PROG_SHAPE || param === PARAM_VEL_BASE) {
    if (shape === 0) currentVelocityStep = vel.minK;
    else if (shape === 1) currentVelocityStep = vel.maxK;
    else currentVelocityStep = 0;
    velocityDir = (shape === 1) ? -1 : 1;
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
