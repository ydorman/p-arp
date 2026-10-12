// The plugin's parameters, generated from the engine's parameter table
// (plugin/p-arp/engine/src/Parameters.cpp) by engine/tools/dump_parameters.cpp into
// parameters.json. Don't edit the JSON by hand: an engine test fails when it's out of date.
// Display names in the UI come from the components (e.g. "Rate", "Depth"); `name` is the host name.

import parameters from "./parameters.json";

export type ParamKind = "bool" | "int" | "choice";

export interface ParamSpec {
  id: string;
  name: string;
  group: string;
  kind: ParamKind;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  choices?: string[];
}

export const PARAMS = parameters as ParamSpec[];

export const SPEC_BY_ID: Record<string, ParamSpec> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export const RATE_NAMES = SPEC_BY_ID.baseRate.choices!;
export const PATTERN_NAMES = SPEC_BY_ID.pattern.choices!;
