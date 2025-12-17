import { useEffect, useState, type ChangeEvent } from "react";
import SampleNode from "../audio-nodes/sample-node";
import type { SampleParameter } from "../worklets/sample-processor";
import type { FilterType } from "../worklets/abstract-filter-processor";

function Sample({ ctx }: { ctx: AudioContext }) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sampleNode, setSampleNode] = useState<SampleNode | null>(null);
  const [startOffset, setStartOffset] = useState<number>(0.0);
  const [loop, setLoop] = useState<boolean>(true);
  const [loopStart, setLoopStart] = useState<number>(0.875);
  const [loopEnd, setLoopEnd] = useState<number>(1);
  const [filterType, setFilterType] = useState<FilterType>("lowpass");

  useEffect(() => {
    const init = async () => {
      const buffer = await loadSample(ctx);
      setBuffer(buffer);
    };

    init();
  }, [ctx]);

  function play() {
    if (!ctx || !buffer || sampleNode) return;
    if (ctx.state === "suspended") ctx.resume();

    const node = new SampleNode(ctx, buffer, {
      loop,
      loopStart,
      loopEnd,
      playbackRate: 1.0,
      filterType,
      filterFrequency: 600,
    });

    node.connect(ctx.destination);
    node.start(ctx.currentTime, startOffset);
    node.addEventListener("ended", () => {
      console.log("Sample ended");
      node.disconnect();
      setSampleNode(null);
    });

    setSampleNode(node);
  }

  function stop() {
    if (!sampleNode) return;
    const now = sampleNode.context.currentTime;
    sampleNode.gain.cancelScheduledValues(now);
    sampleNode.gain.setValueAtTime(sampleNode.gain.value, now);
    sampleNode.gain.linearRampToValueAtTime(0, now + 0.5);
    sampleNode.stop(now + 1);
    setSampleNode(null);
  }

  function handleChange(
    key: SampleParameter,
    e: ChangeEvent<HTMLInputElement>
  ) {
    if (!sampleNode) return;
    sampleNode[key].setValueAtTime(
      e.target.valueAsNumber,
      sampleNode.context.currentTime + 0.05
    );
  }

  function handleSetLoop(e: ChangeEvent<HTMLInputElement>) {
    setLoop(e.target.checked);
    sampleNode?.setLoop(e.target.checked);
  }

  function handleSetLoopStart(e: ChangeEvent<HTMLInputElement>) {
    setLoopStart(e.target.valueAsNumber);
    sampleNode?.setLoopStart(e.target.valueAsNumber);
  }

  function handleSetLoopEnd(e: ChangeEvent<HTMLInputElement>) {
    setLoopEnd(e.target.valueAsNumber);
    sampleNode?.setLoopEnd(e.target.valueAsNumber);
  }

  function handleSetFilterType(e: ChangeEvent<HTMLSelectElement>) {
    setFilterType(e.target.value as FilterType);
    sampleNode?.setFilterType(e.target.value as FilterType);
  }

  return (
    <section>
      <h2>Sample Node</h2>
      <button onClick={play} disabled={!buffer || !!sampleNode}>
        Play
      </button>
      <button onClick={stop} disabled={!buffer || !sampleNode}>
        stop
      </button>
      <label style={{ display: "block" }}>
        Start Offset
        <input
          type="range"
          min={0}
          max={1}
          step={0.125}
          value={startOffset}
          onChange={(e) => setStartOffset(e.target.valueAsNumber)}
        />
      </label>
      <label style={{ display: "block" }}>
        <input type="checkbox" checked={loop} onChange={handleSetLoop} />
        Loop
      </label>
      <label style={{ display: "block" }}>
        Loop Start
        <input
          type="range"
          min={0}
          max={1}
          step={0.125}
          value={loopStart}
          onChange={handleSetLoopStart}
        />
      </label>
      <label style={{ display: "block" }}>
        Loop End
        <input
          type="range"
          min={0}
          max={1}
          step={0.125}
          value={loopEnd}
          onChange={handleSetLoopEnd}
        />
      </label>
      <label>
        Filter Type
        <select
          key={sampleNode?.filterType}
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
        Filter Q
        <input
          type="range"
          min={0.707}
          max={30}
          step={0.0001}
          defaultValue={0.707}
          onChange={(e) => handleChange("filterQ", e)}
        />
      </label>
      <label style={{ display: "block" }}>
        PBR
        <input
          type="range"
          min={0.25}
          max={5}
          step={0.01}
          defaultValue={1}
          onChange={(e) => handleChange("playbackRate", e)}
        />
      </label>
    </section>
  );
}

export default Sample;

async function loadSample(ctx: AudioContext) {
  const response = await fetch("/break-1.mp3");
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  return buffer;
}
