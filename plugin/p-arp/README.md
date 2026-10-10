# p-arp (plugin)

The real p-arp plugin: a JUCE **AU MIDI FX** for Logic with a React web UI. The arp engine is
being ported from the Scripter prototype (`progressive_arp.js`); see `docs/design-notes.md`.

```
engine/   pure C++20 arp engine, no JUCE dependency (+ unit tests)
plugin/   JUCE AU MIDI FX shell: parameters, host MIDI/transport <-> engine, web view editor
ui/       React + TypeScript + Vite UI (JUCE's JS bridge vendored in ui/src/juce)
```

Plugin identity (Logic projects refer to these; keep stable): manufacturer `Ydrm`, plugin `Parp`,
type `aumi`, bundle id `com.ydorman.p-arp`.

**Parameters** are defined once, in the engine's parameter table (`engine/src/Parameters.cpp`):
stable ID, display name, group, type, range, unit, menu choices and the `Settings` field it maps
to. The plugin builds its 46 host parameters from it (grouped; Logic shows the groups as
submenus) and copies their values into the engine's `Settings` once per block. IDs are saved in
projects and automation: never change or reuse one (names can change). Adding a setting: add the
`Settings` field and its table row.

## Prerequisites

Xcode, CMake (`brew install cmake`), Node. All commands use
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` to build with Xcode without changing
`xcode-select`. JUCE 8.0.15 is fetched into the build folder on first configure.

```bash
cd plugin/p-arp/ui && npm install
```

## Engine tests (fast, no JUCE)

```bash
cd plugin/p-arp
cmake -B build-tests -DPARP_BUILD_PLUGIN=OFF
cmake --build build-tests && ./build-tests/engine/tests/parp_engine_tests
```

## Release build

Builds the UI (`npm run build`), embeds it in the binary as a zip, and installs
`p-arp.component` to `~/Library/Audio/Plug-Ins/Components`.

```bash
cd plugin/p-arp
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake -B build -DCMAKE_BUILD_TYPE=Release
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake --build build -j 8
auval -v aumi Parp Ydrm
```

## UI development with hot reload (inside Logic)

A dev build loads the UI from the Vite dev server instead of the embedded zip, so UI edits show
up in the open plugin window immediately.

```bash
# terminal 1: dev server
cd plugin/p-arp/ui && npm run dev
# terminal 2: dev build of the plugin (installs over the release build)
cd plugin/p-arp
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake -B build-dev -DCMAKE_BUILD_TYPE=Debug -DPARP_UI_DEV_SERVER=ON
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cmake --build build-dev -j 8
```

The dev build shows a blank window when the dev server isn't running. Rebuild the release build
(or copy `build/plugin/ParpPlugin_artefacts/Release/AU/p-arp.component` to the Components folder)
to go back. The UI also runs in a normal browser at http://localhost:5173 for layout work, with
controls disconnected (JUCE's bridge installs a placeholder outside the plugin).
