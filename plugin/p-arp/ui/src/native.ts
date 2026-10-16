// Native functions the plugin editor registers (withNativeFunction). null outside the plugin.

import * as Juce from "./juce/index.js";

export function nativeFunction(name: string) {
  const functions = window.__JUCE__.initialisationData.__juce__functions;
  return Array.isArray(functions) && functions.includes(name) ? Juce.getNativeFunction(name) : null;
}
