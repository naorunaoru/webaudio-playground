# Writing Nodes (Graph + Audio) — Guide

This project treats each node as a small “plugin module” that can provide:
- **Graph/UI definition** (ports + React UI + optional MIDI/CC handling)
- **Audio runtime factory** (optional; for nodes that produce/consume audio)
- **AudioWorklet modules** (optional; for DSP on the render thread)
- **WASM build step** (optional; for nodes implemented in Rust/C/C++ → WebAssembly)
- **State type** (per-node `state` typing integrated into the global `GraphNode` union)

The goal is that adding a node mostly means adding a new folder under `src/nodes/<yourNode>/`.

## Folder Layout
Create a folder like:

```
src/nodes/<yourNode>/
  types.ts
  graph.tsx
  audio.ts        # optional
  index.ts
  processor.ts    # optional (AudioWorkletProcessor)
  build-wasm.sh   # optional (node-local WASM build step)
  build-wasm.mjs  # optional (node-local WASM build step)
```

Existing examples:
- `src/nodes/oscillator/` (graph + audio)
- `src/nodes/audioOut/` (graph + audio)
- `src/nodes/midiSource/` (graph only)
- `src/nodes/ccSource/` (graph only)

## 1) Define the Node State Type (`types.ts`)
Each node contributes its `state` type via module augmentation of `NodeTypeMap` in `src/graph/types.ts`.

Example:

```ts
// src/nodes/foo/types.ts
export type FooState = { enabled: boolean };

declare module "../../graph/types" {
  interface NodeTypeMap {
    foo: FooState;
  }
}
```

Why this exists:
- `src/graph/types.ts` defines `GraphNode` and `NodeType` based on `NodeTypeMap`.
- Module augmentation lets node folders “register” themselves with the global graph typing.

Important:
- Make sure `types.ts` gets imported somewhere. We do this in `index.ts` via `import "./types";`.

## 2) Define Ports + UI + (Optional) Event Handling (`graph.tsx`)
Graph/UI definitions use `NodeDefinition<TNode>` from `src/types/graphNodeDefinition.ts`.

Key concepts:
- `ports(node)` returns a typed port list. Ports are identified by `portId` strings.
- Port kinds are `audio | midi | cc | automation` (see `src/graph/types.ts`).
- `ui` is a React component that edits `node.state` via `onPatchNode`.
- `onEmitMidi(nodeId, event)` emits events into the graph router (used by MIDI/CC source nodes).
- `onMidi(node, event, portId)` is called when an incoming event arrives at this node, on a specific destination `portId`.
  - Return a partial patch of `node.state` to apply (immutably).

Example skeleton:

```tsx
// src/nodes/foo/graph.tsx
import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type FooNode = Extract<GraphNode, { type: "foo" }>;

const FooUi: React.FC<NodeUiProps<FooNode>> = ({ node, onPatchNode }) => {
  return (
    <button onClick={() => onPatchNode(node.id, { enabled: !node.state.enabled })}>
      {node.state.enabled ? "On" : "Off"}
    </button>
  );
};

export const fooGraph: NodeDefinition<FooNode> = {
  type: "foo",
  title: "Foo",
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: FooUi,
  onMidi: (node, event, portId) => {
    // Handle CC/MIDI inputs if this node needs them.
    // Use `portId` to decide which input is being targeted.
    return null;
  },
};
```

## 3) Provide an Audio Runtime (`audio.ts`, optional)
Audio runtimes are factories returning `AudioNodeInstance` from `src/types/audioRuntime.ts`.

The engine expects audio nodes to expose:
- `getAudioInput(portId)` and/or `getAudioOutput(portId)` for patch cables (`kind: "audio"`).
- `updateState(state)` to reflect UI changes (e.g., oscillator waveform).
- Optional `handleMidi(event, portId, state)` for reacting to note events at runtime.
- Optional `getLevel()` for activity indicators.

Example skeleton:

