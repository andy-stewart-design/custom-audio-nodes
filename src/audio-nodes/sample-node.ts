// TODO: Move loop, loopStart, loopEnd to be properties (not AudioParams)

import AudioEndedEvent from "./audio-event";
import type { FilterType } from "../worklets/abstract-filter-processor";
import type {
  SampleParameterData,
  SampleProcessorOptions,
} from "../worklets/sample-processor";

type ParamData = Omit<SampleParameterData, "loop"> & { loop: boolean };
type SynthesizerOptions = Partial<ParamData & SampleProcessorOptions>;

class SampleNode extends AudioWorkletNode {
  private _duration: number;
  private _loop: boolean;
  private _loopStart: number;
  private _loopEnd: number;
  private _filterType: FilterType;
  readonly playbackRate: AudioParam;
  readonly detune: AudioParam;
  readonly gain: AudioParam;
  readonly filterFrequency: AudioParam;
  readonly filterQ: AudioParam;
  onended: ((e: AudioEndedEvent) => void) | null = null;

  constructor(
    ctx: AudioContext,
    buffer: AudioBuffer,
    { filterType, loop, ...params }: SynthesizerOptions = {}
  ) {
    super(ctx, "buffer-source-processor", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: { ...params },
      processorOptions: {
        filterType,
        loop,
        loopStart: params.loopStart,
        loopEnd: params.loopEnd,
      },
    });

    this._duration = buffer.duration;

    this.playbackRate = getParam(this, "playbackRate");
    this.detune = getParam(this, "detune");
    this._loop = loop ?? false;
    this._loopStart = params.loopStart ?? 0;
    this._loopEnd = params.loopEnd ?? 0;
    this.gain = getParam(this, "gain");
    this._filterType = filterType ?? "none";
    this.filterFrequency = getParam(this, "filterFrequency");
    this.filterQ = getParam(this, "filterQ");

    // Send the buffer data immediately (using channel 0 for simplicity)
    this.port.postMessage({
      command: "buffer",
      buffer: buffer.getChannelData(0),
    });

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

  start(when = 0, offset = 0) {
    const clampedOffset = Math.max(
      0,
      Math.min(offset * this._duration, this._duration)
    );

    this.port.postMessage({
      command: "start",
      time: when || this.context.currentTime,
      offset: clampedOffset * this.context.sampleRate,
    });
  }

  stop(when = 0) {
    this.port.postMessage({
      command: "stop",
      time: when || this.context.currentTime,
    });
  }

  setLoop(loop: boolean) {
    this._loop = loop;
    this.port.postMessage({ command: "loop", loop });
  }

  setLoopStart(loopStart: number) {
    this._loopStart = loopStart;
    this.port.postMessage({ command: "loopStart", loopStart });
  }

  setLoopEnd(loopEnd: number) {
    this._loopEnd = loopEnd;
    this.port.postMessage({ command: "loopEnd", loopEnd });
  }

  setFilterType(filterType: FilterType) {
    this._filterType = filterType;
    this.port.postMessage({ command: "filterType", filterType });
  }

  get loop() {
    return this._loop;
  }

  set loop(loop: boolean) {
    this._loop = loop;
    this.port.postMessage({ command: "loop", loop });
  }

  get loopStart() {
    return this._loopStart;
  }

  set loopStart(loopStart: number) {
    this._loopStart = loopStart;
    this.port.postMessage({ command: "loopStart", loopStart });
  }

  get loopEnd() {
    return this._loopEnd;
  }

  set loopEnd(loopEnd: number) {
    this._loopEnd = loopEnd;
    this.port.postMessage({ command: "loopEnd", loopEnd });
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

export default SampleNode;
