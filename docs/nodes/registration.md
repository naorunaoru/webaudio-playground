# Node Registration

Nodes are registered as modules that combine graph definition and audio factory into a single unit.

## NodeModule Interface

From `src/types/nodeModule.ts`:

```ts
type NodeModule<TNode extends GraphNode> = {
  type: TNode["type"];
  graph: NodeDefinition<TNode>;
  audioFactory?: (services: AudioNodeServices) => AudioNodeFactory<TNode>;
  workletModules?: string[];  // URLs to preload
};
```

## Creating the Module Export

Each node folder has an `index.ts` that exports the complete module:

```ts
// src/nodes/foo/index.ts
import "./types";  // Important: side-effect import for type augmentation
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

### Graph-Only Nodes

For nodes without audio processing (like MIDI sources):

```ts
// src/nodes/midiSource/index.ts
import "./types";
import type { NodeModule } from "../../types/nodeModule";
import { midiSourceGraph } from "./graph";

export const midiSourceNode: NodeModule<any> = {
  type: "midiSource",
  graph: midiSourceGraph,
  // No audioFactory - this is a graph-only node
};
```

### Nodes with AudioWorklet

For nodes using custom DSP processors:

```ts
// src/nodes/limiter/index.ts
import "./types";
import type { NodeModule } from "../../types/nodeModule";
import { limiterGraph } from "./graph";
import { limiterAudioFactory } from "./audio";
import processorUrl from "./processor.ts?url";

export const limiterNode: NodeModule<any> = {
  type: "limiter",
  graph: limiterGraph,
  audioFactory: limiterAudioFactory,
  workletModules: [processorUrl],
};
```

The `?url` import suffix (Vite feature) returns the URL to the processor file, which is preloaded before audio starts.

## Registering in NODE_MODULES

Add your module to `src/nodes/index.ts`:

```ts
import { oscillatorNode } from "./oscillator";
import { gainNode } from "./gain";
import { filterNode } from "./filter";
import { fooNode } from "./foo";
// ... other imports

export const NODE_MODULES = {
  oscillator: oscillatorNode,
  gain: gainNode,
  filter: filterNode,
  foo: fooNode,
  // ... other nodes
} as const;
```

## How Registration Works

`NODE_MODULES` is the single source of truth. The rest of the app derives from it:

### Graph Layer

The graph editor uses `NODE_MODULES` to:
- Get `NodeDefinition` for each type (ports, UI, title)
- Create new nodes with correct initial state
- Route MIDI/CC events via `onMidi` handlers

### Audio Layer

The audio engine uses `NODE_MODULES` to:
- Get `AudioNodeFactory` for each type
- Collect `workletModules` URLs to preload
- Create `AudioNodeInstance` for each graph node

### Type System

TypeScript uses module augmentation to derive:
- `NodeType` - union of all registered type strings
- `GraphNode` - discriminated union of all node shapes

## Registration Checklist

When adding a new node:

1. **Create the folder**: `src/nodes/<yourNode>/`

2. **Create types.ts**: Define state and augment `NodeTypeMap`

3. **Create graph.tsx**: Define `NodeDefinition` with ports and UI

4. **Create audio.ts** (optional): Define `AudioNodeFactory`

5. **Create index.ts**: Export `NodeModule`
   - Import `"./types"` for side effects
   - Include `workletModules` if using AudioWorklet

6. **Register in src/nodes/index.ts**: Add to `NODE_MODULES`

7. **Test**: The node should appear in the add menu and function correctly

## Example: Complete Registration

```ts
// src/nodes/index.ts
import { midiSourceNode } from "./midiSource";
import { ccSourceNode } from "./ccSource";
import { oscillatorNode } from "./oscillator";
import { envelopeNode } from "./envelope";
import { gainNode } from "./gain";
import { filterNode } from "./filter";
import { delayNode } from "./delay";
import { reverbNode } from "./reverb";
import { limiterNode } from "./limiter";
import { samplePlayerNode } from "./samplePlayer";
import { audioOutNode } from "./audioOut";

export const NODE_MODULES = {
  midiSource: midiSourceNode,
  ccSource: ccSourceNode,
  oscillator: oscillatorNode,
  envelope: envelopeNode,
  gain: gainNode,
  filter: filterNode,
  delay: delayNode,
  reverb: reverbNode,
  limiter: limiterNode,
  samplePlayer: samplePlayerNode,
  audioOut: audioOutNode,
} as const;

export type NodeModuleMap = typeof NODE_MODULES;
```
