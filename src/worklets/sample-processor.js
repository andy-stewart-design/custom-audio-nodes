class FilterProcessor extends AudioWorkletProcessor {
  filterType = "none";

  // Biquad filter state variables (per channel)
  x1 = [0.0, 0.0]; // input history
  x2 = [0.0, 0.0];
  y1 = [0.0, 0.0]; // output history
  y2 = [0.0, 0.0];

  // Filter coefficients
  b0 = 1.0;
  b1 = 0.0;
  b2 = 0.0;
  a1 = 0.0;
  a2 = 0.0;

  updateFilterCoefficients(cutoffFreq, q) {
    // Biquad filter coefficients based on filter type
    const omega = (2.0 * Math.PI * cutoffFreq) / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2.0 * q);
    const a0 = 1.0 + alpha;

    if (this.filterType === "lowpass") {
      this.b0 = (1.0 - cosOmega) / 2.0 / a0;
      this.b1 = (1.0 - cosOmega) / a0;
      this.b2 = (1.0 - cosOmega) / 2.0 / a0;
      this.a1 = (-2.0 * cosOmega) / a0;
      this.a2 = (1.0 - alpha) / a0;
    } else if (this.filterType === "highpass") {
      this.b0 = (1.0 + cosOmega) / 2.0 / a0;
      this.b1 = -(1.0 + cosOmega) / a0;
      this.b2 = (1.0 + cosOmega) / 2.0 / a0;
      this.a1 = (-2.0 * cosOmega) / a0;
      this.a2 = (1.0 - alpha) / a0;
    } else if (this.filterType === "bandpass") {
      this.b0 = alpha / a0;
      this.b1 = 0.0;
      this.b2 = -alpha / a0;
      this.a1 = (-2.0 * cosOmega) / a0;
      this.a2 = (1.0 - alpha) / a0;
    }
  }

  applyFilter(input, channel) {
    // Biquad difference equation: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    const output =
      this.b0 * input +
      this.b1 * this.x1[channel] +
      this.b2 * this.x2[channel] -
      this.a1 * this.y1[channel] -
      this.a2 * this.y2[channel];

    // Update state
    this.x2[channel] = this.x1[channel];
    this.x1[channel] = input;
    this.y2[channel] = this.y1[channel];
    this.y1[channel] = output;

    return output;
  }

  resetFilterState() {
    for (let ch = 0; ch < 2; ch++) {
      this.x1[ch] = 0;
      this.x2[ch] = 0;
      this.y1[ch] = 0;
      this.y2[ch] = 0;
    }
  }
}

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
  { name: "loopEnd", defaultValue: 0 },
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
];

class SampleProcessor extends FilterProcessor {
  readIndex = 0;
  buffer = null;
  isRunning = false;
  scheduledStartTime = null;
  scheduledStopTime = null;
  loop = false;
  loopStart = 0;

  static get parameterDescriptors() {
    return parameterDescriptors;
  }

  constructor({ processorOptions = {} }) {
    super();
    this.updateFilterCoefficients(20000.0, 0.707);
    this.filterType = processorOptions.filterType ?? "none";
    this.loop = processorOptions.loop ?? false;
    this.loopStart = processorOptions.loopStart ?? 0;

    this.port.onmessage = (event) => {
      if (event.data.command === "buffer") {
        this.buffer = event.data.buffer; // Float32Array
      } else if (event.data.command === "start") {
        this.scheduledStartTime = event.data.time || currentTime;
        this.readIndex = event.data.offset || 0;
      } else if (event.data.command === "stop") {
        this.scheduledStopTime = event.data.time || currentTime;
      } else if (event.data.command === "loop") {
        this.loop = event.data.loop ?? false;
      } else if (event.data.command === "loopStart") {
        this.loopStart = event.data.loopStart ?? 0;
      }
    };
  }

  process(_, outputs, parameters) {
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
        this.port.postMessage({ event: "ended", time: currentTime });
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
      const loopEnd =
        (parameters.loopEnd[i] ?? parameters.loopEnd[0]) * sampleRate ||
        buffer.length;

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
        this.port.postMessage({ event: "ended", time: currentTime });
        break;
      }
    }
    return true;
  }
}

registerProcessor("buffer-source-processor", SampleProcessor);
