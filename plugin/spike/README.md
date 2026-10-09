# SARP Spike

Throwaway spike to de-risk the real plugin's architecture: a JUCE **AU MIDI FX** with a **web view
UI**, loaded in Logic. It passes MIDI through unchanged. See `docs/design-notes.md` (section 4).

- `Source/` - processor (MIDI pass-through, note counter, host transport) and editor (web view)
- `ui/` - HTML/CSS/JS UI; one knob bound to the `testKnob` parameter via JUCE's slider relay,
  live engine state shown from `engineState` events. Bundled into the binary at build time,
  together with JUCE's JS bridge library.

## Build

Requires Xcode and CMake (`brew install cmake`). JUCE 8.0.15 is fetched into `build/` on first
configure. `DEVELOPER_DIR` points the build at Xcode without changing `xcode-select`.

```bash
cd plugin/spike
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake -B build -DCMAKE_BUILD_TYPE=Release
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake --build build --config Release -j 8
```

The build installs `SARP Spike.component` to `~/Library/Audio/Plug-Ins/Components`. Validate:

```bash
auval -v aumi Srps Sarp
```

## Test checklist (Logic)

1. Software instrument track -> MIDI FX slot -> Audio Units -> SARP -> **SARP Spike**.
2. Play notes: they reach the instrument unchanged; "Notes passed" counts up.
3. Start the transport: Transport, Tempo and Position update live.
4. Drag the knob (Shift = fine): value updates; Logic shows the parameter in its controls/automation.
5. Record automation on "Test Knob" while dragging, then play it back: the web knob follows.
6. Close and reopen the plugin window; save and reload the project: knob value is restored.
7. Add 2-3 more instances on other tracks; check Activity Monitor memory (Logic Pro +
   "com.apple.WebKit.WebContent" processes) with windows open and closed.
