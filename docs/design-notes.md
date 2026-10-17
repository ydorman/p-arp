# SARP Design Notes

Knowledge gathered while prototyping the Scripter version: how Logic behaves as a host, why
the engine works the way it does, what was tried and rejected, and the plan for the real plugin.
Features.md is the *what*; this file is the *why* and the *gotchas*.

## 1. Logic Pro host behavior (observed in Scripter, confirmed by debug logs / replay)

These apply to the real plugin too (AU MIDI FX gets the same transport and event stream).

- **Incoming events carry their exact beat position** (`Event.beatPos`, e.g. `@13.250`, `@40.881`).
  Use it to align chords, not the block start.
- **Within a block, incoming notes are handled before the block's scheduling** (logs show `IN`
  lines before the `OUT` at the same beat). The replay mock models this.
- **Audio blocks can straddle the loop (cycle) end.** The first block after a wrap can start
  slightly *after* the left locator (e.g. 9.012), so naive grid snapping loses the loop downbeat.
- **Loop-start notes can be delivered in the block that crosses the loop end**, with `beatPos` =
  loop start (e.g. 9.0 while playback is at ~40.99). Trusting that beat caused a 64-note burst
  (+10 dB pop) on the 2nd loop pass. Only trust a note's beat when it is near the current position.
- **Region note-offs at the loop end can arrive after the wrap** (reported at the loop start).
  So at a wrap, a held note may still be "held" when the loop-start note arrives - a new chord
  is then not detected by "all keys released". Hence: loop wraps restart the series explicitly.
- **Region notes can arrive after STOP** (e.g. at the loop end). Harmless, but don't assume
  events only come while playing.
- **Logic's console thins heavy `Trace()` output** ("console bandwidth exceeded, thinning some
  traces") - logs around busy moments (loop wraps) can be incomplete.
- **Scripter parameters are saved/automated by index.** Inserting a control shifts everything
  after it ("Parameters were changed. This may have affected existing automation data.").
  A real plugin should use stable parameter IDs.
- **Note naming:** Logic uses C3 = MIDI 60.
- **AU parameter order (JUCE):** JUCE's AU wrapper sorts the parameter list by version hint, then by
  the AU parameter ID (a hash of the text ID), so with equal version hints Logic's Controls view
  and automation menus come out scrambled. p-arp sets each parameter's version hint to its position
  in the parameter table, which gives the table's order. The AU ID depends only on the text ID, so
  reordering never breaks saved projects. (`JUCE_FORCE_USE_LEGACY_PARAM_IDS` would also give the
  order, but makes IDs positional - the Scripter problem again.)
- **Capturing output as MIDI:** a second software instrument track with **Internal MIDI In** set
  to the SARP track records the generated notes in real time. "Record MIDI to Track Here" on the
  sending track is *not* needed when the source notes come from a region (user-verified).
- Scripter cannot write regions/files; it can only send MIDI to the next plugin.

## 2. Engine design decisions (and why)

- **Base + Spread**: every target has a musical center and a range below/above it; moving the base
  shifts the range. Moving a base by hand restarts that series (kept deliberately: WYSIWYG).
