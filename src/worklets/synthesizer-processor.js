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
    name: "type",
    automationRate: "k-rate",
    defaultValue: 0, // 0=sine, 1=sawtooth, 2=triangle, 3=square
    minValue: 0,
    maxValue: 3,
  },
  {
    name: "frequency",
    automationRate: "a-rate",
    defaultValue: 440.0,
    minValue: 20.0,
    maxValue: 20000.0,
  },
  {
    name: "detune",
    automationRate: "a-rate",
    defaultValue: 0.0,
    minValue: -153600.0,
    maxValue: 153600.0,
  },
  {
    name: "gain",
    automationRate: "a-rate",
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

class SynthesizerProcessor extends FilterProcessor {
  currentPhase = 0.0;
  isRunning = false;
  scheduledStartTime = null;
  scheduledStopTime = null;

  static get parameterDescriptors() {
    return parameterDescriptors;
  }

  constructor({ processorOptions }) {
    super();
    this.updateFilterCoefficients(20000.0, 0.707);
    this.filterType = processorOptions.filterType ?? "none";

    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case "start":
          this.scheduledStartTime = data.time || currentTime;
          this.currentPhase = 0.0;
          break;
        case "stop":
          this.scheduledStopTime = data.time || currentTime;
          break;
        case "filterType":
          this.filterType = data.filterType || "none";
          break;
      }
    };
  }

  generateWaveform(phase, type) {
    // Clamp type to valid range
    type = Math.max(0, Math.min(3, type));

    // Get the two waveforms to blend between
    const lowerType = Math.floor(type);
    const upperType = Math.ceil(type);
    const blend = type - lowerType; // 0 to 1 interpolation factor

    // Generate both waveforms
    const lower = this.getWaveformValue(phase, lowerType);
    const upper = this.getWaveformValue(phase, upperType);

    // Linear interpolation between the two
    return lower * (1 - blend) + upper * blend;
  }

  getWaveformValue(phase, type) {
    switch (type) {
      case 0: // Sine
        return Math.sin(2.0 * Math.PI * phase);
      case 1: // Sawtooth
        return 2.0 * phase - 1.0;
      case 2: // Triangle
        return phase < 0.5 ? 4.0 * phase - 1.0 : 3.0 - 4.0 * phase;
      case 3: // Square
        return phase < 0.5 ? 1.0 : -1.0;
      default:
        return Math.sin(2.0 * Math.PI * phase);
    }
  }

  postEndedMessage(time) {
    const msg = { type: "ended", time };
    this.port.postMessage(msg);
  }

  process(_, outputs, parameters) {
    const output = outputs[0];
    const typeArray = parameters.type;
    const frequencyArray = parameters.frequency;
    const detuneArray = parameters.detune;
    const gainArray = parameters.gain;
    const filterFrequencyArray = parameters.filterFrequency;
    const filterQArray = parameters.filterQ;

    const blockStartTime = currentTime;
    // const blockDuration = 128 / this.sampleRate;
    // const blockEndTime = blockStartTime + blockDuration;

    // Update filter coefficients (k-rate, so once per block)
    const filterFreq = filterFrequencyArray[0];
    const filterQ = filterQArray[0];
    this.updateFilterCoefficients(filterFreq, filterQ);

    for (let i = 0; i < output[0].length; i++) {
      const sampleTime = blockStartTime + i / sampleRate;

      if (
        this.scheduledStartTime !== null &&
        sampleTime >= this.scheduledStartTime &&
        !this.isRunning
      ) {
        this.isRunning = true;
        this.scheduledStartTime = null;
      }

      if (
        this.scheduledStopTime !== null &&
        sampleTime >= this.scheduledStopTime &&
        this.isRunning
      ) {
        this.isRunning = false;
        this.scheduledStopTime = null;
        this.postEndedMessage(currentTime);
      }

      if (!this.isRunning) {
        for (let channel = 0; channel < output.length; channel++) {
          output[channel][i] = 0.0;
        }
        continue;
      }

      const baseFrequency = frequencyArray[i] ?? frequencyArray[0];
      const detuneCents = detuneArray[i] ?? detuneArray[0];
      const gain = gainArray[i] ?? gainArray[0];

      const detuneFactor = Math.pow(2.0, detuneCents / 1200.0);
      const actualFrequency = baseFrequency * detuneFactor;
      const phaseIncrement = actualFrequency / sampleRate;

      // Generate Sawtooth Waveform and apply gain
      const waveType = typeArray[i] ?? typeArray[0];
      const sample = this.generateWaveform(this.currentPhase, waveType) * gain;

      for (let channel = 0; channel < output.length; channel++) {
        // Apply filter if enabled, otherwise pass through
        if (this.filterType === "none") output[channel][i] = sample;
        else output[channel][i] = this.applyFilter(sample, channel);
      }

      this.currentPhase += phaseIncrement;
      if (this.currentPhase >= 1.0) this.currentPhase -= 1.0;
    }

    return true;
  }
}

registerProcessor("custom-oscillator-processor", SynthesizerProcessor);
