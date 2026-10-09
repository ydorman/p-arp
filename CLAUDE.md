# SARP

Progressive arpeggiator: parameters (pattern, octave, rate, gate, velocity, swing) move through
series of values as the arp plays. Currently a Logic Pro **Scripter** prototype
(`progressive_arp.js`); next step is a real **JUCE AU MIDI FX** plugin with a React web UI,
user-facing name **p-arp**. `plugin/spike/` is the (validated) architecture spike.

- `Features.md` - product definition and roadmap (numbered items, ✅ = done)
- `README.md` - user-facing feature reference, setup, debug log & replay, tests
- `docs/design-notes.md` - Logic host behavior, design decisions and their reasons, rejected
  options, bug lessons, and the real-plugin plan. **Read it before changing timing/scheduling code
  or starting plugin work.**

## Working with the user

- The user tests in Logic by ear and pastes `[SARP]` debug logs. Replay them first
  (`pbpaste | node tests/replay.js`) to tell script bugs from expected behavior or mock gaps, and
  explain findings with concrete note timelines (beat, pitch, rate).
- Ask genuine design choices as options with a recommendation; don't decide musical behavior
  silently. Flag behavior changes you make on your own initiative.
- Commit and push only when asked; usually one commit per feature/fix. End commit messages with the
  Co-Authored-By line from the session's attribution instructions.
- The user has strong web front-end and C++ background; the plugin is for themselves and friends
  for now (Logic only).

## Conventions

- `progressive_arp.js` is pasted into Scripter as one file: ES5 style (`var`, no modules), no
  dependencies. Keep it self-contained.
- Tests: `npm test` (Node built-in runner, no deps). `tests/scripter_mock.js` fakes Scripter and
  simulates host playback (blocks, cycle wraps incl. straddling blocks, `beatPos`).
- For every bug fix, add a regression test and confirm it **fails without the fix**.
- Keep the "parameter constants" test in sync when adding controls (it checks every `PARAM_`
  constant against its control name). Inserting controls shifts indices: renumber carefully
  (names can contain digits, e.g. `PARAM_CUSTOM_STEP_1`).
- Keep README and Features.md in step with behavior changes.
