import { useCallback, useMemo, useSyncExternalStore } from "react";
import * as Juce from "../juce/index.js";

export interface SliderParam {
  /** Value in the parameter's own units (e.g. 0..100 for a percentage). */
  value: number;
  /** Value in 0..1. */
  normalised: number;
  properties: Juce.SliderProperties;
  setNormalised: (value: number) => void;
  /** Call at the start / end of a user gesture so the host records automation. */
  beginGesture: () => void;
  endGesture: () => void;
}

/**
 * Binds a component to a plugin parameter through JUCE's WebSliderRelay with the same name.
 * Re-renders when the host changes the value (automation, presets, host controls).
 */
export function useSliderParam(name: string): SliderParam {
  const state = useMemo(() => Juce.getSliderState(name), [name]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const valueId = state.valueChangedEvent.addListener(onChange);
      const propertiesId = state.propertiesChangedEvent.addListener(onChange);
      return () => {
        state.valueChangedEvent.removeListener(valueId);
        state.propertiesChangedEvent.removeListener(propertiesId);
      };
    },
    [state]
  );

  // Snapshot = scaled value + properties version; properties object identity changes on update
  const value = useSyncExternalStore(subscribe, () => state.getScaledValue());
  const properties = useSyncExternalStore(subscribe, () => state.properties);

  return {
    value,
    normalised: state.getNormalisedValue(),
    properties,
    setNormalised: (v: number) => state.setNormalisedValue(Math.min(1, Math.max(0, v))),
    beginGesture: () => state.sliderDragStarted(),
    endGesture: () => state.sliderDragEnded(),
  };
}
