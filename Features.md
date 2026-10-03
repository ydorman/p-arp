
# SARP (Progressive Arpeggiator) - Product Definition & Roadmap

## 1. Initial Product Definition

### Concept
Traditional arpeggiators iterate through held chord notes using static, cyclic patterns (e.g. Up, Down, Up/Down) with fixed settings (fixed octave range, fixed subdivision rate, static velocity).

**SARP** introduces an arpeggiator engine whose parameters evolve dynamically across **mathematical progressions (arithmetic series)** as the arpeggio plays.

### Example Walkthrough
When playing a C major chord ($C_4 - E_4 - G_4$):
* **Octave Range Progression ($1..2$)**:
  * Cycle 1 (1 Octave): $C_4 - E_4 - G_4 - E_4 - C_4$
  * Cycle 2 (2 Octaves): $E_4 - G_4 - C_5 - E_5 - G_5 - E_5 - C_5 - G_4 - E_4$
* **Subdivision Progression ($3..5$, where Rate $= 2^n$)**:
  * Pattern cycle 1 plays at $1/8\text{th}$ notes ($2^3 = 8$)
  * Pattern cycle 2 plays at $1/16\text{th}$ notes ($2^4 = 16$)
  * Pattern cycle 3 plays at $1/32\text{nd}$ notes ($2^5 = 32$)
* **Velocity Progression (Formula: $\text{round}\left(\frac{127 - \text{base}}{8} \cdot n + \text{base}\right)$)**:
  * Scales velocities dynamically across the series starting from a configurable base velocity (default 64).

### Core Features (v1 Prototype)
1. **Target Parameters for Series Modulation**:
   * **Octave Range**: Cycle-by-cycle or step-by-step octave expansion with modulo wrapping for targets with fewer stages.
   * **Subdivision**: $2^n$ tempo-synced rates ($1/2, 1/4, 1/8, 1/16, 1/32, 1/64$).
   * **Velocity**: Linear scaling from `base` to 127 based on step $n$.
2. **Series Gauge Controls (1..8)**:
   * **Active Toggle**: Off / On per parameter (default Off = parameter uses base value).
   * **Range Sliders**: Configurable `Start (n)` and `End (n)` bounds ($1..8$).
   * ~~**Modulo Stage Limiter**: Wraps series values if target parameter has fewer steps (e.g. max 4 octaves).~~ *(Removed: superseded by Base + Spread clamping, Feature 3)*
3. **Advance Trigger**:
   * **Per Arp Cycle**: Advances series $n$ after completing a full chord pattern sweep.
   * **Per Note Step**: Advances series $n$ on every individual note tick.
4. **Timing & Safety Engine**:
   * **Host Transport Sync**: Locked to Logic Pro's host clock (`GetTimingInfo()`).
   * **Musical Grid Quantization**: Automatically snaps note triggers to the host subdivision grid, eliminating beat drift when changing rates live.
   * **Loop Boundary & Stop Protection**: Flushes sounding notes on DAW cycle wraps and transport stops to prevent stuck/hanging notes.
   * **Chord Latching & Patterns**: Up, Down, Up/Down, Down/Up, As Played, Random.

---

## 2. Additional Features & Roadmap

1. ✅ **Progression over pattern as target**: Modulates the arp pattern sequence across the series. The `Arp Pattern` menu is the base, and `Spread (-)` / `Spread (+)` select neighbouring patterns in menu order (Up, Down, Up/Down, Down/Up, As Played, Random). *(Status: Implemented)*
2. ✅ **Progression over gate length as target**: Modulates gate length (staccato $\to$ legato). `Gate Length` is the base; like velocity, the series has 4 steps on each side and the spread sets the % distance covered (clamped to 10–100%). *(Status: Implemented)*
3. ✅ **Base as centerpoint of series**: `Base` serves as the primary musical center (Arp Pattern, Base Octave, Base Subdivision, Gate Length, Velocity Base), while `Spread (-)` and `Spread (+)` define how far below and above the base the series modulates. Moving the Base dynamically shifts the entire series range while keeping relative modulation intact. *(Status: Implemented)*
4. **Configurable number of steps**: User-defined step counts instead of hardcoded 1..8 range.
5. **Humanization / Randomization**: Add subtle note length and velocity randomization independent of the series.
6. **Linked series parameters**: A toggle/button to link and progress all active targets in lockstep.
7. **Render output to MIDI region**: Capture/record generated arp notes directly into Logic's arrangement track.
8. ✅ **Progression shape / pattern control**: Control how the series traverses its range:
   * `Up` (sawtooth up: min $\to$ base $\to$ max $\to$ min)
   * `Down` (sawtooth down: max $\to$ base $\to$ min $\to$ max)
   * `Up-Down` (triangle LFO: starts on base $\to$ max $\to$ base $\to$ min $\to$ base)
   *(Status: Implemented)*
9. **Non-linear / custom series**: Ability to define arbitrary sequences (e.g. $1, 5, 6, 8$).
10. **Swing parameter**: Add 'swing' parameter (50% being straight / no swing, and 100% being max swing). Be able to modulate swing dynamically across the series.


