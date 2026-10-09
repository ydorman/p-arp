// SARP Spike UI: one knob bound to the "testKnob" parameter through JUCE's slider relay, plus a
// live readout of engine state pushed from C++ as "engineState" events.
import * as Juce from "./index.js";

// ---------------------------------------------------------------------------
// Knob
// ---------------------------------------------------------------------------
const knob = document.getElementById("knob");
const arc = document.getElementById("arc");
const pointer = document.getElementById("pointer");
const knobValue = document.getElementById("knob-value");
const slider = Juce.getSliderState("testKnob");

const START_ANGLE = -135; // degrees, 0 = up
const SWEEP = 270;

function polar(angleDeg, radius) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

function render() {
  const normalised = slider.getNormalisedValue();
  const angle = START_ANGLE + SWEEP * normalised;
  const [sx, sy] = polar(START_ANGLE, 38);
  const [ex, ey] = polar(angle, 38);
  const largeArc = angle - START_ANGLE > 180 ? 1 : 0;
  arc.setAttribute("d", normalised > 0.001 ? `M ${sx} ${sy} A 38 38 0 ${largeArc} 1 ${ex} ${ey}` : "");
  const [px, py] = polar(angle, 30);
  pointer.setAttribute("x2", px);
  pointer.setAttribute("y2", py);
  knobValue.textContent = slider.getScaledValue().toFixed(1);
}

// Host -> UI: parameter changes (automation playback, preset load, the host's own controls)
slider.valueChangedEvent.addListener(render);
slider.propertiesChangedEvent.addListener(render);

// UI -> host: vertical drag; gesture start/end lets Logic record automation
let dragStartY = 0;
let dragStartValue = 0;

knob.addEventListener("pointerdown", (event) => {
  knob.setPointerCapture(event.pointerId);
  dragStartY = event.clientY;
  dragStartValue = slider.getNormalisedValue();
  slider.sliderDragStarted();
});

knob.addEventListener("pointermove", (event) => {
  if (!knob.hasPointerCapture(event.pointerId)) return;
  const sensitivity = event.shiftKey ? 1000 : 200; // pixels for the full range; Shift = fine
  const value = Math.min(1, Math.max(0, dragStartValue + (dragStartY - event.clientY) / sensitivity));
  slider.setNormalisedValue(value);
  render();
});

const endDrag = (event) => {
  if (!knob.hasPointerCapture(event.pointerId)) return;
  knob.releasePointerCapture(event.pointerId);
  slider.sliderDragEnded();
};
knob.addEventListener("pointerup", endDrag);
knob.addEventListener("pointercancel", endDrag);

render();

// ---------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------
const notes = document.getElementById("notes");
const playing = document.getElementById("playing");
const bpm = document.getElementById("bpm");
const ppq = document.getElementById("ppq");

window.__JUCE__.backend.addEventListener("engineState", (state) => {
  notes.textContent = state.noteOnCount;
  playing.textContent = state.playing ? "playing" : "stopped";
  bpm.textContent = state.bpm > 0 ? state.bpm.toFixed(1) : "–";
  ppq.textContent = state.ppq.toFixed(2);
});
