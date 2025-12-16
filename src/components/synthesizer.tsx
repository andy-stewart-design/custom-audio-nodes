import { useState, type ChangeEvent } from "react";
import SynthesizerNode from "../audio-nodes/synthesizer-node";
import type { SynthesizerParameter } from "../worklets/synthesizer-processor";
import type { FilterType } from "../worklets/abstract-filter-processor";

function Synthesizer({ ctx }: { ctx: AudioContext }) {
  const [synthNode, setSynthNode] = useState<SynthesizerNode | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("lowpass");

  function play() {
    if (!ctx || synthNode) return;
    if (ctx.state === "suspended") ctx.resume();

    const node = new SynthesizerNode(ctx, {
      type: 1,
      frequency: 220,
      filterType,
      filterFrequency: 600,
    });

    const now = node.context.currentTime;
    const ease = 0.5;
    node.gain.setValueAtTime(0, now);
    node.gain.linearRampToValueAtTime(0.1, now + ease);

    // Animate filter during the note
    node.filterFrequency.setValueAtTime(400, now);
    node.filterFrequency.exponentialRampToValueAtTime(5000, now + ease);
    node.filterFrequency.exponentialRampToValueAtTime(600, now + ease * 2);

    node.connect(ctx.destination);
    node.start(ctx.currentTime);
    node.addEventListener("ended", () => {
      console.log("Synthesizer ended");
      node.disconnect();
      setSynthNode(null);
    });

    setSynthNode(node);
  }

  function stop() {
    if (!synthNode) return;
    const now = synthNode.context.currentTime;
    synthNode.gain.cancelScheduledValues(now);
    synthNode.gain.setValueAtTime(synthNode.gain.value, now);
    synthNode.gain.linearRampToValueAtTime(0, now + 0.5);
    synthNode.stop(now + 1);
  }

  function handleChange(
    key: SynthesizerParameter,
    e: ChangeEvent<HTMLInputElement>
  ) {
    if (!synthNode) return;
    synthNode[key].setValueAtTime(
      e.target.valueAsNumber,
      synthNode.context.currentTime + 0.05
    );
  }

  function handleSetFilterType(e: ChangeEvent<HTMLSelectElement>) {
    setFilterType(e.target.value as FilterType);
    synthNode?.setFilterType(e.target.value as FilterType);
  }

  return (
    <section>
      <h2>Synth Node</h2>
      <button onClick={play}>Play</button>
      <button onClick={stop}>Stop</button>
      <label style={{ display: "block" }}>
        Oscillator Type
        <input
          type="range"
          min={0}
          max={3}
          defaultValue={1}
          step={0.01}
          onChange={(e) => synthNode?.setOscillatorType(e.target.valueAsNumber)}
        />
      </label>
      <label style={{ display: "block" }}>
        Frequency
        <input
          type="range"
          min={20}
          max={1046.5}
          step={0.01}
          defaultValue={220}
          onChange={(e) => handleChange("frequency", e)}
        />
      </label>
      <label style={{ display: "block" }}>
        Detune
        <input
          type="range"
          min={-1000}
          max={1000}
          step={0.01}
          defaultValue={0}
          onChange={(e) => handleChange("detune", e)}
        />
      </label>
      <label>
        Filter Type
        <select
          key={synthNode?.filterType}
          id="filterTypeSelect"
          value={filterType}
          onChange={handleSetFilterType}
        >
          <option value="none">No Filter</option>
          <option value="lowpass">Lowpass</option>
          <option value="highpass">Highpass</option>
          <option value="bandpass">Bandpass</option>
        </select>
      </label>
      <label style={{ display: "block" }}>
        Filter Frequency
        <input
          type="range"
          min={200}
          max={2000}
          defaultValue={600}
          onChange={(e) => handleChange("filterFrequency", e)}
        />
      </label>
      <label style={{ display: "block" }}>
        Filter Resonance
        <input
          type="range"
          min={0.707}
          max={30}
          step={0.0001}
          defaultValue={0.707}
          onChange={(e) => handleChange("filterQ", e)}
        />
      </label>
    </section>
  );
}

export default Synthesizer;
