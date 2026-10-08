# SARP - Serial & Progressive Arpeggiator Prototypes

A collection of MIDI effect scripts and prototypes for Logic Pro Scripter, exploring progressive and mathematical series modulation applied to arpeggiators and sequencers.

See [Features.md](Features.md) for the product definition and roadmap.

## Projects

### 1. Progressive Arpeggiator (`progressive_arp.js`)
A Logic Pro Scripter MIDI FX plugin whose parameters (Pattern, Octave Range, Subdivision, Gate Length, Velocity, Swing) move through a series of values as the arpeggio plays, instead of staying fixed.

#### Key Features
- **Base + Spread series**: Each modulated parameter has a `Base` value (its musical center) plus `Spread (-)` and `Spread (+)` controls that set how far below and above the base the series travels. Moving the base shifts the whole range.
  - **Pattern**: The `Arp Pattern` menu is the base; spread 0–5 steps to neighbouring patterns in menu order (Up, Down, Up/Down, Down/Up, As Played, Random).
  - **Octave Range**: Base 1–4 octaves, spread 0–3 in each direction. `Octave Mode`:
    - `Range` (default): each series step adds an octave to the cycle (clamped to 1–4), so the cycle gets longer: a 2-octave cycle repeats the 1-octave notes, then adds the octave above.
    - `Transpose`: the cycle always spans `Base Octave Range` octaves; each step shifts the whole pattern up (or down) an octave, so every cycle has the same number of notes in a different register (up to ±3 octaves).
  - **Subdivision (Rate)**: Base is any of 24 rates from $1/1$ to $1/128$ in straight, dotted and triplet form (menu ordered slowest to fastest: … 1/4, 1/8 dotted, 1/4 triplet, 1/8 …). The series moves in doublings within the base rate's family (1/8 ↔ 1/16, 1/8 triplet ↔ 1/16 triplet, 1/8 dotted ↔ 1/16 dotted). Spread 0–7 doublings slower/faster, clamped to $1/1$ … $1/128$. Dotted rates snap to their pulse grid (1/8 dotted → 1/16 grid).
  - **Gate Length**: Base 10–100%; `Gate Steps (per side)` (1–8, default 4) sets how many steps the series takes below and above the base, and the spread (0–90%) sets the total distance on each side (clamped to 10–100%).
  - **Velocity**: Base 1–127; `Velocity Steps (per side)` (1–8, default 4) sets how many steps the series takes below and above the base, and the spread (0–64) sets the total velocity distance covered on each side. E.g. base 70, spread ±24, 2 steps → 46, 58, 70, 82, 94.
  - **Swing**: Base 50–75% (50% = straight, 66% ≈ triplet feel, 75% = dotted). Steps are swung in pairs at the current subdivision: the off-beat note is delayed and gate length applies to each note's swung slot. Spread (0–25%) and `Swing Steps (per side)` work like Gate/Velocity (clamped to 50–75%).
- **Mod Active toggles**: Each parameter can be modulated independently; when off it uses its base value.
- **Progression Shape**: How the series traverses its range:
  - `Up` (sawtooth: min → max, then jump back to min)
  - `Down` (sawtooth: max → min, then jump back to max)
  - `Up-Down (Triangle)` (starts at base → max → min → base …)
- **Link Series**: How active series move relative to each other:
  - `Off` (default): each series steps one value at a time and wraps at its own length, so series of different lengths drift apart.
  - `Shared Phase`: one shared position walks the progression shape; each series maps it onto its own range, so all reach their min, base and max together (shorter ranges hold values). E.g. velocity walking 9 steps while octave goes 1,1,1,1,1,2,2,3,3.
  - `Restart Together`: each series steps on its own, but all restart when the longest one completes its pass.