```ts
// src/nodes/foo/audio.ts
import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type FooNode = Extract<GraphNode, { type: "foo" }>;

function createFooRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<FooNode> {
  const gain = ctx.createGain();
  return {
    type: "foo",
    updateState: (state) => {
      gain.gain.value = state.enabled ? 1 : 0;
    },
    getAudioInput: (portId) => (portId === "audio_in" ? gain : null),
    getAudioOutput: (portId) => (portId === "audio_out" ? gain : null),
    onRemove: () => gain.disconnect(),
  };
}

export function fooAudioFactory(_services: AudioNodeServices): AudioNodeFactory<FooNode> {
  return { type: "foo", create: (ctx, nodeId) => createFooRuntime(ctx, nodeId) };
}
```

Notes:
- The engine currently wires audio by matching connection endpoints:
  - `from.getAudioOutput(fromPortId)` → `to.getAudioInput(toPortId)`
- If your node uses different port IDs, implement them accordingly.
- If you need the engine’s master bus, use `services.masterInput` (see Output node).

## 4) Export as a Node Module (`index.ts`)
Node modules combine graph + audio into one registration unit.

```ts
// src/nodes/foo/index.ts
import "./types";
import type { NodeModule } from "../../types/nodeModule";
import { fooGraph } from "./graph";
import { fooAudioFactory } from "./audio";

export const fooNode: NodeModule<any> = {
  type: "foo",
  graph: fooGraph,
  audioFactory: fooAudioFactory, // omit if graph-only
  // Optional: list of AudioWorklet module URLs to preload before audio starts.
  // Typically: `import processorUrl from "./processor.ts?url";`
  // then `workletModules: [processorUrl]`.
  workletModules: [],
};
```

## 5) Register the Node
Add your module to `src/nodes/index.ts`:

```ts
import { fooNode } from "./foo";

export const NODE_MODULES = {
  // ...
  foo: fooNode,
};
```

The rest of the app derives its registries from `NODE_MODULES`:
- UI graph registry: `src/graph/nodeRegistry.ts`
- Audio factory registry: `src/audio/nodeRegistry.ts`

## WebAssembly Node Builds (Optional)
If a node needs a build step (e.g. Rust → `.wasm`), keep it **self-contained in the node folder**:
- `src/nodes/<yourNode>/build-wasm.sh` (shell), or
- `src/nodes/<yourNode>/build-wasm.mjs` (Node)

The repo script `npm run build-wasm` runs `scripts/build-wasm.mjs`, which scans `src/nodes/*/` for those files and executes them.

Notes:
- `npm run dev` and `npm run build` run `npm run build-wasm` first (via `predev` / `prebuild`).
- Set `SKIP_WASM=1` to bypass WASM builds (useful if you’re working on graph/UI only).

## How Events Flow (MIDI/CC)
Event type is `MidiEvent` in `src/graph/types.ts` (includes `noteOn`, `noteOff`, `cc`).

Routing:
- The graph editor emits events from a node via `onEmitMidi(nodeId, event)`.
- The router traverses outgoing connections of the *matching kind*:
  - `event.type === "cc"` uses connections with `kind: "cc"`
  - note events use connections with `kind: "midi"`
- The router delivers `(event, portId)` to the destination node’s `onMidi(...)`.
- The node’s `onMidi` returns a `state` patch (optional) which is applied to the graph state.

Audio reaction to notes:
- The audio engine dispatches note events to audio runtimes via `runtime.handleMidi(event, portId, node.state)`.
- CC is currently treated as *state changes* (handled by graph `onMidi`), not as a direct audio-runtime event.

## How Audio Wiring Works
Audio wiring is driven entirely by graph `connections` with `kind: "audio"`.
On each graph change:
- The engine instantiates/removes audio runtimes based on `GraphNode.type` and registered factories.
- It disconnects previous audio edges (by source-port) and reconnects according to current connections.

## Tips / Conventions
- Keep port IDs stable; connections are serialized in localStorage.
- Prefer using `onMidi(..., portId)` to keep CC inputs separate (e.g. oscillator’s `cc_attack`).
- If your runtime needs to clean up, implement `onRemove`.
- If you expose `getLevel()`, you’ll get activity dots “for free” in the graph renderer.
