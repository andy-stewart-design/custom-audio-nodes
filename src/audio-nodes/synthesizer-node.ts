// TODO: change setType to an actual setter, prepend class prop with _

import AudioEndedEvent from "./audio-event";
import type { FilterType } from "../worklets/abstract-filter-processor";
import type {
  SynthesizerProcessorOptions,
  SynthesizerParameterData,
} from "../worklets/synthesizer-processor";

type SynthesizerWaveform = "sine" | "sawtooth" | "triangle" | "square";
type SynthesizerOptions = Partial<
  SynthesizerProcessorOptions & SynthesizerParameterData
>;

class SynthesizerNode extends AudioWorkletNode {
  private _filterType: FilterType;
  readonly type: AudioParam;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly gain: AudioParam;
  readonly filterFrequency: AudioParam;
  readonly filterQ: AudioParam;
  onended: ((e: AudioEndedEvent) => void) | null = null;

  constructor(
    ctx: AudioContext,
    { filterType, ...params }: SynthesizerOptions = {}
  ) {
    super(ctx, "custom-oscillator-processor", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: params,
      processorOptions: { filterType },
    });

    this._filterType = filterType ?? "none";
    this.type = getParam(this, "type");
    this.frequency = getParam(this, "frequency");
    this.detune = getParam(this, "detune");
    this.gain = getParam(this, "gain");
    this.filterFrequency = getParam(this, "filterFrequency");
    this.filterQ = getParam(this, "filterQ");

    // Listen for messages from the processor
    this.port.onmessage = (event) => {
      if (event.data.event === "ended") {
        const { time } = event.data;
        const eventTime = typeof time === "number" ? time : 0;
        const audioEvent = new AudioEndedEvent(eventTime);
        this.onended?.(audioEvent);
        this.dispatchEvent(audioEvent);
      }
    };
  }

  start(when: number = 0) {
    const startTime = when === 0 ? this.context.currentTime : when;
    this.port.postMessage({ command: "start", time: startTime });
  }

  stop(when: number = 0) {
    const stopTime = when === 0 ? this.context.currentTime : when;
    this.port.postMessage({ command: "stop", time: stopTime });
  }

  setOscillatorType(type: SynthesizerWaveform | number) {
    const typeMap = { sine: 0, sawtooth: 1, triangle: 2, square: 3 };
    this.type.value =
      typeof type === "number" ? Math.min(Math.max(type, 0), 3) : typeMap[type];
  }

  setFilterType(filterType: FilterType) {
    this._filterType = filterType;
    this.port.postMessage({ command: "filterType", filterType });
  }

  get oscillatorType() {
    return this.type.value;
  }

  set oscillatorType(type: SynthesizerWaveform | number) {
    const typeMap = { sine: 0, sawtooth: 1, triangle: 2, square: 3 };
    this.type.value =
      typeof type === "number" ? Math.min(Math.max(type, 0), 3) : typeMap[type];
  }

  get filterType() {
    return this._filterType;
  }

  set filterType(filterType: FilterType) {
    this._filterType = filterType;
    this.port.postMessage({ command: "filterType", filterType });
  }
}

function getParam(node: AudioWorkletNode, name: string) {
  const param = node.parameters.get(name);
  if (!param) throw new Error(`Missing AudioParam "${name}"`);
  return param;
}

export default SynthesizerNode;
