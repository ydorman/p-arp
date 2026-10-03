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
    name: "Base Octave Range",
    type: "lin",
    minValue: 1,
    maxValue: 4,
    numberOfSteps: 3,
    defaultValue: 1
  },
  {
    name: "Base Subdivision",
    type: "menu",
    valueStrings: ["1/2 (n=1)", "1/4 (n=2)", "1/8 (n=3)", "1/16 (n=4)", "1/32 (n=5)", "1/64 (n=6)"],
    defaultValue: 2 // 1/8 (n=3)
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
    name: "Octave Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Octave Start (n)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 1
  },
  {
    name: "Octave End (n)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 2
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
    name: "Subdiv Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Subdiv Start (n)",
    type: "lin",
    minValue: 1,
    maxValue: 6,
    numberOfSteps: 5,
    defaultValue: 3 // 1/8
  },
  {
    name: "Subdiv End (n)",
    type: "lin",
    minValue: 1,
    maxValue: 6,
    numberOfSteps: 5,
    defaultValue: 5 // 1/32
  },

  // --- VELOCITY SERIES GAUGE ---
  {
    name: "Velocity Mod Active",
    type: "checkbox",
    defaultValue: 0
  },
  {
    name: "Velocity Base",
    type: "lin",
    minValue: 1,
    maxValue: 127,
    numberOfSteps: 126,
    defaultValue: 64
  },
  {
    name: "Velocity Start (n)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 1
  },
  {
    name: "Velocity End (n)",
    type: "lin",
    minValue: 1,
    maxValue: 8,
    numberOfSteps: 7,
    defaultValue: 8
  }
];

// Parameter indices
var PARAM_PATTERN = 0;
var PARAM_BASE_OCTAVE = 1;
var PARAM_BASE_SUBDIV = 2;
var PARAM_GATE = 3;
var PARAM_LATCH = 4;
var PARAM_ADVANCE_TRIGGER = 5;
var PARAM_PROG_SHAPE = 6;

var PARAM_OCT_ACTIVE = 7;
var PARAM_OCT_START = 8;
var PARAM_OCT_END = 9;
var PARAM_OCT_MAX = 10;

var PARAM_SUB_ACTIVE = 11;
var PARAM_SUB_START = 12;
var PARAM_SUB_END = 13;

var PARAM_VEL_ACTIVE = 14;
var PARAM_VEL_BASE = 15;
var PARAM_VEL_START = 16;
var PARAM_VEL_END = 17;

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

var currentVelocityN = 1;
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

