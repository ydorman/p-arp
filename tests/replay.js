#!/usr/bin/env node
/**
 * Replay a SARP debug log (copied from Logic's Scripter console) in the Scripter mock,
 * then compare the notes the mock generates with the notes Logic generated.
 *
 * Usage:
 *   node tests/replay.js path/to/log.txt
 *   pbpaste | node tests/replay.js
 *
 * The log must include the START and SET lines (turn "Debug Log" on before starting the
 * transport). IN, PARAM, STOP lines are replayed at their beat positions; OUT/SKIP lines
 * are compared.
 */

const fs = require("fs");
const { loadScript } = require("./scripter_mock");

const SCRIPT = "progressive_arp.js";

function readInput() {
  const file = process.argv[2];
  return file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");
}

// Keep only "[SARP] ..." lines, stripping anything Logic puts before the tag
// (tolerates a clipped "[" from copying the console selection).
function sarpLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/\[?SARP\] /);
      return m ? line.slice(m.index + m[0].length).trim() : null;
    })
    .filter(Boolean);
}

function parseBeat(line) {
  const m = line.match(/@(-?[\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parsePitch(line) {
  const m = line.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : null;
}

// "Name = Value" -> parameter value, using the script's own parameter definitions.
function paramValue(def, text) {
  if (def.type === "menu") {
    const i = def.valueStrings.indexOf(text);
    if (i < 0) throw new Error(`Unknown value "${text}" for menu "${def.name}"`);
    return i;
  }
  if (def.type === "checkbox") return text === "On" ? 1 : 0;
  return parseFloat(text);
}

function parseSetting(defs, assignment) {
  const eq = assignment.lastIndexOf(" = ");
  const name = assignment.slice(0, eq).trim();
  const text = assignment.slice(eq + 3).replace(/\s*@.*$/, "").trim();
  const index = defs.findIndex((d) => d.name === name);
  if (index < 0) throw new Error(`Unknown parameter "${name}"`);
  return { index, value: paramValue(defs[index], text) };
}

function main() {
  const lines = sarpLines(readInput());
  const startLine = lines.find((l) => l.startsWith("START "));
  if (!startLine) {
    console.error("No START line found. Turn on Debug Log before starting Logic's transport.");
    process.exit(1);
  }

  const defs = loadScript(SCRIPT).ctx.PluginParameters;
  const params = {};
  for (const line of lines.filter((l) => l.startsWith("SET "))) {
    for (const assignment of line.slice(4).split(" ; ")) {
      const { index, value } = parseSetting(defs, assignment);
      params[index] = value;
    }
  }
  params[defs.findIndex((d) => d.name === "Debug Log")] = 1;
  const humanized = lines.some((l) => /Humanize (Velocity|Gate)[^;]*= [1-9]/.test(l));

  const host = loadScript(SCRIPT, { params });
  const startBeat = parseBeat(startLine);
  const cycle = startLine.match(/cycle ([\d.]+)-([\d.]+)/);
  if (cycle) host.setCycle(parseFloat(cycle[1]), parseFloat(cycle[2]));
  host.locate(startBeat);

  // Advance the transport to `beat`, playing through a cycle wrap if the beat is behind us.
  let position = startBeat;
  let started = false;
  function playTo(beat) {
    let distance = beat - position;
    if (distance < -1e-9 && cycle) {
      distance = (parseFloat(cycle[2]) - position) + (beat - parseFloat(cycle[1]));
    }
    if (!started) {
      host.play(0); // start the transport (START line) before anything else
      started = true;
    }
    if (distance > 1e-9) host.play(distance);
    position = beat;
  }

  let afterStart = false;
  for (const line of lines) {
    if (line === startLine) afterStart = true;
    if (!afterStart) continue;
    const beat = parseBeat(line);
    if (line.startsWith("IN on ")) {
      playTo(beat);
      const vel = parseInt(line.match(/ v(\d+)/)[1], 10);
      host.noteOn(parsePitch(line), vel, beat);
    } else if (line.startsWith("IN off ")) {
      playTo(beat);
      host.noteOff(parsePitch(line), beat);
    } else if (line.startsWith("PARAM ")) {
      playTo(beat);
      const { index, value } = parseSetting(defs, line.slice(6));
      host.setParam(index, value);
    } else if (line.startsWith("STOP ")) {
      playTo(beat);
      host.stop();
      break;
    }
  }
  if (host.timing.playing) host.stop();

  // Compare generated notes. With humanize on, velocity and length are random, so compare
  // pitch, onset, rate and step only.
  const normalize = (l) => {
    let out = l.replace(/^SKIP \(past loop end\) /, "SKIP ");
    if (humanized) out = out.replace(/ v\d+/, "").replace(/ len [\d.]+/, "").replace(/ gate \d+%/, "");
    return out;
  };
  const isNote = (l) => l.startsWith("OUT ") || l.startsWith("SKIP ");
  const logic = lines.filter(isNote).map(normalize);
  const replay = host.traces.map((t) => t.replace(/^\[SARP\] /, "")).filter(isNote).map(normalize);

  console.log(`Logic generated ${logic.length} notes, replay generated ${replay.length}.` +
    (humanized ? " (Humanize on: comparing pitch, timing and rate only.)" : ""));
  const n = Math.min(logic.length, replay.length);
  for (let i = 0; i < n; i++) {
    if (logic[i] !== replay[i]) {
      console.log(`\nFirst difference at note ${i + 1}:`);
      console.log(`  Logic:  ${logic[i]}`);
      console.log(`  Replay: ${replay[i]}`);
      console.log("\nContext (replay log around it):");
      const all = host.traces.map((t) => t.replace(/^\[SARP\] /, ""));
      const at = all.findIndex((l) => isNote(l) && normalize(l) === replay[i]);
      all.slice(Math.max(0, at - 5), at + 3).forEach((l) => console.log("  " + l));
      process.exitCode = 1;
      return;
    }
  }
  if (logic.length !== replay.length) {
    console.log(`\nThe first ${n} notes match, then the ${logic.length > n ? "Logic" : "replay"} log has more.`);
    process.exitCode = 1;
    return;
  }
  console.log("All notes match.");
}

main();
