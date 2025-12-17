import FilterProcessor, { type FilterType } from "./abstract-filter-processor";
import type { SampleNodeMessage } from "../audio-nodes/sample-node";

interface SampleProcessorOptions {
  filterType: FilterType;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

type SampleParameterData = Record<SampleParameter, number>;
type SampleParameter = (typeof parameterDescriptors)[number]["name"];

interface SampleOptions {
  processorOptions: Partial<SampleProcessorOptions>;
}

type SampleProcessorMessage = {
  type: "ended";
  time: number;
};

const parameterDescriptors = [
  {
    name: "playbackRate",
    automationRate: "k-rate",
    defaultValue: 1,
    maxValue: 3.4028234663852886e38,
    minValue: -3.4028234663852886e38,
  },
  {
    name: "detune",
    automationRate: "k-rate",
    defaultValue: 0.0,
    maxValue: 3.4028234663852886e38,
    minValue: -3.4028234663852886e38,
  },
  {
    name: "gain",
    defaultValue: 1.0,
    minValue: 0.0,
    maxValue: 3.4028234663852886e38,
  },
  {
    name: "filterFrequency",
    automationRate: "k-rate",
    defaultValue: 20000.0,
    minValue: 20.0,
    maxValue: 20000.0,
  },
  {
    name: "filterQ",
    automationRate: "k-rate",
    defaultValue: 0.707,
    minValue: 0.001,
    maxValue: 30.0,
  },
] as const;

class SampleProcessor extends FilterProcessor {
  private readIndex = 0;
  private buffer: Float32Array | null = null;
  private isRunning = false;
  private scheduledStartTime: number | null = null;
  private scheduledStopTime: number | null = null;
  private loop = false;
  private loopStart = 0;
  private loopEnd = 0;

  static get parameterDescriptors() {
    return parameterDescriptors;
  }

  constructor({ processorOptions = {} }: SampleOptions) {
    super();
    this.updateFilterCoefficients(20000.0, 0.707);
    this.filterType = processorOptions.filterType ?? "none";
    this.loop = processorOptions.loop ?? false;
    this.loopStart = processorOptions.loopStart ?? 0;
    this.loopEnd = processorOptions.loopEnd ?? 0;

    this.port.onmessage = ({ data }: MessageEvent<SampleNodeMessage>) => {
      switch (data.type) {
        case "buffer":
          this.buffer = data.buffer;
          break;

        case "start":
          this.scheduledStartTime = data.time ?? currentTime;
          this.readIndex = data.offset || 0;
          break;

        case "stop":
          this.scheduledStopTime = data.time ?? currentTime;
          break;

        case "loop":
          this.loop = data.loop ?? false;
          break;
        case "loopStart":
          this.loopStart = data.offset ?? 0;
          break;

        case "loopEnd":
          this.loopEnd = data.offset ?? 0;
          break;

        case "filterType":
          this.filterType = data.filterType ?? "none";
          break;
      }
    };
  }

  postEndedMessage(time: number) {
    const msg: SampleProcessorMessage = { type: "ended", time };
    this.port.postMessage(msg);
  }

  process(
    _: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ) {
    const output = outputs[0];
    const buffer = this.buffer;
    if (!buffer) return true;

    const filterFrequencyArray = parameters.filterFrequency;
    const filterQArray = parameters.filterQ;
    // Update filter coefficients (k-rate, so once per block)
    const filterFreq = filterFrequencyArray[0];
    const filterQ = filterQArray[0];
    this.updateFilterCoefficients(filterFreq, filterQ);

    for (let i = 0; i < output[0].length; i++) {
      const sampleTime = currentTime + i / sampleRate;

      // Start/Stop Logic
      if (
        this.scheduledStartTime !== null &&
        sampleTime >= this.scheduledStartTime
      ) {
        this.isRunning = true;
        this.scheduledStartTime = null;
      }
      if (
        this.scheduledStopTime !== null &&
        sampleTime >= this.scheduledStopTime
      ) {
        this.isRunning = false;
        this.scheduledStopTime = null;
        this.postEndedMessage(currentTime);
      }

      if (!this.isRunning) {
        output[0][i] = 0;
        continue;
      }

      // Calculate Pitch Factor
      const playbackRate =
        parameters.playbackRate[i] ?? parameters.playbackRate[0];
      const detune = parameters.detune[i] ?? parameters.detune[0];
      const detuneFactor = Math.pow(2.0, detune / 1200.0);
      const speed = playbackRate * detuneFactor;

      // Handle Looping
      const loop = this.loop;
      const loopStart = this.loopStart * buffer.length;
      const loopEnd = this.loopEnd * buffer.length;

      // Read from buffer (Linear Interpolation for smooth pitch)
      const idx = this.readIndex;
      const i0 = Math.floor(idx);
      const i1 =
        i0 + 1 >= (loop ? loopEnd : buffer.length)
          ? loop
            ? loopStart
            : i0
          : i0 + 1;
      const frac = idx - i0;

      const sample = buffer[i0] + frac * (buffer[i1] - buffer[i0]);
      const gain = parameters.gain[i] ?? parameters.gain[0];

      let filteredSample = sample * gain;
      if (this.filterType !== "none") {
        filteredSample = this.applyFilter(filteredSample, 0);
      }

      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = filteredSample;
      }

      // Advance Pointer
      this.readIndex += speed;

      if (loop && this.readIndex >= loopEnd) {
        this.readIndex = loopStart;
        this.resetFilterState();
      } else if (this.readIndex >= buffer.length) {
        this.isRunning = false;
        this.postEndedMessage(currentTime);
        break;
      }
    }
    return true;
  }
}

registerProcessor("buffer-source-processor", SampleProcessor);

export default SampleProcessor;
export type {
  SampleParameter,
  SampleParameterData,
  SampleProcessorOptions,
  SampleProcessorMessage,
};
