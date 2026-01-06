# Node Architecture Overview

This guide walks through creating a new node from scratch.

## Folder Layout

Create a folder under `src/nodes/<yourNode>/`:

```
src/nodes/<yourNode>/
  types.ts          # State type definition
  graph.tsx         # Ports + UI + event handling
  audio.ts          # Audio runtime factory (optional)
  index.ts          # NodeModule export
  processor.ts      # AudioWorkletProcessor (optional)
  build-wasm.mjs    # WASM build script (optional)
```

## Implementation Steps

### Step 1: Define the State Type

See [types.md](./types.md) for details.

```ts
// src/nodes/foo/types.ts
export type FooState = { enabled: boolean };

declare module "../../graph/types" {
  interface NodeTypeMap {
    foo: FooState;
  }
}
```

### Step 2: Define Ports and UI

See [graph-definition.md](./graph-definition.md) for details.

```tsx
// src/nodes/foo/graph.tsx
import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/nodeModule";

type FooNode = Extract<GraphNode, { type: "foo" }>;

const FooUi: React.FC<NodeUiProps<FooNode>> = ({ node, onPatchNode }) => (
  <button onClick={() => onPatchNode(node.id, { enabled: !node.state.enabled })}>
    {node.state.enabled ? "On" : "Off"}
  </button>
);

export const fooGraph: NodeDefinition<FooNode> = {
  type: "foo",
  title: "Foo",
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: FooUi,
};
```

### Step 3: Create Audio Runtime (Optional)

See [audio-runtime.md](./audio-runtime.md) for details.

```ts
// src/nodes/foo/audio.ts
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/nodeModule";

type FooNode = Extract<GraphNode, { type: "foo" }>;

function createFooRuntime(ctx: AudioContext): AudioNodeInstance<FooNode> {
  const gain = ctx.createGain();
  return {
    type: "foo",
    updateState: (state) => { gain.gain.value = state.enabled ? 1 : 0; },
    getAudioInput: (portId) => (portId === "audio_in" ? gain : null),
    getAudioOutput: (portId) => (portId === "audio_out" ? gain : null),
    onRemove: () => gain.disconnect(),
  };
}

export function fooAudioFactory(): AudioNodeFactory<FooNode> {
  return { type: "foo", create: (ctx) => createFooRuntime(ctx) };
}
```

### Step 4: Export as NodeModule

See [registration.md](./registration.md) for details.

```ts
// src/nodes/foo/index.ts
import "./types";
import type { NodeModule } from "../../types/nodeModule";
import { fooGraph } from "./graph";
import { fooAudioFactory } from "./audio";

export const fooNode: NodeModule<any> = {
  type: "foo",
  graph: fooGraph,
  audioFactory: fooAudioFactory,
  workletModules: [],
};
```

### Step 5: Register the Node

Add to `src/nodes/index.ts`:

```ts
import { fooNode } from "./foo";

export const NODE_MODULES = {
  // ...existing nodes
  foo: fooNode,
};
```

## Base Node Structure

All nodes share a common base structure defined in `src/graph/types.ts`:

```ts
type GraphNodeBase<TType, TState> = {
  id: NodeId;           // Unique identifier (e.g., "n_xyz123")
  type: TType;          // Node type string
  x: number;            // Canvas X position
  y: number;            // Canvas Y position
  state: TState;        // Type-specific state object
  zOrder?: number;      // Stacking order for overlapping nodes
};
```

## Graph State

The overall graph structure:

```ts
type GraphState = {
  nodes: GraphNode[];              // All nodes
  connections: GraphConnection[];  // All connections
  nodeZOrder?: Record<NodeId, number>;
};
```

State is managed externally by Automerge CRDT with:
- Persistent mutations (with undo/redo history)
- Ephemeral mutations (for high-frequency updates like knob dragging)
- IndexedDB persistence