// Calculate velocity given n and base: (127 - base) / 8 * n + base
function calculateVelocity(n, base) {
  var vel = Math.round(((127 - base) / 8.0) * n + base);
  return Math.min(127, Math.max(1, vel));
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
function stepSeriesValue(currentVal, currentDir, startN, endN, shape) {
  var minVal = Math.min(startN, endN);
  var maxVal = Math.max(startN, endN);

  if (minVal === maxVal) {
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

  if (shape === 0) { // Up: e.g. 1, 2, 3, 1, 2, 3...
    val++;
    if (val > maxVal) {
      val = minVal;
    }
    dir = 1;
  } else if (shape === 1) { // Down: e.g. 3, 2, 1, 3, 2, 1...
    val--;
    if (val < minVal) {
      val = maxVal;
    }
    dir = -1;
  } else if (shape === 2) { // Up-Down (Triangle): e.g. 1, 2, 3, 2, 1, 2, 3...
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

// Reset series counters and directions based on chosen shape and ranges
function resetSeriesState() {
  var shape = GetParameter(PARAM_PROG_SHAPE);

  // Octave
  var octMin = Math.min(GetParameter(PARAM_OCT_START), GetParameter(PARAM_OCT_END));
  var octMax = Math.max(GetParameter(PARAM_OCT_START), GetParameter(PARAM_OCT_END));
  if (shape === 1) { // Down starts at top
    currentOctaveN = octMax;
    octaveDir = -1;
  } else {
    currentOctaveN = octMin;
    octaveDir = 1;
  }

  // Subdivision
  var subMin = Math.min(GetParameter(PARAM_SUB_START), GetParameter(PARAM_SUB_END));
  var subMax = Math.max(GetParameter(PARAM_SUB_START), GetParameter(PARAM_SUB_END));
  if (shape === 1) { // Down starts at top
    currentSubdivN = subMax;
    subdivDir = -1;
  } else {
    currentSubdivN = subMin;
    subdivDir = 1;
  }

  // Velocity
  var velMin = Math.min(GetParameter(PARAM_VEL_START), GetParameter(PARAM_VEL_END));
  var velMax = Math.max(GetParameter(PARAM_VEL_START), GetParameter(PARAM_VEL_END));
  if (shape === 1) { // Down starts at top
    currentVelocityN = velMax;
    velocityDir = -1;
  } else {
    currentVelocityN = velMin;
    velocityDir = 1;
  }
}

// Advance series for all active modulations
function advanceProgressions() {
  var shape = GetParameter(PARAM_PROG_SHAPE);

  if (GetParameter(PARAM_OCT_ACTIVE)) {
    var octResult = stepSeriesValue(
      currentOctaveN,
      octaveDir,
      GetParameter(PARAM_OCT_START),
      GetParameter(PARAM_OCT_END),
      shape
    );
    currentOctaveN = octResult.val;
    octaveDir = octResult.dir;
  }

  if (GetParameter(PARAM_SUB_ACTIVE)) {
    var subResult = stepSeriesValue(
      currentSubdivN,
      subdivDir,
      GetParameter(PARAM_SUB_START),
      GetParameter(PARAM_SUB_END),
      shape
    );
    currentSubdivN = subResult.val;
    subdivDir = subResult.dir;
  }

  if (GetParameter(PARAM_VEL_ACTIVE)) {
    var velResult = stepSeriesValue(
      currentVelocityN,
      velocityDir,
      GetParameter(PARAM_VEL_START),
      GetParameter(PARAM_VEL_END),
      shape
    );
    currentVelocityN = velResult.val;
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
      velocity = calculateVelocity(currentVelocityN, GetParameter(PARAM_VEL_BASE));
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

  // Octave bounds
  var minOct = Math.min(GetParameter(PARAM_OCT_START), GetParameter(PARAM_OCT_END));
  var maxOct = Math.max(GetParameter(PARAM_OCT_START), GetParameter(PARAM_OCT_END));
  if (currentOctaveN < minOct || currentOctaveN > maxOct || param === PARAM_OCT_ACTIVE || param === PARAM_PROG_SHAPE) {
    currentOctaveN = (shape === 1) ? maxOct : minOct;
    octaveDir = (shape === 1) ? -1 : 1;
  }

  // Subdivision bounds
  var minSub = Math.min(GetParameter(PARAM_SUB_START), GetParameter(PARAM_SUB_END));
  var maxSub = Math.max(GetParameter(PARAM_SUB_START), GetParameter(PARAM_SUB_END));
  if (currentSubdivN < minSub || currentSubdivN > maxSub || param === PARAM_SUB_ACTIVE || param === PARAM_PROG_SHAPE) {
    currentSubdivN = (shape === 1) ? maxSub : minSub;
    subdivDir = (shape === 1) ? -1 : 1;
  }

  // Velocity bounds
  var minVel = Math.min(GetParameter(PARAM_VEL_START), GetParameter(PARAM_VEL_END));
  var maxVel = Math.max(GetParameter(PARAM_VEL_START), GetParameter(PARAM_VEL_END));
  if (currentVelocityN < minVel || currentVelocityN > maxVel || param === PARAM_VEL_ACTIVE || param === PARAM_PROG_SHAPE) {
    currentVelocityN = (shape === 1) ? maxVel : minVel;
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
