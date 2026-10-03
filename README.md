# SARP - Serial & Progressive Arpeggiator Prototypes

A collection of MIDI effect scripts and prototypes for Logic Pro Scripter, exploring progressive and mathematical series modulation applied to arpeggiators and sequencers.

See [Features.md](Features.md) for the product definition and roadmap.

## Projects

### 1. Progressive Arpeggiator (`progressive_arp.js`)
A Logic Pro Scripter MIDI FX plugin whose parameters (Pattern, Octave Range, Subdivision, Gate Length, Velocity) move through a series of values as the arpeggio plays, instead of staying fixed.

#### Key Features
- **Base + Spread series**: Each modulated parameter has a `Base` value (its musical center) plus `Spread (-)` and `Spread (+)` controls that set how far below and above the base the series travels. Moving the base shifts the whole range.
  - **Pattern**: The `Arp Pattern` menu is the base; spread 0–5 steps to neighbouring patterns in menu order (Up, Down, Up/Down, Down/Up, As Played, Random).
  - **Octave Range**: Base 1–4 octaves, spread 0–3 in each direction (clamped to 1–4).
  - **Subdivision ($2^n$)**: Base $1/2$ … $1/64$, spread 0–3 steps slower/faster (clamped to $1/2$ … $1/64$).
  - **Gate Length**: Base 10–100%; 4 steps below and above the base, with the spread (0–90%) setting the total distance on each side (clamped to 10–100%).
  - **Velocity**: Base 1–127; the series has 4 steps below and 4 steps above the base, and the spread (0–64) sets the total velocity distance covered on each side.
- **Mod Active toggles**: Each parameter can be modulated independently; when off it uses its base value.
- **Progression Shape**: How the series traverses its range:
  - `Up` (sawtooth: min → max, then jump back to min)
  - `Down` (sawtooth: max → min, then jump back to max)
  - `Up-Down (Triangle)` (starts at base → max → min → base …)
- **Advance Trigger**: Advance the series once per full arp cycle, or on every note step.
- **Arp Patterns**: Up, Down, Up/Down, Down/Up, As Played, Random; chord latch.
- **Musical Grid Locking**: Note triggers snap to the host subdivision grid, preventing beat drift when rates change or sliders move mid-performance.
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
