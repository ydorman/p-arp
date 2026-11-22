# Prototypes

Earlier stages of p-arp, kept for reference. Neither is needed to build or use the plugin in
[`plugin/p-arp`](../plugin/p-arp).

- [`scripter/`](scripter) - **SARP**, the Logic Pro Scripter (JavaScript) prototype where the
  progressive arpeggiator was designed and tested by ear. The plugin's engine is a port of it, and
  its test mock can still replay the plugin's debug logs. Also a quick sandbox for trying new
  ideas before building them into the plugin.
- [`spike/`](spike) - a throwaway JUCE AU MIDI FX that only passes MIDI through, built to prove
  the plugin's architecture (Audio Unit MIDI FX + web view UI, parameter binding, automation) in
  Logic before writing the real plugin. Validated 2026-10-09.
