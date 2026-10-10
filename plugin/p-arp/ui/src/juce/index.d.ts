// Types for JUCE's JavaScript bridge (index.js / check_native_interop.js in this folder, vendored
// unchanged from JUCE 8.0.15: modules/juce_gui_extra/native/javascript). Re-copy both .js files
// when upgrading JUCE.

export interface ListenerList {
  addListener(fn: () => void): number;
  removeListener(id: number): void;
}

export interface SliderProperties {
  start: number;
  end: number;
  skew: number;
  name: string;
  label: string;
  numSteps: number;
  interval: number;
  parameterIndex: number;
}

export interface SliderState {
  name: string;
  properties: SliderProperties;
  valueChangedEvent: ListenerList;
  propertiesChangedEvent: ListenerList;
  getScaledValue(): number;
  getNormalisedValue(): number;
  setNormalisedValue(value: number): void;
  sliderDragStarted(): void;
  sliderDragEnded(): void;
}

export interface ToggleState {
  name: string;
  valueChangedEvent: ListenerList;
  propertiesChangedEvent: ListenerList;
  getValue(): boolean;
  setValue(value: boolean): void;
}

export interface ComboBoxState {
  name: string;
  properties: { name: string; parameterIndex: number; choices: string[] };
  valueChangedEvent: ListenerList;
  propertiesChangedEvent: ListenerList;
  getChoiceIndex(): number;
  setChoiceIndex(index: number): void;
}

export function getSliderState(name: string): SliderState;
export function getToggleState(name: string): ToggleState;
export function getComboBoxState(name: string): ComboBoxState;
export function getNativeFunction(name: string): (...args: unknown[]) => Promise<unknown>;
export function getBackendResourceAddress(path: string): string;

declare global {
  interface Window {
    __JUCE__: {
      backend: {
        addEventListener(eventId: string, fn: (payload: any) => void): [string, number];
        removeEventListener(token: [string, number]): void;
        emitEvent(eventId: string, payload: unknown): void;
      };
      initialisationData: Record<string, unknown>;
    };
  }
}