- **Global Range**: A master knob (0–100%, default 100%) that scales every series' `Spread (-)` and `Spread (+)` at once, so one gesture widens or narrows the whole progression (0% = everything at its base). Pattern, octave and rate spreads round to whole steps; gate, velocity and swing keep their step count and compress the distance. Works in every Link mode.
- **Series Curve**: The path the series take through their ranges. Steps are on a 1–8 scale (1 = each series' min, 8 = its max), scaled onto every active series' own range; all series follow the same steps together (Link Series has no effect while a curve is selected).
  - `Linear` (default): every series steps through each value of its range.
  - `Accelerating` / `Decelerating`: small steps first and big steps last, or the reverse.
  - `Fibonacci` (1, 2, 3, 5, 8) and `Primes` (2, 3, 5, 7).
  - `Random`: a random step on each advance, never the same twice in a row.
  - `Custom`: `Custom Length` (1–8) and `Custom Step 1–8` (each 1–8) in the Custom Series group, e.g. 1, 5, 6, 8.
  - Progression Shape plays the step list forward (`Up`), backward (`Down`) or forward then back (`Up-Down`); `Random` ignores it.
- **Advance Trigger**: When the series advance:
  - `Per Arp Cycle` / `Per Note Step`: after each full pattern sweep, or on every note. The Pattern series always advances per arp cycle (switching patterns on every note just scrambles them).
  - `Per Beat` / `Per Bar` / `Per 2 Bars`: on the beat/bar grid, regardless of how long each cycle is; the pattern restarts from the top at each boundary. Keeps series that change cycle length (pattern, octave range, rate) aligned with bars and chord changes. A cycle longer than the unit is cut at the boundary (e.g. a 2-octave Range cycle with `Per Beat`).
- **Humanize**: `Humanize Velocity` (±0–40) and `Humanize Gate` (±0–40%) add random variation to each note on top of the series (velocity clamped to 1–127, gate to 1–100%). Timing stays on the grid.
- **Arp Patterns**: Up, Down, Up/Down, Down/Up, As Played, Random; chord latch.
- **Subdiv Change Timing**: How notes are timed when the subdivision changes:
  - `Snap to Grid` (default): each note snaps forward to its own rate's grid, keeping phrases anchored to the beat (a rate change can leave a gap).
  - `Flow (realign each pass)`: notes follow each other with no gaps, so progressions keep their exact rhythm (e.g. 1/16, 1/8, 1/4, 1/2 back to back), then realign to the next beat each time the subdivision series completes a pass. Can sound syncopated.
  - `Free (no snapping)`: notes follow each other with no gaps and never realign on their own; phrases can drift against the bar.
  - In all modes the schedule snaps to the grid when the transport starts, the loop wraps, a new chord is played, or rate controls are changed by hand. A chord played just after a grid line (within a 1/64 note) still starts on that line.
- **Chord & Loop Restart**: Playing a new chord (after releasing all keys, or replacing a latched chord) restarts the series and the pattern from the beginning. Adding notes to a held chord does not. Each DAW loop pass also restarts them, so every pass plays the same, and the loop's downbeat is played even when Logic's audio block straddles the loop end.
- **Stuck Note Protection**: Sounding notes are flushed on DAW cycle wraps, backward jumps, transport stop, and when the chord is released.

## Setup in Logic Pro
1. Create a Software Instrument track in Logic Pro.
2. In the **MIDI FX** slot of the channel strip, select **Scripter**.
3. Open Scripter editor, paste the contents of `progressive_arp.js`, and click **Run Script**.
4. Start Logic's transport — the arpeggiator only plays while the host is playing.

## Recording SARP's Output to MIDI
Scripter can only send MIDI to the next plugin; it can't write regions. To capture the arpeggio as an editable MIDI region, route it to a second track in Logic:

1. Create a second software instrument track (the receiving track).
2. Select it, open the inspector (**I**), and in the **Track** section set **Internal MIDI In** to the track running SARP.
3. Arm the receiving track and record while the source region plays on the SARP track. The generated notes are recorded in real time as a new MIDI region.

Mute or lower one of the two tracks while recording to avoid hearing the part twice.

## Debug Log & Replay
Turn on **Debug Log** (last control) *before* starting Logic's transport. The Scripter console then shows `[SARP]` lines: the settings (`SET`), every input note (`IN`), every generated note with its rate, octave, pattern, gate and step (`OUT`), grid alignments (`ALIGN`), series passes (`PASS`), parameter changes, loop wraps and transport start/stop. Positions are shown as `@absolute-beat [bar|beat]`.

To check a session for bugs, copy the console output to a file (or the clipboard) and replay it outside Logic:

```bash
pbpaste | node tests/replay.js
```

The replay re-creates the settings and input notes in the test mock and compares the generated notes with Logic's, reporting the first difference. A difference means either a bug in the mock's assumptions about Logic or timing that depends on Logic's audio blocks.

## Tests
Scripter has no test framework, so `tests/scripter_mock.js` fakes the parts of the Scripter API the scripts use (`NoteOn`/`NoteOff`, `GetParameter`, `GetTimingInfo`, `Trace`) and loads the script file unmodified in Node. Tests can call the script's functions directly or simulate host playback (blocks of `ProcessMIDI`, cycle wraps, transport stop) and inspect the MIDI it sends.

Requires Node 18+ (no dependencies):

```bash
npm test
```

The script you paste into Scripter is unchanged; tests are a separate safety net and don't replace listening in Logic.
