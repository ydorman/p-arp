// One parameter store for every control. Inside the plugin each parameter is backed by the JUCE
// relay registered for it (slider / toggle / combo box); in a plain browser (or for parameters the
// plugin doesn't expose to the UI yet) the value is kept locally, so the UI is fully interactive
// for design work. Components only ever use useParam(id).

import { useCallback, useSyncExternalStore } from "react";
import * as Juce from "../juce/index.js";
import { SPEC_BY_ID } from "./spec";
import type { ParamSpec } from "./spec";

export interface Param {
  spec: ParamSpec;
  value: number;
  set: (value: number) => void;
  /** Call at the start / end of a drag so the host records automation as one gesture. */
  begin: () => void;
  end: () => void;
}

interface Backend {
  get(): number;
  set(value: number): void;
  begin(): void;
  end(): void;
  subscribe(onChange: () => void): () => void;
}

function registered(kind: string, id: string): boolean {
  const list = window.__JUCE__.initialisationData[kind];
  return Array.isArray(list) && list.includes(id);
}

function juceBackend(spec: ParamSpec): Backend | null {
  const listen = (state: { valueChangedEvent: Juce.ListenerList; propertiesChangedEvent: Juce.ListenerList }) =>
    (onChange: () => void) => {
      const a = state.valueChangedEvent.addListener(onChange);
      const b = state.propertiesChangedEvent.addListener(onChange);
      return () => {
        state.valueChangedEvent.removeListener(a);
        state.propertiesChangedEvent.removeListener(b);
      };
    };

  if (spec.kind === "int" && registered("__juce__sliders", spec.id)) {
    const state = Juce.getSliderState(spec.id);
    return {
      get: () => Math.round(state.getScaledValue()),
      set: (v) => state.setNormalisedValue((v - spec.min) / (spec.max - spec.min)),
      begin: () => state.sliderDragStarted(),
      end: () => state.sliderDragEnded(),
      subscribe: listen(state),
    };
  }
  if (spec.kind === "bool" && registered("__juce__toggles", spec.id)) {
    const state = Juce.getToggleState(spec.id);
    return {
      get: () => (state.getValue() ? 1 : 0),
      set: (v) => state.setValue(v !== 0),
      begin: () => {},
      end: () => {},
      subscribe: listen(state),
    };
  }
  if (spec.kind === "choice" && registered("__juce__comboBoxes", spec.id)) {
    const state = Juce.getComboBoxState(spec.id);
    return {
      get: () => state.getChoiceIndex(),
      set: (v) => state.setChoiceIndex(v),
      begin: () => {},
      end: () => {},
      subscribe: listen(state),
    };
  }
  return null;
}

function localBackend(spec: ParamSpec): Backend {
  let value = spec.defaultValue;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      value = v;
      listeners.forEach((fn) => fn());
    },
    begin: () => {},
    end: () => {},
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const backends = new Map<string, Backend>();

function backendFor(id: string): Backend {
  let backend = backends.get(id);
  if (!backend) {
    const spec = SPEC_BY_ID[id];
    if (!spec) throw new Error(`Unknown parameter "${id}"`);
    backend = juceBackend(spec) ?? localBackend(spec);
    backends.set(id, backend);
  }
  return backend;
}

export function useParam(id: string): Param {
  const backend = backendFor(id);
  const subscribe = useCallback((fn: () => void) => backend.subscribe(fn), [backend]);
  const value = useSyncExternalStore(subscribe, backend.get);
  const spec = SPEC_BY_ID[id];
  return {
    spec,
    value,
    set: (v: number) => backend.set(Math.min(spec.max, Math.max(spec.min, Math.round(v)))),
    begin: backend.begin,
    end: backend.end,
  };
}
