# SARP - Serial & Progressive Arpeggiator Prototypes

A collection of MIDI effect scripts and prototypes for Logic Pro Scripter, exploring progressive and mathematical series modulation applied to arpeggiators and sequencers.

## Projects

### 1. Progressive Arpeggiator (`progressive_arp.js`)
A Logic Pro Scripter MIDI FX plugin that modulates parameters (Octave Range, Subdivision, Velocity) dynamically using arithmetic progressions ($1..8$) across arp cycles or note steps.

#### Key Features
- **Dynamic Series Gauges (1..8)**: Apply arithmetic series modulation to:
  - **Octave Range**: Expands or shrinks the octave window cycle-by-cycle (with configurable modulo wrapping).
  - **Subdivisions ($2^n$)**: Powers of 2 rate transitions ($1/2$, $1/4$, $1/8$, $1/16$, $1/32$, $1/64$).
  - **Velocity Curve**: Linear velocity scaling: $\text{round}\left(\frac{127 - \text{base}}{8} \cdot n + \text{base}\right)$.
- **Musical Grid Locking**: Automatic phase quantization prevents beat drift when changing rates or moving sliders mid-performance.
- **DAW Loop Wrap Safety**: Automatic detection of cycle wraps and stops to eliminate stuck/hanging MIDI notes.
- **Chord Latching & Patterns**: Up, Down, Up/Down, Down/Up, As Played, and Random.

## Setup in Logic Pro
1. Create a Software Instrument track in Logic Pro.
2. In the **MIDI FX** slot of the channel strip, select **Scripter**.
3. Open Scripter editor, paste the contents of `progressive_arp.js`, and click **Run Script**.
