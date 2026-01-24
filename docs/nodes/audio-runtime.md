# Audio Runtime

Audio runtimes manage Web Audio API nodes for each graph node. They're optional - graph-only nodes (like midiSource) don't need them.

## AudioNodeInstance Interface

From `src/types/audioRuntime.ts`:

```ts
type AudioNodeInstance<TNode extends GraphNode> = {
  type: TNode["type"];

  // Required
  updateState: (state: TNode["state"]) => void;

  // Audio I/O - returns arrays for polyphony support
  getAudioInputs?: (portId: string) => (AudioNode | AudioParam)[];
  getAudioOutputs?: (portId: string) => AudioNode[];

  // MIDI handling
  handleMidi?: (event: MidiEvent, portId: string | null, state: TNode["state"]) => void;

  // Gate/trigger event handling (for polyphonic voice events)
  handleEvent?: (portId: string, event: VoiceEvent) => void;

  // Graph reference (for nodes that need to dispatch events)
  setGraphRef?: (graph: GraphState) => void;

  // Cleanup
  onRemove?: () => void;

  // Metering and visualization
  getLevel?: () => number;
  getWaveform?: (length: number) => Float32Array | null;

  // Runtime-only state (not persisted)
  getRuntimeState?: () => unknown;
};
```

**Note:** Audio I/O methods return arrays to support polyphonic (N-channel) connections. For mono nodes, return single-element arrays.

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

### getAudioInputs

Returns an array of Web Audio nodes/params that receive audio for a given port:

```ts
getAudioInputs: (portId) => {
  switch (portId) {
    case "audio_in": return [inputGain];           // AudioNode
    case "cv_frequency": return [filter.frequency]; // AudioParam
    default: return [];
  }
},
```

Returning an `AudioParam` allows direct CV modulation. For polyphonic nodes, return N elements.

### getAudioOutputs

Returns an array of Web Audio nodes that output audio for a given port:

```ts
getAudioOutputs: (portId) => {
  if (portId === "audio_out") return [outputGain];
  return [];
},
```

For polyphonic nodes, return N elements (one per voice channel).

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
  masterInput: AudioNode;       // Connect here for master output
  graphContext: AudioGraphContext;  // Tempo, A4 tuning, etc.
  dispatchEvent: DispatchEventFn;   // Dispatch gate/trigger events
};
```

- `masterInput`: Used by audioOut to route to the master bus
- `graphContext`: Subscribe to tempo, A4 tuning, time signature
- `dispatchEvent`: Dispatch VoiceEvents to connected nodes (for MIDI-to-CV, etc.)

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

## Audio Engine Lifecycle (App-Level)

The audio runtime instances above are managed by a single `AudioEngine` singleton (`src/audio/engine.ts`) that owns the `AudioContext` and keeps it in sync with the current graph.

### Context Creation

The engine creates the `AudioContext` lazily (on first start/toggle) and sets up a simple master chain:
- A master gain node (the “master input” passed to node factories)
- A master analyser used for output metering/waveform capture
- The analyser connects to `audioContext.destination`

### Starting and Stopping

Browsers typically require a user gesture before audio can start. The app handles this in `src/App.tsx` by calling `engine.ensureRunning()` on first pointer/key interaction (unless the user explicitly clicked the audio toggle).

There are two entry points:
- `ensureRunning()`: loads worklets (if needed) and resumes the context
- `toggleRunning()`: suspend/resume for the UI “Audio:” button

### Worklet Preloading

Before the context is resumed, the engine preloads any built-in AudioWorklet modules declared by registered nodes:
- Node modules declare URLs in `workletModules`
- `src/audio/nodeRegistry.ts` collects and de-duplicates them
- The engine loads each module once per session via `audioContext.audioWorklet.addModule(url)`

### Graph Sync

When audio is on, the graph editor calls `engine.syncGraph(graph)` whenever the graph changes.

At a high level, sync does:
- Remove runtimes for deleted nodes (calling `onRemove` when present)
- Create runtimes for new nodes (via the registered `AudioNodeFactory` for that node type)
- Push the latest persisted node state into each runtime via `updateState(state)`
- Rebuild audio and automation connections based on the graph’s current edges

Audio-like connections (`audio`, `cv`, `pitch`) use Web Audio node connections. Event connections (`gate`, `trigger`) and MIDI use BFS dispatch.

### Event Dispatch

Gate and trigger events are dispatched via `dispatchEvent()` and delivered to nodes via `handleEvent()`. This enables sample-accurate scheduling through Web Audio automation.

### Metering and Runtime Telemetry

For visualization, the engine can query:
- Per-node meters via `getLevel()` (if implemented by that runtime)
- Master output level/waveform via the engine’s analyser
- Runtime-only telemetry via `getRuntimeState()` (used in `src/App.tsx` to estimate DSP load for custom processors)
