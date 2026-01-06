# Audio Runtime

Audio runtimes manage Web Audio API nodes for each graph node. They're optional - graph-only nodes (like midiSource) don't need them.

## AudioNodeInstance Interface

From `src/types/nodeModule.ts`:

```ts
type AudioNodeInstance<TNode extends GraphNode> = {
  type: TNode["type"];

  // Required
  updateState: (state: TNode["state"]) => void;

  // Audio I/O (implement based on your ports)
  getAudioInput?: (portId: string) => AudioNode | AudioParam | null;
  getAudioOutput?: (portId: string) => AudioNode | null;

  // MIDI handling
  handleMidi?: (event: MidiEvent, portId: string | null, state: TNode["state"]) => void;

  // Cleanup
  onRemove?: () => void;

  // Metering and visualization
  getLevel?: () => number;
  getWaveform?: (length: number) => Float32Array | null;

  // Runtime-only state (not persisted)
  getRuntimeState?: () => unknown;
};
```

## AudioNodeFactory Interface

```ts
type AudioNodeFactory<TNode extends GraphNode> = {
  type: TNode["type"];
  create: (ctx: AudioContext, nodeId: NodeId) => AudioNodeInstance<TNode>;
};

// Factory function signature
type AudioFactoryFn<TNode extends GraphNode> = (
  services: AudioNodeServices
) => AudioNodeFactory<TNode>;
```

## Basic Example

```ts
// src/nodes/gain/audio.ts
import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/nodeModule";

type GainNode = Extract<GraphNode, { type: "gain" }>;

function createGainRuntime(ctx: AudioContext): AudioNodeInstance<GainNode> {
  const gain = ctx.createGain();

  return {
    type: "gain",

    updateState: (state) => {
      gain.gain.value = state.depth;
    },

    getAudioInput: (portId) => {
      if (portId === "audio_in") return gain;
      if (portId === "cv_in") return gain.gain;  // AudioParam for CV
      return null;
    },

    getAudioOutput: (portId) => {
      if (portId === "audio_out") return gain;
      return null;
    },

    onRemove: () => {
      gain.disconnect();
    },
  };
}

export function gainAudioFactory(): AudioNodeFactory<GainNode> {
  return {
    type: "gain",
    create: (ctx) => createGainRuntime(ctx),
  };
}
```

## Audio I/O Methods

### getAudioInput

Returns the Web Audio node/param that receives audio for a given port:

```ts
getAudioInput: (portId) => {
  switch (portId) {
    case "audio_in": return inputGain;           // AudioNode
    case "cv_frequency": return filter.frequency; // AudioParam
    default: return null;
  }
},
```

Returning an `AudioParam` allows direct modulation from CV sources.

### getAudioOutput

Returns the Web Audio node that outputs audio for a given port:

```ts
getAudioOutput: (portId) => {
  if (portId === "audio_out") return outputGain;
  return null;
},
```

## MIDI Handling

For nodes that respond to MIDI events at audio runtime:

```ts
handleMidi: (event, portId, state) => {
  if (event.type === "noteOn") {
    oscillator.frequency.value = midiToFrequency(event.note);
    envelope.triggerAttack(event.velocity / 127);
  } else if (event.type === "noteOff") {
    envelope.triggerRelease();
  }
},
```

Note: CC events are typically handled by the graph layer's `onMidi`, which patches state. The audio runtime receives state changes via `updateState`.

## Metering

### getLevel

Return RMS level (0-1) for the activity meter in the node card:

```ts
getLevel: () => {
  const analyser = ctx.createAnalyser();
  // ... connect analyser to output
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);

  let sum = 0;
  for (const sample of data) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / data.length);
},
```

### getWaveform

Return waveform data for oscilloscope display:

```ts
getWaveform: (length) => {
  const data = new Float32Array(length);
  analyser.getFloatTimeDomainData(data);
  return data;
},
```

## Runtime State

For data that shouldn't be persisted but needs to be displayed in the UI:

```ts
getRuntimeState: () => ({
  phase: currentPhase,  // "attack" | "decay" | "sustain" | "release" | "idle"
  activeVoices: voiceCount,
}),
```

Access this in the UI via the `runtimeState` prop.

## Audio Node Services

The factory function receives `AudioNodeServices`:

```ts
type AudioNodeServices = {
  masterInput: AudioNode;  // Connect here for master output
};
```

Used by the audioOut node to route to the master bus.

## Complex Example: Oscillator

```ts
function createOscillatorRuntime(ctx: AudioContext): AudioNodeInstance<OscillatorNode> {
  let osc: OscillatorNode | null = null;
  let noiseSource: AudioBufferSourceNode | null = null;
  const outputGain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  outputGain.connect(analyser);

  function startOscillator(waveform: OscillatorType) {
    osc?.stop();
    osc = ctx.createOscillator();
    osc.type = waveform;
    osc.connect(outputGain);
    osc.start();
  }

  function startNoise() {
    // Create noise buffer...
    noiseSource = ctx.createBufferSourceNode();
    noiseSource.connect(outputGain);
    noiseSource.loop = true;
    noiseSource.start();
  }

  return {
    type: "oscillator",

    updateState: (state) => {
      if (state.source === "wave") {
        noiseSource?.stop();
        noiseSource = null;
        if (!osc) startOscillator(state.waveform);
        else osc.type = state.waveform;
      } else {
        osc?.stop();
        osc = null;
        if (!noiseSource) startNoise();
      }
    },

    getAudioOutput: (portId) => {
      if (portId === "audio_out") return outputGain;
      return null;
    },

    handleMidi: (event, portId, state) => {
      if (event.type === "noteOn" && osc) {
        osc.frequency.value = 440 * Math.pow(2, (event.note - 69) / 12);
      }
    },

    onRemove: () => {
      osc?.stop();
      noiseSource?.stop();
      outputGain.disconnect();
    },

    getLevel: () => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const s of data) sum += s * s;
      return Math.sqrt(sum / data.length);
    },

    getWaveform: (length) => {
      const data = new Float32Array(length);
      analyser.getFloatTimeDomainData(data);
      return data;
    },
  };
}
```

## AudioWorklet Integration

For custom DSP, use AudioWorklet. See [wasm.md](./wasm.md) for details on combining with WASM.

```ts
// In your audio.ts
import processorUrl from "./processor.ts?url";

function createLimiterRuntime(ctx: AudioContext): AudioNodeInstance<LimiterNode> {
  // AudioWorkletNode created after worklet module is loaded
  const workletNode = new AudioWorkletNode(ctx, "limiter-processor");
  // ...
}

// In your index.ts
export const limiterNode: NodeModule<any> = {
  type: "limiter",
  graph: limiterGraph,
  audioFactory: limiterAudioFactory,
  workletModules: [processorUrl],  // Preloaded before audio starts
};
```
