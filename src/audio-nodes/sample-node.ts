// TODO: Move loop, loopStart, loopEnd to be properties (not AudioParams)

import type {
  SampleParameterData,
  SampleProcessorOptions,
} from "../worklets/sample-processor";
import AudioEndedEvent from "./audio-event";

type ParamData = Omit<SampleParameterData, "loop"> & { loop: boolean };
type SynthesizerOptions = Partial<ParamData & SampleProcessorOptions>;

class SampleNode extends AudioWorkletNode {
  readonly playbackRate: AudioParam;
  readonly detune: AudioParam;
  private _loop: boolean;
  readonly loopStart: AudioParam;
  readonly loopEnd: AudioParam;
  readonly gain: AudioParam;
  readonly filterFrequency: AudioParam;
  readonly filterQ: AudioParam;
  private _duration: number;
  onended: ((e: AudioEndedEvent) => void) | null = null;

  constructor(
    ctx: AudioContext,
    buffer: AudioBuffer,
    { filterType, ...params }: SynthesizerOptions = {}
  ) {
    const loop = params.loop ? 1 : 0;
    const loopStart = (params.loopStart ?? 0) * buffer.duration;
    const loopEnd = (params.loopEnd ?? 0) * buffer.duration;

    super(ctx, "buffer-source-processor", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: { ...params, loop, loopStart, loopEnd },
      processorOptions: { filterType, loop: params.loop },
    });

    this._duration = buffer.duration;

    this.playbackRate = getParam(this, "playbackRate");
    this.detune = getParam(this, "detune");
    this._loop = params.loop ?? false;
    this.loopStart = getParam(this, "loopStart");
    this.loopEnd = getParam(this, "loopEnd");
    this.gain = getParam(this, "gain");
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

  get loop() {
    return this._loop;
  }

  set loop(loop: boolean) {
    this._loop = loop;
    this.port.postMessage({ command: "loop", loop });
  }
}

function getParam(node: AudioWorkletNode, name: string) {
  const param = node.parameters.get(name);
  if (!param) throw new Error(`Missing AudioParam "${name}"`);
  return param;
}

export default SampleNode;
