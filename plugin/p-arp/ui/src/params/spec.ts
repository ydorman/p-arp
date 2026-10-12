// The plugin's parameters, mirrored from the engine's parameter table
// (plugin/p-arp/engine/src/Parameters.cpp): same ids, ranges, choices and defaults.
// Display names in the UI come from the components (e.g. "Rate", "Depth"); `name` is the host name.

export type ParamKind = "bool" | "int" | "choice";

export interface ParamSpec {
  id: string;
  name: string;
  kind: ParamKind;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  choices?: string[];
}

export const RATE_NAMES = [
  "1/1 dotted", "1/1", "1/2 dotted", "1/1 triplet", "1/2", "1/4 dotted", "1/2 triplet", "1/4",
  "1/8 dotted", "1/4 triplet", "1/8", "1/16 dotted", "1/8 triplet", "1/16", "1/32 dotted",
  "1/16 triplet", "1/32", "1/64 dotted", "1/32 triplet", "1/64", "1/128 dotted", "1/64 triplet",
  "1/128", "1/128 triplet",
];

export const PATTERN_NAMES = ["Up", "Down", "Up/Down", "Down/Up", "As Played", "Random"];

const bool = (id: string, name: string, defaultValue = 0): ParamSpec => ({ id, name, kind: "bool", min: 0, max: 1, defaultValue });
const int = (id: string, name: string, min: number, max: number, defaultValue: number, unit?: string): ParamSpec =>
  ({ id, name, kind: "int", min, max, defaultValue, unit });
const choice = (id: string, name: string, choices: string[], defaultValue: number): ParamSpec =>
  ({ id, name, kind: "choice", min: 0, max: choices.length - 1, defaultValue, choices });

export const PARAMS: ParamSpec[] = [
  // Global
  bool("latch", "Latch Chord"),
  choice("advanceTrigger", "Advance Trigger", ["Per Arp Cycle", "Per Note Step", "Per Beat", "Per Bar", "Per 2 Bars"], 0),
  choice("shape", "Progression Shape", ["Up", "Down", "Up-Down (Triangle)"], 0),
  choice("link", "Link Series", ["Off", "Shared Phase", "Restart Together"], 0),
  int("globalRange", "Global Range", 0, 100, 100, "%"),
  choice("curve", "Series Curve", ["Linear", "Accelerating", "Decelerating", "Fibonacci", "Primes", "Random", "Custom"], 0),
  // Pattern
  choice("pattern", "Arp Pattern", PATTERN_NAMES, 2),
  bool("patternActive", "Pattern Mod Active"),
  int("patternSpreadDown", "Pattern Spread (-) Before", 0, 5, 1),
  int("patternSpreadUp", "Pattern Spread (+) After", 0, 5, 1),
  // Octave
  int("baseOctave", "Base Octave Range", 1, 4, 2),
  bool("octaveActive", "Octave Mod Active"),
  int("octaveSpreadDown", "Octave Spread (-) Below", 0, 3, 1),
  int("octaveSpreadUp", "Octave Spread (+) Above", 0, 3, 1),
  choice("octaveMode", "Octave Mode", ["Range", "Transpose"], 0),
  // Rate
  choice("baseRate", "Base Subdivision", RATE_NAMES, RATE_NAMES.indexOf("1/8")),
  bool("rateActive", "Subdiv Mod Active"),
  int("rateSpreadDown", "Subdiv Spread (-) Slower", 0, 7, 1),
  int("rateSpreadUp", "Subdiv Spread (+) Faster", 0, 7, 1),
  choice("timing", "Subdiv Change Timing", ["Snap to Grid", "Flow (realign each pass)", "Free (no snapping)"], 0),
  // Gate
  int("gate", "Gate Length", 10, 100, 80, "%"),
  bool("gateActive", "Gate Mod Active"),
  int("gateSpreadDown", "Gate Spread (-) Shorter", 0, 90, 40, "%"),
  int("gateSpreadUp", "Gate Spread (+) Longer", 0, 90, 20, "%"),
  int("gateSteps", "Gate Steps (per side)", 1, 8, 4),
  // Velocity
  int("velocity", "Velocity Base", 1, 127, 70),
  bool("velocityActive", "Velocity Mod Active"),
  int("velocitySpreadDown", "Velocity Spread (-) Down", 0, 64, 25),
  int("velocitySpreadUp", "Velocity Spread (+) Up", 0, 64, 25),
  int("velocitySteps", "Velocity Steps (per side)", 1, 8, 4),
  // Swing
  int("swing", "Swing", 50, 75, 50, "%"),
  bool("swingActive", "Swing Mod Active"),
  int("swingSpreadDown", "Swing Spread (-) Straighter", 0, 25, 0, "%"),
  int("swingSpreadUp", "Swing Spread (+) Swingier", 0, 25, 16, "%"),
  int("swingSteps", "Swing Steps (per side)", 1, 8, 4),
  // Humanize
  int("humanizeVelocity", "Humanize Velocity (+/-)", 0, 40, 0),
  int("humanizeGate", "Humanize Gate (+/-)", 0, 40, 0, "%"),
  // Custom series curve
  int("customLength", "Custom Length", 1, 8, 4),
  ...[1, 5, 6, 8, 2, 3, 4, 7].map((d, i) => int(`customStep${i + 1}`, `Custom Step ${i + 1}`, 1, 8, d)),
];

export const SPEC_BY_ID: Record<string, ParamSpec> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));
