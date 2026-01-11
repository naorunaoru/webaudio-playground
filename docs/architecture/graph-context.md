# Audio Graph Context

Status: **Planned**

This document describes the architecture for a hierarchical reactive context system that provides implicit values (tempo, A4 frequency, time signature) to all nodes in the audio graph, including nested subgraphs.

---

## Motivation

Currently, global values like `A4_HZ = 440` are hardcoded constants in individual node files (e.g., `src/nodes/oscillator/audio.ts`). This creates several limitations:

1. **No runtime configurability** — Cannot change tuning reference without code changes
2. **No tempo-synced parameters** — Delay times, LFO rates cannot be expressed in beats
3. **No nested graph support** — Future subgraph nodes need inherited context
4. **No external sync** — Cannot integrate with external sequencers (Ableton Link, MIDI clock)

---

## Design Goals

- Nodes subscribe only to values they need (selective subscription)
- Context values propagate down to nested graphs automatically
- Runtime changes (tempo from external sequencer) are smooth and efficient
- Persistent values (A4, default tempo) are saved with the document
- Event bus for discrete events (transport start/stop, clock reset)

---

## Core Types

### Context Values

```typescript
// src/audio/context/types.ts

/** Pulses per quarter note — standard MIDI resolution */
export const PPQ = 480;

/** Context values available to all nodes */
export type AudioGraphContextValues = Readonly<{
  /** A4 reference frequency in Hz (default: 440) */
  a4Hz: number;

  /** Time signature as [beats per bar, beat unit] */
  timeSignature: readonly [number, number];

  /** Tempo in BPM */
  tempo: number;

  /** Sample rate (derived from AudioContext, read-only) */
  sampleRate: number;
}>;

/** Values persisted with the document */
export type PersistedContextValues = Pick<
  AudioGraphContextValues,
  "a4Hz" | "tempo" | "timeSignature"
>;
```

### Transport State

```typescript
/** Transient transport state (not persisted) */
export type TransportState = Readonly<{
  playing: boolean;
  /** Position in PPQ (pulses per quarter note, 480 PPQ) */
  positionPPQ: number;
  loopStartPPQ?: number;
  loopEndPPQ?: number;
}>;
```

### Events

```typescript
/** Events emitted on the context event bus */
export type AudioGraphEvent =
  | { type: "tempoChange"; tempo: number }
  | { type: "transportStateChange"; transport: TransportState }
  | { type: "timeSignatureChange"; timeSignature: readonly [number, number] }
  | { type: "a4Change"; a4Hz: number }
  | { type: "reset" };
```

---

## Context Interface

```typescript
// src/audio/context/AudioGraphContext.ts

export type ContextSubscriber<T> = (value: T) => void;
export type EventSubscriber = (event: AudioGraphEvent) => void;

export interface AudioGraphContext {
  /** Get current context values (snapshot) */
  getValues(): AudioGraphContextValues;

  /** Subscribe to specific value changes */
  subscribe<K extends keyof AudioGraphContextValues>(
    key: K,
    fn: ContextSubscriber<AudioGraphContextValues[K]>
  ): () => void;

  /** Subscribe to all events */
  onEvent(fn: EventSubscriber): () => void;

  /** Create a child context for nested graphs */
  createChild(overrides?: Partial<AudioGraphContextValues>): AudioGraphContext;

  /** Get parent context (null for root) */
  getParent(): AudioGraphContext | null;
}
```

---

## Hierarchy & Propagation

```
┌─────────────────────────────────────────────────────────────┐
│                     Root Context                             │
│  { a4Hz: 440, tempo: 120, timeSignature: [4,4] }            │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ Oscillator  │  │   Delay     │  │   Nested Graph       │ │
│  │ (subscribes │  │ (subscribes │  │                      │ │
│  │  to a4Hz)   │  │  to tempo)  │  │  ┌────────┐ ┌─────┐ │ │
│  └─────────────┘  └─────────────┘  │  │ Filter │ │ LFO │ │ │
│                                     │  │        │ │(sub)│ │ │
│                                     │  └────────┘ └─────┘ │ │
│                                     │  (inherits context)  │ │
│                                     └──────────────────────┘ │
│                                                              │
│  Event Bus: [tempoChange, transportStateChange, ...]        │
└─────────────────────────────────────────────────────────────┘
```

- Child contexts inherit all parent values
- Value changes propagate down automatically
- Events propagate down to all children
- Override behavior (child tempo different from parent) deferred to later iteration

---

## Integration Points

### AudioNodeServices

```typescript
// src/types/nodeModule.ts (modified)

export type AudioNodeServices = Readonly<{
  masterInput: AudioNode;
  graphContext: AudioGraphContext; // NEW
}>;
```

### Node Factory Usage

