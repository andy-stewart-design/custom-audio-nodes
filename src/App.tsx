import { useEffect, useState } from "react";
import Sample from "./components/sample";
import SampleProcessor from "./worklets/sample-processor.js?raw";
import SynthesizerProcessor from "./worklets/synthesizer-processor.js?raw";
import Synthesizer from "./components/synthesizer";

function App() {
  const [ctx, setCtx] = useState<AudioContext | null>(null);

  useEffect(() => {
    const init = async () => {
      const audioContext = new AudioContext();
      await Promise.all([
        initProcessor(audioContext, SampleProcessor),
        initProcessor(audioContext, SynthesizerProcessor),
      ]);
      setCtx(audioContext);
    };

    init();
  }, []);

  return (
    <div>
      <h1>Custom Audio Nodes</h1>
      {ctx && (
        <>
          <Sample ctx={ctx} />
          <Synthesizer ctx={ctx} />
        </>
      )}
    </div>
  );
}

export default App;

async function initProcessor(ctx: AudioContext, code: string) {
  const blob = new Blob([code], { type: "application/javascript" });
  let processorURL: string | null = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(processorURL);
  URL.revokeObjectURL(processorURL);
  processorURL = null;
}