- **Rate series moves in doublings within the base rate's family** (1/8 <-> 1/16, 1/8T <-> 1/16T).
  *Rejected:* stepping through every rate in duration order (1/4, 1/8D, 1/4T, 1/8...) - the user
  found it awful; kept only as a possible opt-in (roadmap #11).
- **Subdiv Change Timing**: `Snap to Grid` is the default because it keeps phrases anchored to the
  beat (the user preferred it by ear). `Flow` (no gaps, realign to the beat each pass) sounded like
  a "syncopation machine" in some cases; `Free` (never realign) was liked for creative use.
- **Chord restart**: a new chord (after all keys released, or replacing a latched chord) restarts
  series + pattern, aligned from the note's beat. A chord up to a 1/64 note late still starts on
  the grid line it missed (its first note plays immediately).
- **Loop restart**: every loop pass restarts series + pattern so passes are identical, and the
  downbeat is caught even when the block straddles the loop end.
- **Safety net**: at most one "late" note is played immediately; if the schedule is still behind,
  it resyncs to the grid instead of firing every missed step. (Note for polyphonic patterns: this
  limits catch-up *steps*, not notes per step.)
- **Notes are only sent in the block where they start.** Swing used to queue an off-beat into a
  later block; releasing the chord in between left a ghost note playing after the release.
  A real plugin must keep its own queue for note-offs and future notes (no `sendAtBeat`).
- **Pattern series is cycle-only**: switching patterns on every note just scrambles them.
- **Link** (was "Link Series": Off / Shared Phase / Restart Together; renamed 2026-10, and
  briefly labeled "Sync" in the plugin UI, dropped because "sync" in music plugins means tempo
  sync): Locked (one position mapped onto every range) and Restart (each steps on its own, all
  restart with the longest pass). Free is the default.
- **Global Range**: one knob, same % on both sides. *Rejected:* separate (-)/(+) knobs.
  Whole-value series round to the nearest step; step-based series compress distance.
- **Series Curve**: steps on a 1-8 scale (1 = min, 8 = max of each series' range), global for all
  series; Link is ignored while a curve is active.
- **Octave Mode**: `Range` (cycle grows by an octave per step - a 2-octave cycle repeats the
  1-octave notes then adds the octave above, which sounds like "low, low, high") vs `Transpose`
  (same notes, shifted register - "low, high"). Both kept; Range is the original definition.
- **Time-based Advance Triggers** (Per Beat / Bar / 2 Bars): advance on the grid and restart the
  pattern at each boundary, so series that change cycle length (pattern, octave range, rate) stay
  aligned with bars. Known limitation: a cycle longer than the unit is cut (e.g. 2-octave Range
  with Per Beat never reaches the high octave).
- **Which series change cycle length**: octave (Range: notes), pattern (notes), rate (time).
  Gate, velocity and swing don't.

## 3. Bugs found and their lessons

- Note burst at loop wrap (stale `beatPos`) -> never trust a position far from "now"; cap catch-up.
- Ghost notes with swing -> don't schedule into future blocks.
- Late chords losing their first step -> align from the event's beat, with a small tolerance.
- Loop downbeat lost when blocks straddle the loop end -> align from the left locator when close.
- Parameter index slip when inserting controls (regex skipped a name with a digit) -> test that
  every `PARAM_` constant points at the control with its name.
- Randomized stress test (60 sessions, all modes) caught two of the above; keep extending it.

## 4. Real plugin plan

- **Name:** user-facing name is **p-arp** (for now); "SARP" stays as the repo/prototype name.
- **Project layout:** `plugin/` with a pure C++ engine (no JUCE dependency, unit-testable), the
  JUCE processor/editor wrapping it, and the web UI.
- **UI stack:** React + TypeScript + Vite. Vite dev server loaded into the plugin's web view during
  development (hot reload inside Logic); static build bundled into the binary for release. Note:
  even in release the UI runs in WKWebView (only the C++ is native code). React overhead is
  negligible here; keep high-frequency live data (playhead, series positions) out of React state:
  draw it in a canvas or update via refs on `requestAnimationFrame`.

- **Framework:** JUCE (C++). Free to use under AGPLv3 (open source) or the free closed-source tier
  under a revenue threshold - check current terms at juce.com/legal before any public release.
- **Format:** AU MIDI FX (`aumi`, "MIDI processor") for Logic first - it sits in the MIDI FX slot
  exactly like Scripter. Other DAWs later (VST3/CLAP MIDI-out support varies; Ableton historically
  needs a routing workaround or Max for Live). Audience for now: the user and some friends.
- **GUI:** JUCE web view UI (WKWebView on macOS): HTML/CSS/JS front end (user has strong web FE
  background), JUCE relays bind controls to parameters (incl. automation gestures), engine state
  (playhead, series positions) sent to the UI as events from a lock-free queue. Dev server with hot
  reload during development; assets bundled into the binary for release.
- **Distribution:** unsigned builds are fine for personal use; sharing smoothly needs an Apple
  Developer account (~$99/yr) to sign + notarize. `auval` must pass for Logic to load the AU.
- **Porting the engine:** the Scripter engine maps onto `processBlock` (MIDI + host transport per
  block). New work: sample-offset scheduling and an own event queue; stable parameter IDs; state
  save/restore. The Node test suite and replay logs are the behavioral spec to port against.
- **Fixed layout, proportional zoom:** like a hardware panel, the UI is designed at one size
  (1000 x 640) and never reflows or wraps; resizing the plugin window (aspect ratio locked,
  75%-150%) scales the whole panel. Chosen over web-style reflow (positions moving around) and
  scrollbars; matches Logic's own plugins (Decapitator-style non-resizable is the simpler variant).
- **UI open items:** hardware-style look (after feedback on functionality); Octave Transpose
  base/span presentation.
- **Hierarchy and controls pass** (user's requirements, references: Logic's Retro Synth and
  Compressor, Soundtoys Decapitator):
  - **On/off is a lit button with an LED**, the label on the button, never a settings-style
    switch (music plugins and hardware don't use switches; the state must read at a glance while
    playing). Progression rows: the row name is the button ("Rate" lit = Rate progression on).
  - **Latch is the largest button** (the most important live control).
  - **Control labels are the largest text** (15px: Pattern, Shape, Advance, Sync, Curve, Rate,
    Octave, Gate...); section titles (SEQUENCE, FEEL) only group, so they are small and quiet
    (11px, faint). Values and menus 13px, scale ends 11px.
  - Selection buttons as big as the space allows (range cells 42px tall); Pattern and the
    Velocity "as played" text may use the empty extras column.
  - Tried and rejected: growing the design size to 1100 x 704 for bigger type: at the same
    window size everything scaled down, so text got no bigger and only the spacing grew.
- **Keyboard focus and host shortcuts:** Logic only gets a key (Space = play/stop) when the web
  view doesn't use it, i.e. when nothing on the page is focused. WebKit doesn't focus buttons on
  click, but menus (`<select>`) keep focus after use and get it back when the plugin window is
  activated again, so Space opened the menu instead of starting playback (reported in Logic).
  The page releases focus after a menu selection and when the window loses focus (`focus.ts`).
- **Window resizing:** Logic doesn't resize AU plugin windows by dragging their edges, and JUCE's
  corner resizer is a JUCE component, hidden under the native web view (WKWebView sits above all
  JUCE components). So the page draws its own grip (bottom-right) and calls the editor's
  `setEditorWidth` native function (screen-coordinate drag, one call per frame; double-click =
  100%); the editor keeps the aspect ratio (75%..150%) and the width is saved with the project.
- **Curve editor:** a popover from the curve preview (also opens when Custom is picked from the
  menu): 8 columns x 8 levels, click or drag across columns to draw, drawing past the end adds
  steps, a stepper sets the length. Opened on a preset it shows the preset's steps; the first
  edit copies them (rounded to whole levels) into the custom steps and switches to Custom, so
  presets are starting points. Steps past the length keep their values (dimmed) for when the
  curve is lengthened again. A drag keeps its own length copy, because plugin parameter values
  come back asynchronously.
- **Curve steps stretch to the range (plugin only):** on the prototype's fixed 1..8 scale (1 =
  min, 8 = max) a curve like 1, 2 rounded to the min on short ranges (pattern Up..Down, octave
  -1..+1), so it played one setting forever (reported in Logic). Now the curve's lowest step maps
  to each range's min and its highest to its max; a flat curve keeps the fixed scale. Linear,
  Accelerating, Decelerating, Fibonacci and Random are unchanged (they span 1..8); Primes (2..7)
  now reaches both ends. Rejected: steps as absolute positions (exact on short ranges, but curves
  drawn up to 8 flatten at the top of a 3-value range, and the presets would all change).
  Differs from the prototype: replaying a plugin log that uses a custom curve or Primes in the
  prototype mock will mismatch.
- **Live view:** a piano roll of the generated notes over the last 2 bars, playhead at 86% so
  sounding notes' tails show. Rate, octave, pattern and gate read directly from the notes'
  placement and length; velocity is the note color (Logic's piano roll scale, purple at 0 to red
  at 127, with a scale on the right). A first version also had one lane per active series under
  the roll; dropped after trying it in Logic: the roll already shows them, the lanes were clutter.
  Pitch range fits the notes in view (grows at once, shrinks slowly, at least an octave); a
  4-octave phrase still reads as a contour at ~3px per semitone. Freezes on the last notes when
  the transport stops. Data: the engine pushes a `LiveNote` per note-on into an SPSC ring, only
  while an editor is open; the editor forwards batches ("liveNotes") at 30 Hz. Time axis = the
  engine's `timeline` (beats played, never jumps back on loop wraps), so the roll scrolls
  continuously through cycles. Canvas drawn each animation frame, playhead extrapolated between
  status updates. A demo feed runs in a plain browser.
- **GUI ideas to tame ~47 controls:** one panel per target with a single on/off; Global Range,
  Link and Series Curve as the main "performance" controls; Custom Series as a visual step
  editor; series visualizer with playhead; debug/humanize in an advanced panel.

### Spike (first step)

Goal: de-risk AU MIDI FX + web view in Logic before building anything else.
1. Minimal JUCE AU MIDI FX ("SARP Spike") passing MIDI through, one test parameter.
2. Web view UI: one knob bound to the parameter via a slider relay, one live value from the
   engine (count of notes passed through); optional dev-server hot reload.
3. Build, ad-hoc sign, install to `~/Library/Audio/Plug-Ins/Components`, run `auval`.
4. In Logic: load in a MIDI FX slot; check knob, automation record/playback, multiple instances,
   memory use.

**Result (2026-10-09):** built with JUCE 8.0.15, passed `auval`, and tested OK in Logic by the
user (MIDI pass-through, live transport in the UI, knob/automation binding, multiple instances).
The AU MIDI FX + web view architecture is validated. Code: `plugin/spike/`.

### Real plugin project (step 1, 2026-10-10)

`plugin/p-arp/`: engine (pure C++20 + dependency-free test harness), JUCE AU MIDI FX shell
(manufacturer `Ydrm`, plugin `Parp`, product "p-arp"; parameter IDs are stable strings), React +
TypeScript + Vite UI embedded as a zip in release builds, loaded from the Vite dev server in
`PARP_UI_DEV_SERVER=ON` builds (hot reload inside Logic, verified). Logic must be restarted to pick
up new C++ code (AU code stays loaded in-process); UI changes don't need it with the dev build.
Next: step 2, port the Scripter engine piece by piece with its tests.

### Engine port (step 2)

Ported to `plugin/p-arp/engine` with the Node tests alongside (same inputs/expected values):
rates + settings + series system (`Progression`), patterns + chord tracking (`Sequence`), and the
scheduler (`Engine`). Test host: `engine/tests/HostSim.h` (48 kHz / 120 BPM = 24000 samples per
beat, so grid positions are whole samples). Differences from the prototype, all deliberate:

- **Own note-off queue** instead of `sendAtBeat`; note-ons only in the block where they start.
  "Stop all sounding notes" flushes the queue, so a sounding note gets exactly one note-off.
- **Incoming notes act at their exact sample**: blocks are processed in segments split at each
  incoming event (Scripter applied a block's input before scheduling it).
- **Output order**: sorted by sample, note-offs before note-ons at the same sample; every note
  is at least 1 sample long.
- **Boundary tolerance** (`beatEpsilon`): a note exactly on a block boundary belongs to the next
  block (floating-point slack made timing depend on block size by 1 sample).
- **Late-note resync fix**: after a late (immediately played) note, the schedule resyncs to a grid
  line *after* it. At rates faster than the 1/16-beat chord tolerance (1/64, 1/128) a chord
  exactly on a grid line otherwise played two notes at the same instant. The Scripter prototype
  has the same latent flaw (rarely triggered there because its chords arrived off-grid).

- **Transport stop releases a latched chord** (the prototype keeps it): each play starts fresh,
  and a region's notes latch again when it plays. Reported as a bug in Logic (a stopped,
  restarted transport kept playing the old latched note).

**Debug log**: same line format as the prototype's `[SARP]` log, so `tests/replay.js` replays
plugin logs in the prototype mock (the plugin drops the "%" unit from three parameter names;
replay accepts both). The engine pushes POD records (`EventLog`) into a lock-free SPSC ring
buffer (8192 records, dropped and counted when full, never blocks); a message-thread timer in
the processor drains, formats and appends them to `~/Library/Logs/p-arp/`. Parameter changes are
logged once per block as PARAM lines (diff against the last logged settings), at the block start.
On/off is saved in the plugin state, not a host parameter (it shouldn't be automatable or show
in Logic's parameter list). Known gap vs. the prototype: the log only has a START line (needed by
replay) when it was on before the transport started.

Environment notes: Xcode is installed at `/Applications/Xcode.app` but `xcode-select` points at the
Command Line Tools - build with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` rather
than changing the system setting. CMake is needed (via Homebrew). The user has an older JUCE
install from a previous project (an AU filter effect); check its version before reusing it.