```typescript
// Example: oscillator subscribing to A4

function createOscillatorRuntime(
  ctx: AudioContext,
  nodeId: NodeId,
  graphContext: AudioGraphContext
): AudioNodeInstance<OscillatorGraphNode> {
  let currentA4 = graphContext.getValues().a4Hz;

  const unsubscribeA4 = graphContext.subscribe("a4Hz", (a4Hz) => {
    currentA4 = a4Hz;
    // Optionally retune active notes
  });

  return {
    type: "oscillator",
    handleMidi: (event) => {
      if (event.type === "noteOn") {
        const hz = midiToFreqHz(event.note, currentA4);
        // ...
      }
    },
    onRemove: () => {
      unsubscribeA4();
    },
  };
}
```

### Document Persistence

```typescript
// src/graph/types.ts (addition)

export type GraphState = {
  nodes: GraphNode[];
  connections: GraphConnection[];
  context: PersistedContextValues; // NEW
};
```

---

## Utility Functions

```typescript
// src/audio/context/utils.ts

export const PPQ = 480;

/** Convert PPQ position to seconds */
export function ppqToSeconds(ppq: number, tempo: number): number {
  return (ppq / PPQ) * (60 / tempo);
}

/** Convert seconds to PPQ position */
export function secondsToPPQ(seconds: number, tempo: number): number {
  return ((seconds * tempo) / 60) * PPQ;
}

/** Convert PPQ to beats (quarter notes) */
export function ppqToBeats(ppq: number): number {
  return ppq / PPQ;
}

/** Convert PPQ to bars */
export function ppqToBars(ppq: number, beatsPerBar: number): number {
  return ppq / (PPQ * beatsPerBar);
}

/** Convert beats to seconds */
export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats * 60) / tempo;
}

/** Convert MIDI note to frequency */
export function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure ✅

- [x] Create `src/audio/context/types.ts` — type definitions
- [x] Create `src/audio/context/AudioGraphContext.ts` — interface
- [x] Create `src/audio/context/AudioGraphContextImpl.ts` — implementation
- [x] Create `src/audio/context/utils.ts` — PPQ utilities
- [x] Create `src/audio/context/index.ts` — exports
- [ ] Add unit tests for context propagation

### Phase 2: Engine Integration ✅

- [x] Modify `src/types/nodeModule.ts` — add `graphContext` to `AudioNodeServices`
- [x] Modify `src/audio/nodeRegistry.ts` — pass context to factories
- [x] Modify `src/audio/engine.ts` — create root context, expose `setTempo()` etc.
- [x] Update all node audio factories to accept new services signature

### Phase 3: Document Persistence

- [ ] Modify `src/graph/types.ts` — add `context` to `GraphState`
- [ ] Modify `src/state/docFormat.ts` — add context to document format
- [ ] Update `docToGraphState` / `graphStateToDoc` conversion functions
- [ ] Add migration for existing documents (use defaults)

### Phase 4: Node Migration 🚧

- [x] `oscillator` — subscribe to `a4Hz`, remove hardcoded constant
- [ ] `delay` — subscribe to `tempo` for beat-synced delay (future enhancement)
- [ ] Other nodes as needed

### Phase 5: UI ✅

- [x] Create context toolbar component (tempo, A4, time signature inputs)
- [x] Add toolbar to menu bar area
- [x] Wire up to `GraphDocContext` for persistence

### Phase 6: External Integration (Future)

- [ ] Ableton Link bridge
- [ ] MIDI clock input
- [ ] Transport controls UI

---

## Design Decisions

| Decision                  | Choice                         | Rationale                                             |
| ------------------------- | ------------------------------ | ----------------------------------------------------- |
| Position units            | PPQ (480 pulses/quarter)       | Time-signature agnostic, industry standard            |
| Ramp handling             | Per-node                       | Different params need different smoothing             |
| Override in nested graphs | Deferred                       | Complexity not needed in first iteration              |
| Persistence               | In `GraphState.context`        | Undo/redo works naturally, saved with document        |
| Event vs Value            | Separate (events + subscriptions) | Events are transitions, values are current state   |

---

## Future Considerations

### Nested Graph Overrides

A future iteration could allow nested graphs to override parent context:

```typescript
const childContext = parentContext.createChild({
  tempo: parentContext.getValues().tempo / 2, // half-time
});
```

This would require:

- Tracking which values are "local overrides" vs "inherited"
- Deciding propagation behavior when parent changes

### Transport UI

Full transport controls (play/pause, position scrubbing, loop regions) would build on this foundation but are out of scope for the initial implementation.

### Clock Source Selection

Eventually, the system could support multiple clock sources:

- Internal (free-running)
- MIDI clock (external hardware)
- Ableton Link (network sync)
- Host DAW (plugin mode)

---

## Related Documents

- [Node Architecture Overview](../nodes/overview.md)
- [Audio Runtime](../nodes/audio-runtime.md)
- [Event Flow](../nodes/event-flow.md)
