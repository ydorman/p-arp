# SARP - Serial & Progressive Arpeggiator Prototypes

A collection of MIDI effect scripts and prototypes for Logic Pro Scripter, exploring progressive and mathematical series modulation applied to arpeggiators and sequencers.

See [Features.md](Features.md) for the product definition and roadmap.

## Projects

### 1. Progressive Arpeggiator (`progressive_arp.js`)
A Logic Pro Scripter MIDI FX plugin whose parameters (Pattern, Octave Range, Subdivision, Gate Length, Velocity, Swing) move through a series of values as the arpeggio plays, instead of staying fixed.

#### Key Features
- **Base + Spread series**: Each modulated parameter has a `Base` value (its musical center) plus `Spread (-)` and `Spread (+)` controls that set how far below and above the base the series travels. Moving the base shifts the whole range.
  - **Pattern**: The `Arp Pattern` menu is the base; spread 0–5 steps to neighbouring patterns in menu order (Up, Down, Up/Down, Down/Up, As Played, Random).
  - **Octave Range**: Base 1–4 octaves, spread 0–3 in each direction (clamped to 1–4).
  - **Subdivision (Rate)**: Base is any of 24 rates from $1/1$ to $1/128$ in straight, dotted and triplet form (menu ordered slowest to fastest: … 1/4, 1/8 dotted, 1/4 triplet, 1/8 …). The series moves in doublings within the base rate's family (1/8 ↔ 1/16, 1/8 triplet ↔ 1/16 triplet, 1/8 dotted ↔ 1/16 dotted). Spread 0–7 doublings slower/faster, clamped to $1/1$ … $1/128$. Dotted rates snap to their pulse grid (1/8 dotted → 1/16 grid).
  - **Gate Length**: Base 10–100%; `Gate Steps (per side)` (1–8, default 4) sets how many steps the series takes below and above the base, and the spread (0–90%) sets the total distance on each side (clamped to 10–100%).
  - **Velocity**: Base 1–127; `Velocity Steps (per side)` (1–8, default 4) sets how many steps the series takes below and above the base, and the spread (0–64) sets the total velocity distance covered on each side. E.g. base 70, spread ±24, 2 steps → 46, 58, 70, 82, 94.
  - **Swing**: Base 50–75% (50% = straight, 66% ≈ triplet feel, 75% = dotted). Steps are swung in pairs at the current subdivision: the off-beat note is delayed and gate length applies to each note's swung slot. Spread (0–25%) and `Swing Steps (per side)` work like Gate/Velocity (clamped to 50–75%).
- **Mod Active toggles**: Each parameter can be modulated independently; when off it uses its base value.
- **Progression Shape**: How the series traverses its range:
  - `Up` (sawtooth: min → max, then jump back to min)
  - `Down` (sawtooth: max → min, then jump back to max)
  - `Up-Down (Triangle)` (starts at base → max → min → base …)
- **Advance Trigger**: Advance the series once per full arp cycle, or on every note step. The Pattern series always advances per arp cycle (switching patterns on every note just scrambles them).
- **Humanize**: `Humanize Velocity` (±0–40) and `Humanize Gate` (±0–40%) add random variation to each note on top of the series (velocity clamped to 1–127, gate to 1–100%). Timing stays on the grid.
- **Arp Patterns**: Up, Down, Up/Down, Down/Up, As Played, Random; chord latch.
- **Subdiv Change Timing**: How notes are timed when the subdivision changes:
  - `Snap to Grid` (default): each note snaps forward to its own rate's grid, keeping phrases anchored to the beat (a rate change can leave a gap).
  - `Flow (realign each pass)`: notes follow each other with no gaps, so progressions keep their exact rhythm (e.g. 1/16, 1/8, 1/4, 1/2 back to back), then realign to the next beat each time the subdivision series completes a pass. Can sound syncopated.
  - In both modes the schedule snaps to the grid when the transport starts, the loop wraps, a new chord is played, or rate controls are changed by hand.
- **Chord Restart**: Playing a new chord (after releasing all keys, or replacing a latched chord) restarts the series and the pattern from the beginning. Adding notes to a held chord does not.
- **Stuck Note Protection**: Sounding notes are flushed on DAW cycle wraps, backward jumps, transport stop, and when the chord is released.

## Setup in Logic Pro
1. Create a Software Instrument track in Logic Pro.
2. In the **MIDI FX** slot of the channel strip, select **Scripter**.
3. Open Scripter editor, paste the contents of `progressive_arp.js`, and click **Run Script**.
4. Start Logic's transport — the arpeggiator only plays while the host is playing.

## Tests
Scripter has no test framework, so `tests/scripter_mock.js` fakes the parts of the Scripter API the scripts use (`NoteOn`/`NoteOff`, `GetParameter`, `GetTimingInfo`, `Trace`) and loads the script file unmodified in Node. Tests can call the script's functions directly or simulate host playback (blocks of `ProcessMIDI`, cycle wraps, transport stop) and inspect the MIDI it sends.

Requires Node 18+ (no dependencies):

```bash
npm test
```

The script you paste into Scripter is unchanged; tests are a separate safety net and don't replace listening in Logic.
