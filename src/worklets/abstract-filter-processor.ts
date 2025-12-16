type FilterType = "none" | "lowpass" | "highpass" | "bandpass";

abstract class FilterProcessor extends AudioWorkletProcessor {
  filterType: FilterType = "none";

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

  updateFilterCoefficients(cutoffFreq: number, q: number) {
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

  applyFilter(input: number, channel: number) {
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

export default FilterProcessor;
export type { FilterType };
