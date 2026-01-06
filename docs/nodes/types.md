# Node State Types

Each node defines its own state type and registers it with the global type system using TypeScript module augmentation.

## How It Works

The core types in `src/graph/types.ts` define:

```ts
// Empty interface that nodes augment
interface NodeTypeMap {}

// Derived types
type NodeType = keyof NodeTypeMap;
type GraphNode = { [K in NodeType]: GraphNodeBase<K, NodeTypeMap[K]> }[NodeType];
```

When you augment `NodeTypeMap`, TypeScript automatically updates `NodeType` and `GraphNode`.

## Defining a Node State Type

Create `types.ts` in your node folder:

```ts
// src/nodes/foo/types.ts
export type FooState = {
  enabled: boolean;
  value: number;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    foo: FooState;
  }
}
```

**Important**: The `types.ts` file must be imported somewhere to take effect. This is done in your node's `index.ts`:

```ts
import "./types";  // Side-effect import for module augmentation
```

## Extracting Typed Nodes

Use `Extract` to get a fully-typed node from the union:

```ts
import type { GraphNode } from "../../graph/types";

type FooNode = Extract<GraphNode, { type: "foo" }>;
// FooNode = { id: NodeId; type: "foo"; x: number; y: number; state: FooState; zOrder?: number }
```

## State Design Guidelines

### Keep State Serializable

State is persisted to IndexedDB via Automerge. Only use JSON-serializable values:

```ts
// Good
type GoodState = {
  frequency: number;
  waveform: "sine" | "square";
  enabled: boolean;
};

// Bad - functions and class instances won't serialize
type BadState = {
  callback: () => void;
  audioNode: OscillatorNode;
};
```

### Separate Runtime State

For runtime-only data (not persisted), use `getRuntimeState()` in your audio runtime instead of node state.

### Use Discriminated Unions

For nodes with modes:

```ts
type OscillatorState = {
  source: "wave" | "noise";
  waveform: OscillatorType;  // Only relevant when source === "wave"
};
```

## Examples from the Codebase

### Simple State (Gain)

```ts
export type GainState = {
  depth: number;  // 0..2
};
```

### Complex State (Envelope)

```ts
export type EnvelopeState = {
  env: {
    attackMs: number;
    decayMs: number;
    sustain: number;
    releaseMs: number;
    attackShape: number;   // -1..1 curve shape
    decayShape: number;
    releaseShape: number;
  };
  lastMidiNote: number | null;
  lastMidiAtMs: number | null;
  lastMidiOffAtMs: number | null;
};
```

### State with Optional Fields (Sample Player)

```ts
export type SamplePlayerState = {
  sampleId: string | null;
  sampleName: string | null;
  gain: number;
  followPitch: boolean;
  rootNote: number;
  stopOnNoteOff: boolean;
};
```

## Type IDs

Node and connection IDs use branded string types for type safety:

```ts
type NodeId = string & { readonly __brand: "NodeId" };
type ConnectionId = string & { readonly __brand: "ConnectionId" };
type PortId = string;  // Not branded, but should be stable strings
```

Create IDs using the helper functions:

```ts
import { createNodeId, createConnectionId } from "../../graph/types";

const nodeId = createNodeId();      // "n_abc123..."
const connId = createConnectionId(); // "c_xyz789..."
```
