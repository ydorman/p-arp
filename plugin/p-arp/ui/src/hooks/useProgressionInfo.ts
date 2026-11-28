// What each progression does with the current settings (roadmap #19), from the engine's
// describeProgressions(): value count, pass length and the value each Series Curve step plays.
// Fetched from the plugin after every parameter change (one request per frame at most, shared by
// all rows). Outside the plugin there is no engine: the info is null and nothing is shown.

import { useSyncExternalStore } from "react";
import { nativeFunction } from "../native";
import { subscribeAll } from "../params/store";

export type SeriesName = "pattern" | "octave" | "rate" | "gate" | "velocity" | "swing";

export interface SeriesInfo {
  active: boolean;
  values: number; // distinct values one pass plays
  passAdvances: number; // advances in one pass; 0 = no fixed pass (Random curve)
  perCycle: boolean; // advances are arp cycles whatever the Advance trigger
  curvePos: number[]; // Series Curve on: the position each curve step plays (empty without a curve)
  curveValue: number[]; // ... and its value
}

export type ProgressionInfo = Record<SeriesName, SeriesInfo>;

const describe = nativeFunction("describeProgressions");

let info: ProgressionInfo | null = null;
const listeners = new Set<() => void>();
let unsubscribeParams: (() => void) | null = null;
let frame = 0;
let request = 0;

function refresh() {
  if (!describe || frame) return;
  frame = requestAnimationFrame(async () => {
    frame = 0;
    const id = ++request;
    const result = (await describe()) as ProgressionInfo;
    if (id !== request) return; // a newer request is on its way
    info = result;
    listeners.forEach((fn) => fn());
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!unsubscribeParams) {
    unsubscribeParams = subscribeAll(refresh);
    refresh();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && unsubscribeParams) {
      unsubscribeParams();
      unsubscribeParams = null;
    }
  };
}

export function useProgressionInfo(series: SeriesName): SeriesInfo | null {
  const all = useSyncExternalStore(subscribe, () => info);
  return all?.[series] ?? null;
}

const UNITS = ["cycle", "step", "beat", "bar", "bar"]; // per Advance trigger (menu order)
const UNIT_SIZE = [1, 1, 1, 1, 2]; // 2 Bars: two bars per advance

/** "7 values · 7 bars": how many values the progression has and how long one pass takes. */
export function describePass(info: SeriesInfo, advanceTrigger: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const values = plural(info.values, "value");
  if (info.values <= 1) return values;
  if (!info.passAdvances) return `${values} · random order`;
  const unit = info.perCycle ? "cycle" : UNITS[advanceTrigger] ?? "step";
  const size = info.perCycle ? 1 : UNIT_SIZE[advanceTrigger] ?? 1;
  return `${values} · ${plural(info.passAdvances * size, unit)}`;
}
