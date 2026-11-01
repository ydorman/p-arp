# p-arp User Manual

**p-arp** is a progressive arpeggiator for Logic Pro. Like any arpeggiator, it turns the chord you
hold into a stream of notes. What makes it different: its settings don't have to stay put. The
rate, the octave range, the pattern, the gate, the velocity and the swing can each move through a
range of values as the arpeggio plays: a phrase that speeds up over a bar, climbs an octave each
cycle, swells in velocity toward the end of a loop, or drifts in and out of swing.

Version 0.1 · Audio Unit MIDI FX for Logic Pro

---

## Contents

1. [Installing](#1-installing)
2. [Quick start](#2-quick-start)
3. [The window](#3-the-window)
4. [The arpeggiator](#4-the-arpeggiator)
5. [Progressions](#5-progressions)
6. [Shaping the progressions](#6-shaping-the-progressions)
7. [How playback behaves](#7-how-playback-behaves)
8. [Recipes](#8-recipes)
9. [Presets](#9-presets)
10. [Automation and recording](#10-automation-and-recording)
11. [Troubleshooting](#11-troubleshooting)
12. [Parameter reference](#12-parameter-reference)

---

## 1. Installing

**Requirements:** Logic Pro on macOS 12 or later, Apple Silicon or Intel. 

1. Copy `p-arp.component` into your Components folder: `~/Library/Audio/Plug-Ins/Components/`
   (in Finder: **Go → Go to Folder…** and paste the path).
2. Restart Logic. It checks new plugins when it starts.

**If p-arp doesn't show up, or Logic says it failed validation:** this version isn't signed yet with an
Apple developer certificate, and macOS may block downloaded plugins that aren't. Quit Logic, open
Terminal and run:

```
xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/Components/p-arp.component
```

Then start Logic, open **Logic Pro → Settings → Plug-in Manager**, select p-arp and click
**Reset & Rescan Selection**.

**Updating:** replace `p-arp.component` with the new one and restart Logic.

---

## 2. Quick start

1. Create a **Software Instrument** track with any instrument.
2. Click the **MIDI FX** slot above the instrument and choose **Audio Units → p-arp → p-arp**.
3. **Start Logic's transport.** p-arp follows Logic's clock and plays only while the transport runs.
4. Hold a chord. You hear an Up/Down arpeggio in 1/8 notes.
5. Turn on **Latch** to keep it playing after you let go.

With every progression switched off, p-arp is a regular arpeggiator. To hear what makes it
different, turn on one progression, for example **Octave**: click the **Octave** button so it
lights up, then drag the range handle to the right. Each arp cycle now climbs an octave.

Or start from a factory preset: open the preset menu at the top of the plugin window.

---

## 3. The window

<!-- TODO: screenshot of the p-arp window in Logic: images/window.png -->

From top to bottom:

- **Performance strip:** **Latch**, the base **Pattern**, and the controls that shape all
  progressions at once: **Shape**, **Advance**, **Link**, **Curve**.
- **Live view:** a scrolling piano roll of the notes p-arp plays, with the **Depth** knob next to it.
- **Sequence panel:** what plays and when: **Rate**, **Octave**, **Pattern**.
- **Feel panel:** how each note sounds: **Gate**, **Velocity**, **Swing**, **Humanize**.

### The live view

The live view scrolls the last two bars of notes p-arp plays, as a piano roll. Rate, octave,
pattern and gate show in where the notes sit and how long they are; **velocity** shows as color,
like Logic's piano roll (the color scale is on the right). The pitch
range follows the notes you play. When the transport stops, the view freezes on the last notes.

### Working with the controls

- **Lit Buttons** switch something on or off. Lit means on.
- **Range bars** (the rows in Sequence and Feel) are explained in [Progressions](#5-progressions).
- **Knobs:** drag up or down. Hold **Shift** for fine adjustment. Double-click to reset to the
  default.
- **Typing a value:** double-click a number (for example a range bar's value or a knob's value),
  type, and press **Enter**. **Esc** cancels.
- **Menus:** click to open, click an option to choose it.

Your keyboard shortcuts keep working while the p-arp window is in front: **Space** still starts and
stops Logic's transport.

---

## 4. The arpeggiator

These controls make p-arp a complete arpeggiator on their own.

### Latch

When **Latch** is on, the arpeggio keeps playing the last chord after
you release the keys. Playing a new chord (after releasing all keys) replaces it. Stopping Logic's
transport releases the latched chord, so every playback starts fresh; a region's notes latch again
when they play.

### Pattern

The order in which the held notes are played:

| Pattern | Order |
|---|---|
| **Up** | lowest to highest |
| **Down** | highest to lowest |
| **Up/Down** | up, then back down (the top and bottom notes aren't repeated) |
| **Down/Up** | down, then back up |
| **As Played** | the order you pressed the keys |
| **Random** | a random held note each step |

The pattern buttons in the performance strip and the **Pattern** row in the Sequence panel set the
same base pattern.

### Rate

How fast the notes come. Choose the note value in the **Rate** row (1/1 to 1/128), and its family
with the three small buttons next to it: **straight**, **dotted** or **triplet**.

### Octave

How many octaves the pattern spans (1 to 4). With 2, the chord is played, then the same chord an
octave higher, and so on. See [Octave modes](#octave-modes) for the second mode, **Transpose**.

### Gate

How long each note sounds, as a percentage of its step (1% to 100%). Short gates sound staccato;
100% is legato.

### Velocity

With the Velocity progression off (the default), each note keeps the velocity it was played with
(**as played**). Turn Velocity on to set a fixed base velocity and a progression.

### Swing

Delays every second note, in pairs at the current rate. **50%** is straight, about **66%** is a
triplet feel, **75%** is dotted. The gate applies to each note's swung length.

### Humanize

Random variation added to each note:

- **Velocity ±**: up to ±40 velocity.
- **Gate ±**: up to ±40% gate.

Timing is never humanized; notes stay on the grid.

### Other MIDI

Everything that isn't a note (sustain pedal, mod wheel, pitch bend, other controllers) passes
through p-arp unchanged to the instrument.

---

## 5. Progressions

A **progression** makes a setting move through a range of values as the arpeggio plays, instead of
staying fixed. Six settings can progress: **Rate**, **Octave**, **Pattern** (Sequence panel), and
**Gate**, **Velocity**, **Swing** (Feel panel).

### Turning a progression on

Each row starts with a button named after its setting. Click it to light it up: that setting now
progresses. When it's off, the setting stays at its **base** value (the highlighted value), which is
still in use and still editable. Velocity is the exception: off means *as played*.

### The range bar

Each row shows the setting's possible values as a bar:

- **The base** is the highlighted value: where the progression centers and, with most shapes,
  starts. Click a value to make it the base (on Rate, Octave in Range mode, and Pattern) or drag the
  base marker (on Gate, Velocity and Swing).
- **Two handles** set how far the progression travels **below** and **above** the base. Drag them
  outward. The values in between are the progression's range.

Moving the base moves the whole range with it.

**Rate, Octave and Pattern** step through whole values: each step of the progression is the next
cell. Rate moves in doublings within its family (1/8 → 1/16 → 1/32, or 1/8 triplet → 1/16 triplet).
Patterns follow the order of the cells: Up, Down, Up/Down, Down/Up, As Played, Random.

**Gate, Velocity and Swing** are continuous. Their numbers below the bar show the lowest value, the
base (bold) and the highest value; double-click any of them to type a value. **steps ±** sets how
many steps the progression takes on each side of the base (1 to 8). The small ticks on the bar show
where the steps land. For example: velocity base 70, from 46 to 94, 2 steps → 46, 58, 70, 82, 94.

### Counting values

How many values a progression has decides how long it takes to come back around:

- A range with values on **both sides** of the base has an **odd** number of values: the steps
  below, the base, and the steps above. Velocity with 3 steps on each side has 7 values.
- A range on **one side** only (one handle at the base) has **steps + 1** values. To get 8 values,
  for one per bar of an 8-bar loop, put the base at one end and use 7 steps.

This matters when you want a progression to fit a loop. See [Recipes](#8-recipes).

### Octave modes

The menu at the end of the Octave row:

- **Range** (default): the progression changes how many octaves the pattern spans (1 to 4). A
  longer span means a longer cycle: going from 1 to 2 octaves doubles the number of notes per cycle.
- **Transpose**: the pattern always spans the same number of octaves (set with **octaves**), and the
  progression shifts the whole pattern up or down, from −3 to +3 octaves. Every cycle has the same
  length, in a different register.

---

## 6. Shaping the progressions

The performance strip holds the controls that apply to all progressions at once.

### Shape

How each progression moves through its range:

| Shape | Movement |
|---|---|
| **↗ Up** | from the lowest value to the highest, then jumps back to the lowest |
| **↘ Down** | from the highest to the lowest, then jumps back to the highest |
| **⋀ Up-Down** | starts at the base, rises to the highest, falls to the lowest, returns to the base |

An Up-Down pass is about twice as long as an Up or Down pass over the same range.

### Advance

When the progressions take a step:

| Advance | A step happens |
|---|---|
| **Per Arp Cycle** (default) | after each full run through the pattern |
| **Per Note Step** | on every note |
| **Per Beat** | on every beat |
| **Per Bar** | on every bar |
| **Per 2 Bars** | every two bars |

**Pattern** always changes at the end of a cycle (switching patterns on every note would just
scramble them), even with **Per Note Step**.

With **Per Beat**, **Per Bar** and **Per 2 Bars**, progressions follow the bar grid no matter how
long each cycle is, and the pattern restarts from its first note at each boundary. Use these when
the progressions change the cycle length (Rate, Octave in Range mode, Pattern) and you want
everything to stay aligned with bars and chord changes.

### Link

How several active progressions move relative to each other. Only matters when two or more
progressions are on.

- **Free** (default): each progression steps one value at a time and starts over after its own
  number of values. Progressions of different lengths drift apart and meet again later, like
  polyrhythms.
- **Locked**: all progressions share one position. They reach their lowest, base and highest values
  together; a progression with fewer values holds each value longer. Use it for one coordinated
  swell.
- **Restart**: each progression steps on its own, but all start over together when the longest one
  completes its pass.

### Curve

The path the progressions take through their ranges. All active progressions follow the curve
together, each over its own range (Link has no effect while a curve other than Linear is chosen).

| Curve | Path |
|---|---|
| **Linear** (default) | every value of the range, one by one |
| **Accelerating** | small steps first, big steps at the end |
| **Decelerating** | big steps first, small steps at the end |
| **Fibonacci** | steps 1, 2, 3, 5, 8 |
| **Primes** | steps 2, 3, 5, 7 |
| **Random** | a random step each time, never the same twice in a row |
| **Custom** | your own steps, drawn in the curve editor |

The bars next to the menu preview the curve. **Shape** plays the curve forward (Up), backward (Down)
or forward then back (Up-Down); the Random curve ignores Shape.

**How a curve maps to values:** the curve's shape is stretched over each progression's range. The
curve's **lowest** step plays the range's lowest value and its **highest** step plays the highest
value, whatever numbers you draw. So:

- Set each range to exactly the values you want to hear. A curve can't play only part of a range.
- A curve with just two different levels (for example 1, 2 or 8, 1) alternates between the two ends
  of every active range.
- A flat curve (all steps the same) is the exception: it uses the 1-to-8 scale directly
  (1 = lowest, 8 = highest).

### The curve editor

Click the curve preview, or choose **Custom** in the Curve menu, to open the editor:

- **Draw** the steps: click a column to set its level (1 to 8), or drag across the columns to draw
  a shape in one stroke.
- **Number of steps:** the **steps** buttons, or draw in a column past the last step to extend the
  curve to it. Steps beyond the end keep their values (shown dimmed) in case you lengthen the curve
  again.
- **Starting from a preset curve:** open the editor while a preset curve (for example Fibonacci) is
  chosen; your first edit copies its steps into the custom curve and switches the menu to Custom.

Close the editor with **Esc** or a click outside it.

### Depth

The knob next to the live view scales every progression's range at once: **100%** uses the full
ranges you set, **0%** keeps everything at its base. One gesture widens or narrows the whole
movement, which makes it a good control to automate. Rate, Octave and Pattern ranges round to whole
steps; Gate, Velocity and Swing keep their step count and compress the distance.

---

## 7. How playback behaves

- **The transport drives p-arp.** It plays only while Logic's transport runs and follows Logic's
  tempo and time signature.
- **A new chord restarts everything.** Playing a chord after releasing all keys restarts the
  progressions and the pattern from the beginning. Adding notes to a chord you're still holding
  doesn't.
- **Every loop pass is the same.** With Logic's cycle on, each pass restarts the progressions and
  the pattern, so the loop plays identically every time, including its first note.
- **Notes land on the grid.** The first note of a chord starts on the next grid line of the current
  rate. A chord played just after a grid line (within a 1/64 note) still starts on that line.
- **No stuck notes.** Sounding notes are stopped when the loop wraps, the playhead jumps, the
  transport stops, or you release the chord (without Latch).

### When the rate changes: Snap, Flow, Free

The menu at the end of the Rate row decides how notes are timed when the rate changes:

- **Snap** (default): each note snaps forward to its own rate's grid, keeping phrases anchored to
  the beat. A rate change can leave a short gap.
- **Flow**: notes follow each other without gaps, so a progression keeps its exact rhythm (for
  example 1/16, 1/8, 1/4, 1/2 back to back), then realigns to the next beat each time the Rate
  progression completes a pass. Can sound syncopated.
- **Free**: notes follow each other without gaps and never realign on their own; phrases can drift
  against the bar.

In all three modes, timing snaps to the grid when the transport starts, the loop wraps, a new chord
is played, or you change the Rate controls by hand.

---

## 8. Recipes

### A build-up over an 8-bar loop

Velocity and rate rising toward the end of the loop, like an old-school electro snare roll.

1. **Advance:** Per Bar. **Shape:** Up. **Link:** Locked.
2. **Rate** on: base 1/4, range up to 1/32 (4 values).
3. **Velocity** on: base at the bottom (for example 33), nothing below, the highest value at the top
   (for example 112), **steps ± 7**: 8 values, one per bar.

With Locked, Rate holds each value for two bars while Velocity climbs every bar, and both peak in
bar 8.

> **Why the bottom base matters:** a velocity range with values on both sides of the base always
> has an odd number of values (see [Counting values](#counting-values)). With 7 values over 8 bars,
> the progression starts over in bar 8, and the climax drops back to the lowest velocity.

### Stutter, then release

Three fast notes and a slow one, repeating.

1. **Rate** on: base 1/8, range up to 1/32.
2. **Advance:** Per Note Step. **Curve:** Custom.
3. In the curve editor, draw 4 steps: high, high, high, low (for example 8, 8, 8, 1).

Result: 1/32, 1/32, 1/32, 1/8, and again. If the Rate range went further (for example to 1/64),
the high steps would play 1/64, because a curve always uses the full range.

### A pattern sweep

All six patterns in turn, with gate and velocity rising alongside.

1. **Pattern** on: base Up, range to the right up to Random (6 values).
2. **Velocity** and **Gate** on: base at the bottom of each range, nothing below, **steps ± 5**
   (6 values each).
3. **Shape:** Up for a sweep that restarts, Up-Down for a sweep and back. **Advance:** Per Arp
   Cycle.

Matching the number of values (6 everywhere) keeps the three progressions in step; **Link: Locked**
guarantees it.

---

## 9. Presets

### Factory presets

p-arp comes with factory presets. Open the preset menu at the top of the plugin window (Logic's
own header) to choose one. **0-empty-setting** is a clean starting point with all progressions off.

### Your own presets

Use Logic's preset menu: **Save As…** stores the current settings as a preset you can recall in any
project. Presets are saved in `~/Library/Audio/Presets/p-arp/p-arp/Presets/`.

**Recall Default** in Logic's menu resets p-arp to its built-in defaults, which are not the same as
the 0-empty-setting preset.

The window size isn't part of a preset; it's saved with each project.

---

## 10. Automation and recording

### Automation

Every control is a Logic parameter: automate it like any other plugin (in the track's automation
lanes, or by moving it while recording automation). In Logic's parameter menus they're grouped as
**Global**, **Pattern**, **Octave**, **Rate**, **Gate**, **Velocity**, **Swing**, **Humanize** and
**Custom Series**. Good candidates for live movement: **Depth** (Global Range), **Latch**, the
progression on/off buttons, and the base values.

### Recording the arpeggio as MIDI

MIDI FX plugins send their notes to the instrument; Logic doesn't record them on the same track.
To capture the arpeggio as an editable MIDI region, route it to a second track:

1. Create a second software instrument track (the receiving track).
2. Select it, open the inspector (**I**), and in the **Track** section set **Internal MIDI In** to
   the track running p-arp.
3. Arm the receiving track and record while the source region plays on the p-arp track.

Mute or lower one of the two tracks while recording to avoid hearing the part twice.

---

## 11. Troubleshooting

**No sound.** Start Logic's transport: p-arp only plays while it runs. Check that p-arp is in the
**MIDI FX** slot of a software instrument track, above the instrument.

**The arpeggio keeps playing after I let go.** Latch is on. Turn it off, or stop the transport.

**A progression doesn't seem to do anything.** Check that its button is lit, that its range isn't
collapsed to the base (both handles at the base), and that **Depth** isn't at 0%.

**A curve plays the "wrong" values.** A curve always spans each active progression's full range
(see [Curve](#curve)). Narrow the range to the values you want, or turn off progressions that
shouldn't follow the curve.

**A progression starts over too early (or late) for my loop.** Count its values (see
[Counting values](#counting-values)): a range on both sides of the base has an odd number of values.

**p-arp is missing in Logic, or failed validation.** See [Installing](#1-installing).

**Reporting a bug.** The **Debug log** button at the top right of the window writes a detailed log
of what p-arp does to `~/Library/Logs/p-arp/`. Turn it on *before* starting the transport, play
until the problem happens, stop, and send the log file (click the file name next to the button to
show it in Finder).

---

## 12. Parameter reference

The names Logic shows in automation and its parameter list, with their ranges and defaults.

| Parameter | Range | Default |
|---|---|---|
| **Global** | | |
| Latch Chord | Off / On | Off |
| Advance Trigger | Per Arp Cycle, Per Note Step, Per Beat, Per Bar, Per 2 Bars | Per Arp Cycle |
| Progression Shape | Up, Down, Up-Down | Up |
| Link | Free, Locked, Restart | Free |
| Global Range (Depth) | 0–100% | 100% |
| Series Curve | Linear, Accelerating, Decelerating, Fibonacci, Primes, Random, Custom | Linear |
| **Pattern** | | |
| Arp Pattern | Up, Down, Up/Down, Down/Up, As Played, Random | Up/Down |
| Pattern Mod Active | Off / On | Off |
| Pattern Spread (−) / (+) | 0–5 patterns | 1 / 1 |
| **Octave** | | |
| Base Octave Range | 1–4 octaves | 1 |
| Octave Mod Active | Off / On | Off |
| Octave Spread (−) / (+) | 0–3 octaves | 1 / 1 |
| Octave Mode | Range, Transpose | Range |
| **Rate** | | |
| Base Subdivision | 1/1 to 1/128, straight, dotted or triplet | 1/8 |
| Subdiv Mod Active | Off / On | Off |
| Subdiv Spread (−) Slower / (+) Faster | 0–7 doublings | 1 / 1 |
| Subdiv Change Timing | Snap to Grid, Flow, Free | Snap to Grid |
| **Gate** | | |
| Gate Length | 1–100% | 80% |
| Gate Mod Active | Off / On | Off |
| Gate Spread (−) Shorter / (+) Longer | 0–99% | 40% / 20% |
| Gate Steps (per side) | 1–8 | 4 |
| **Velocity** | | |
| Velocity Base | 1–127 | 70 |
| Velocity Mod Active | Off / On (Off = as played) | Off |
| Velocity Spread (−) Down / (+) Up | 0–126 | 25 / 25 |
| Velocity Steps (per side) | 1–8 | 4 |
| **Swing** | | |
| Swing | 50–75% | 50% |
| Swing Mod Active | Off / On | Off |
| Swing Spread (−) Straighter / (+) Swingier | 0–25% | 0% / 16% |
| Swing Steps (per side) | 1–8 | 4 |
| **Humanize** | | |
| Humanize Velocity (±) | 0–40 | 0 |
| Humanize Gate (±) | 0–40% | 0% |
| **Custom Series** | | |
| Custom Length | 1–8 steps | 4 |
| Custom Step 1–8 | 1–8 each | 1, 5, 6, 8, 2, 3, 4, 7 |

In the plugin window, "Mod Active" is the row's lit button, "Spread" is the range handles, and
"Series Curve" is **Curve**.
