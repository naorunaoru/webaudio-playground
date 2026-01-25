# Voice Allocation Implementation Plan

Implementation plan for the Consumer Hold model described in [Voice Lifecycle](./voice-propagation.md) and [Voice Count](./voice-count.md).

## Overview

The goal is to prevent premature voice reuse by having downstream consumers (envelope) hold voices until their release phase completes.

## Implementation Phases

### Phase 1: Core VoiceAllocator Class

Create a `VoiceAllocator` class that manages voice state. The allocator is instantiated inside voice source node factories (e.g., `createMidiToCvRuntime`), receiving dependencies via closure.

**Files to create:**

- `src/audio/voiceAllocator.ts`

**Files to modify:**

- `src/types/audioRuntime.ts` — Add `voiceAllocator` and `getVoiceMappingForOutput` to `AudioNodeInstance`

**Implementation:**

```typescript
interface VoiceState {
  index: number;
  noteActive: boolean;
  consumers: Set<string>; // Consumer IDs in format `${nodeId}:${portId}`
}

type AllocationState =
  | { type: "stable"; voiceCount: number }
  | { type: "shrinking"; currentCount: number; targetCount: number };

type VoiceAllocatorDeps = {
  nodeId: string;
  getGraphRef: () => GraphState | null;
  dispatchEvent: DispatchEventFn;
  getCurrentTime: () => number;
};

// Note: ctx was removed from deps. The allocator only needs getCurrentTime() for
// event dispatch timing, not the full AudioContext. This is cleaner and more testable.

class VoiceAllocator {
  constructor(voiceCount: number, deps: VoiceAllocatorDeps);

  // Core API
  allocate(): number | null;
  noteOff(voiceIndex: number): void;
  hold(voiceIndex: number, consumerId: string): void;
  release(voiceIndex: number, consumerId: string): void;

  // Voice stealing — dispatches force-release event, clears holds
  forceRelease(voiceIndex: number): void;

  // Consumer lifecycle (safety net — consumers should self-cleanup via onConnectionsChanged)
  consumerDisconnected(consumerId: string): void;

  // Resize (integrates with voice count propagation)
  requestResize(newCount: number): void;
}
```

**AudioNodeInstance interface additions:**

```typescript
type AudioNodeInstance<TNode extends GraphNode> = {
  // ... existing fields ...

  /** If this node owns a voice allocator, expose it for downstream discovery. */
  voiceAllocator?: VoiceAllocator;

  /** Get voice mapping for a specific output port (for pass-through nodes). */
  getVoiceMappingForOutput?: (portId: string) => VoiceMapping;
};
```

**Tasks:**

- [ ] Create VoiceAllocator class with VoiceState tracking
- [ ] Implement allocate() with free voice search
- [ ] Implement noteOff() to mark noteActive = false
- [ ] Implement hold/release for consumer tracking (consumerId format: `${nodeId}:${portId}`)
- [ ] Implement voice stealing with priority (in-release > oldest active via order array)
- [ ] Implement forceRelease() that dispatches force-release event and clears holds
- [ ] Implement consumerDisconnected() as safety net (clears holds only, no event dispatch)
- [ ] Implement deferred shrinking state machine
- [ ] Add resize request handling with grow/shrink logic
- [ ] Update AudioNodeInstance type with voiceAllocator and getVoiceMappingForOutput

---

### Phase 2: VoiceMapping Interface

Create the voice mapping system for pass-through nodes.

**Files to create:**

- `src/audio/voiceMapping.ts`

**Implementation:**

```typescript
interface VoiceMapping {
  toUpstream(downstreamVoice: number): number;
  toDownstream(upstreamVoice: number): number | null;
}

const identityMapping: VoiceMapping;
function composeMappings(outer: VoiceMapping, inner: VoiceMapping): VoiceMapping;
```

**Tasks:**

- [ ] Create VoiceMapping interface
- [ ] Implement identityMapping constant
- [ ] Implement composeMappings function

---

### Phase 3: Allocator Discovery

Implement graph traversal to find upstream allocators. Discovery follows `kind === "gate"` or `kind === "trigger"` ports backward — both port kinds inherently trace back to voice sources.

**Edge case to consider:** A node could theoretically have both gate and trigger inputs connected to *different* allocators. This scenario needs thought — for now, discovery uses the specific input port that received the event (e.g., `gate_in` for gate events, `trigger_in` for trigger events).

**Files to create:**

- `src/audio/allocatorDiscovery.ts`

**Files to modify:**

- `src/types/nodeModule.ts` — Add `getAudioNode` to `AudioNodeServices`
- `src/audio/engine.ts` — Expose `getAudioNode(nodeId)` method and pass to services

**Implementation:**

```typescript
type AllocatorLookupResult = {
  allocator: VoiceAllocator;
  sourceId: string;
  mapping: VoiceMapping;
};

function findAllocator(
  graph: GraphState,
  nodeId: string,
  inputPortId: string,
  getAudioNode: (nodeId: string) => AudioNodeInstance | undefined
): AllocatorLookupResult | null;
```

**AudioNodeServices addition:**

```typescript
export type AudioNodeServices = Readonly<{
  masterInput: AudioNode;
  graphContext: AudioGraphContext;
  dispatchEvent: DispatchEventFn;
  dispatchMidi: DispatchMidiFn;
  /** Look up an audio node instance by ID (for allocator discovery). */
  getAudioNode: (nodeId: string) => AudioNodeInstance | undefined;
}>;
```

**Engine implementation (closure pattern):**

Services are created once in `ensureContext()` before any nodes exist. Use a closure that captures `this` — the same pattern used for `dispatchEvent` and `dispatchMidi`:

```typescript
// In engine.ts ensureContext()
this.factories = {
  ...createBuiltInAudioNodeFactories({
    masterInput: this.masterGain,
    graphContext: this.rootContext,
    dispatchEvent: this.dispatchEvent.bind(this),
    dispatchMidi: this.dispatchMidi.bind(this),
    getAudioNode: (nodeId: string) => this.audioNodes.get(nodeId),  // closure
  }),
  ...this.factoryOverrides,
};
```

This works because JavaScript closures capture references, not values. `this.audioNodes` is a Map that gets mutated over time — the closure always sees the current state.

**Discovery strategy:**

- Traverse backward from the event input port (gate or trigger), following connections of matching kind
- If source node has `voiceAllocator` property, return it
- Otherwise, find the source's matching event input and recurse (for pass-through nodes)
- Compose voice mappings along the way

**Caching strategy:**

- Rebuild on every gate-on event (cheap traversal, 1-3 hops)
- No complex invalidation logic needed
- Track `voiceToSource` map to remember which allocator each active voice came from

**Tasks:**

- [ ] Add `getAudioNode` to AudioNodeServices type
- [ ] Add `getAudioNode` closure to services in `ensureContext()` (captures `this.audioNodes`)
- [ ] Create allocatorDiscovery.ts with findAllocator()
- [ ] Implement event-port traversal logic (gate and trigger)
- [ ] Handle pass-through nodes with voice mapping composition
- [ ] Add helper to find matching event input port on a node

---

### Phase 4: Update MIDI-to-CV

Modify MIDI-to-CV to use VoiceAllocator instead of inline state.

**Files to modify:**

- `src/nodes/midiToCv/audio.ts`

**Implementation:**

```typescript
function createMidiToCvRuntime(ctx, nodeId, dispatchEvent) {
  let graphRef: GraphState | null = null;

  const allocator = new VoiceAllocator(voiceCount, {
    nodeId,
    getGraphRef: () => graphRef,
    dispatchEvent,
    getCurrentTime: () => ctx.currentTime,
  });

  return {
    // ... existing implementation ...
    voiceAllocator: allocator, // Expose for downstream discovery
    setGraphRef: (graph) => { graphRef = graph; },
  };
}
```

**Tasks:**

- [ ] Create VoiceAllocator instance in createMidiToCvRuntime
- [ ] Pass dependencies via closure (ctx, nodeId, graphRef getter, dispatchEvent)
- [ ] Replace inline voice tracking (voices array, allocationOrder, noteToVoice) with allocator
- [ ] Expose `voiceAllocator` property on AudioNodeInstance
- [ ] Update handleNoteOn to use allocator.allocate()
- [ ] Update handleNoteOff to use allocator.noteOff()
- [ ] Keep pitch CV stable during release (already done)
- [ ] Remove redundant FIFO/stealing logic (now in allocator)

---

### Phase 5: Update Envelope

Modify Envelope to hold/release voices and handle force-release.

**Files to modify:**

- `src/nodes/envelope/audio.ts`
- `src/nodes/envelope/processor.ts`

**Consumer ID format:** `${nodeId}:${portId}` (e.g., `${nodeId}:gate_in` for envelope's gate input)

**Worklet communication protocol:**

Main → Worklet:

```typescript
{ type: "gate", voice: number, state: "on" | "off" }
{ type: "forceRelease", voice: number }
{ type: "releaseAll" }  // Fast-fade all active voices (used on disconnect)
{ type: "params", params: EnvelopeParams }
```

Worklet → Main:

```typescript
{ type: "releaseComplete", voice: number }
```

**releaseComplete timing:** Send when the voice transitions to idle state (level reaches zero and phase becomes "idle"). Keep it simple — no need for sub-sample precision.

**Fast transition constant:**

```typescript
// At top of audio.ts
const FORCE_RELEASE_FADE_MS = 5; // Fast fade to prevent clicks
```

**Force release + retrigger interaction:**

When a voice receives `forceRelease` followed immediately by a new `gate on` (due to voice stealing for a new note), the behavior depends on the `retrigger` setting:

- `retrigger=true`: Fast-fade completes (~5ms), then attack starts from 0
- `retrigger=false`: Fast-fade completes, then attack starts from current level

This mirrors normal retrigger behavior — the only difference is the fast-fade instead of natural release. The worklet should track the fade and handle incoming gate-on events appropriately.

**Consumer-initiated cleanup via onConnectionsChanged:**

When the envelope's gate input is disconnected, it proactively releases all holds rather than waiting for the allocator to notify it. This is the "surgical" approach — the consumer handles its own cleanup.

```typescript
onConnectionsChanged: ({ inputs }) => {
  if (!inputs.has("gate_in") && voiceToSource.size > 0) {
    // Gate input disconnected — release all holds
    for (const [voiceIdx, info] of voiceToSource) {
      const upstreamVoice = info.mapping.toUpstream(voiceIdx);
      info.allocator.release(upstreamVoice, consumerId);
    }
    voiceToSource.clear();
    // Send fast-fade to worklet for any active voices
    worklet?.port.postMessage({ type: "releaseAll" });
  }
},
```

**Voice count handling:**

Envelope pre-allocates Web Audio resources (ChannelSplitter, GainNodes, AudioWorkletNode) for a fixed upper limit (e.g., `MAX_VOICES = 32`). This avoids runtime recreation of Web Audio nodes, which isn't well-supported.

The envelope handles any voice index up to this limit. The worklet processes whichever voices have active envelopes — no explicit "voice count" message is needed for correctness.

```typescript
// At top of audio.ts
const MAX_VOICES = 32;  // Pre-allocated upper limit

// In createEnvelopeRuntime:
const outputSplitter = ctx.createChannelSplitter(MAX_VOICES);
const worklet = new AudioWorkletNode(ctx, "envelope", {
  outputChannelCount: [MAX_VOICES],
  // ...
});
```

Full voice count propagation (upstream notifying downstream of count changes) is deferred to a future phase — see [voice-count.md](./voice-count.md).

**Tasks:**

- [ ] Add consumerId property (`${nodeId}:${portId}`, e.g., `${nodeId}:gate_in`)
- [ ] Track voiceToSource map (Map<number, AllocatorLookupResult>) for release routing
- [ ] On gate-on: call findAllocator(), then allocator.hold(), store in voiceToSource
- [ ] Add worklet message listener for releaseComplete
- [ ] Call allocator.release() when worklet reports releaseComplete
- [ ] Handle force-release events: send forceRelease message to worklet
- [ ] Implement onConnectionsChanged for consumer-initiated cleanup
- [ ] Increase MAX_VOICES to 32 (pre-allocated upper limit)
- [ ] Update processor.ts to track envelope phase per voice
- [ ] Update processor.ts to send releaseComplete when release finishes (no time field needed)
- [ ] Update processor.ts to handle forceRelease (fast fade, ~5ms)
- [ ] Update processor.ts to handle releaseAll message
- [ ] On forceRelease, do NOT send releaseComplete (allocator already cleared hold)

---

### Phase 6: Update Event Types

Add ForceReleaseEvent to the voice event system.

**Files to modify:**

- `src/graph/types.ts`

**When force-release is dispatched:**

Force-release events are dispatched **only for voice stealing** — when the allocator must reclaim a voice that consumers are still holding. Consumer disconnect is handled differently: the consumer proactively releases its holds via `onConnectionsChanged` (see Phase 5), so no force-release event is needed.

**Implementation:**

```typescript
/** Force release event: voice is being reclaimed due to voice stealing. */
export type ForceReleaseEvent = Readonly<{
  type: "force-release";
  voice: number;
  time: number; // AudioContext.currentTime
}>;

/** Voice event: gate, trigger, or force-release. */
export type VoiceEvent = GateEvent | TriggerEvent | ForceReleaseEvent;
```

**Tasks:**

- [ ] Add ForceReleaseEvent type definition
- [ ] Update VoiceEvent union to include ForceReleaseEvent
- [ ] Update envelope handleEvent to check for "force-release" type

---

### Phase 7: Engine Integration

Wire up connection lifecycle handling in the engine. The approach uses **consumer-initiated cleanup** — consumers detect disconnection via `onConnectionsChanged` and release their holds proactively. The allocator's `consumerDisconnected` serves as a safety net.

**Files to modify:**

- `src/audio/engine.ts`

**Cleanup responsibility:**

| Scenario              | Who cleans up                        | How                                                      |
|-----------------------|--------------------------------------|----------------------------------------------------------|
| Cable disconnected    | Consumer (envelope)                  | `onConnectionsChanged` detects missing input, releases   |
| Consumer node removed | Consumer in `onRemove()`             | Releases holds before destruction                        |
| Voice source removed  | Consumers via `onConnectionsChanged` | Notified before source is destroyed                      |

#### Required fix: syncGraph order of operations

The current `syncGraph` order is **incorrect** for voice allocation cleanup:

```text
Current (WRONG):
1. teardownNode() for removed nodes → onRemove() called → allocator destroyed
2. onConnectionsChanged() for alive nodes → consumer tries to release on dead allocator

Required (CORRECT):
1. Compute connection changes
2. onConnectionsChanged() for alive nodes → consumer releases holds on still-alive allocator
3. teardownNode() for removed nodes → onRemove() called → allocator destroyed
```

The fix requires reordering `syncGraph` to notify connection changes **before** tearing down nodes:

```typescript
// In syncGraph():
syncGraph(graph: GraphState): void {
  const alive = new Set<NodeId>(graph.nodes.map((n) => n.id));
  const toRemove = [...this.audioNodes.keys()].filter(id => !alive.has(id));

  // 1. Compute new connection state (same as before)
  const newConnectedPorts = /* ... */;

  // 2. Notify alive nodes of connection changes FIRST
  for (const nodeId of alive) {
    // ... existing onConnectionsChanged logic ...
  }

  // 3. THEN tear down removed nodes
  for (const nodeId of toRemove) {
    this.teardownNode(nodeId);
  }

  // 4. Create/update remaining nodes (same as before)
  // ...
}
```

**Consumer node removal flow:**

When a consumer (envelope) is removed, it releases holds in `onRemove()`:

```typescript
// In envelope's onRemove()
onRemove: () => {
  // Release all holds before destruction
  for (const [voiceIdx, info] of voiceToSource) {
    const upstreamVoice = info.mapping.toUpstream(voiceIdx);
    info.allocator.release(upstreamVoice, consumerId);
  }
  voiceToSource.clear();
  // ... existing cleanup ...
},
```

**Voice source removal flow:**

When a voice source (MIDI-to-CV) is removed:

1. `onConnectionsChanged` is called on downstream consumers (envelope)
2. Consumers detect gate_in disconnected, release all holds
3. Then source's `onRemove()` is called, allocator is destroyed (holds already released)

**Tasks:**

- [ ] Reorder `syncGraph` to call `onConnectionsChanged` before `teardownNode`
- [ ] Verify cleanup order: compute changes → notify connection changes → remove nodes
- [ ] Test: remove MIDI-to-CV while envelope has active voices — no crash

---

### Phase 8: Voice Count Integration

Connect VoiceAllocator resize to existing voice count state changes.

**Scope:** This phase wires up `requestResize()` to the existing `voiceCount` parameter in MIDI-to-CV state. Full voice count propagation (downstream nodes inheriting channel count) is a separate feature described in [voice-count.md](./voice-count.md).

**Files to modify:**

- `src/nodes/midiToCv/audio.ts`

**Tasks:**

- [ ] In updateState(), call allocator.requestResize() instead of directly resizing
- [ ] Allocator handles deferred shrinking internally (from Phase 1)
- [ ] Handle rapid resize requests (allocator updates target, checks completion)

**Future work (not this phase):**

- Full voice count propagation to downstream nodes
- Adding `definesChannelCount` to port definitions
- Adding `channelCountStrategy` to node modules

---

## Testing Plan

### Unit Tests

- [ ] VoiceAllocator: allocation returns free voices
- [ ] VoiceAllocator: voice not free until noteOff AND all consumers release
- [ ] VoiceAllocator: voice stealing prefers releasing voices
- [ ] VoiceAllocator: forceRelease clears consumers
- [ ] VoiceAllocator: deferred shrink waits for voices to free
- [ ] VoiceAllocator: grow is immediate
- [ ] VoiceMapping: composition works correctly
- [ ] Allocator discovery: finds allocator through direct connection
- [ ] Allocator discovery: composes mappings through pass-through nodes

### Integration Tests

- [ ] MIDI note-on allocates voice, envelope holds it
- [ ] MIDI note-off doesn't free voice while envelope releases
- [ ] Envelope release complete frees voice
- [ ] Multiple envelopes hold independently
- [ ] Voice stealing sends force-release, envelope fast-transitions
- [ ] Disconnect triggers consumer-initiated cleanup via onConnectionsChanged
- [ ] Shrink from 8→4 waits for voices 4-7

### Manual Tests (Worklet Communication)

AudioWorklet communication and timing behavior is tested manually due to the complexity of automated worklet testing.

- [ ] Play staccato passage — releases should complete without clicks
- [ ] Play 9+ note chord with 8 voices — voice stealing works musically
- [ ] Change voice count while notes releasing — deferred shrink works
- [ ] Disconnect envelope mid-release — cleanup happens, no clicks
- [ ] Verify releaseComplete messages arrive from worklet (check console logs)
- [ ] Verify forceRelease causes fast fade (listen for ~5ms transition)

---

## Dependencies

```
Phase 1 (VoiceAllocator) ─────┬──→ Phase 4 (MIDI-to-CV)
                              │
Phase 2 (VoiceMapping) ───────┼──→ Phase 3 (Discovery) ──→ Phase 5 (Envelope)
                              │
Phase 6 (Event Types) ────────┴──→ Phase 5 (Envelope)
                                         │
Phase 7 (Engine) ←───────────────────────┘
                                         │
Phase 8 (Voice Count) ←──────────────────┘
```

Phases 1, 2, and 6 can be done in parallel (no dependencies).
Phase 3 depends on Phase 2 and requires engine changes (adding `getAudioNode` to services).
Phases 4 and 5 depend on Phase 1.
Phase 5 depends on Phases 3 and 6.
Phases 7 and 8 depend on Phase 5.

---

## Current Status

- [x] Architecture documented (voice-propagation.md, voice-count.md)
- [x] Phase 1: Core VoiceAllocator — complete
- [x] Phase 2: VoiceMapping — complete
- [x] Phase 3: Allocator Discovery — complete
- [x] Phase 4: MIDI-to-CV — complete
- [x] Phase 5: Envelope — complete
- [x] Phase 6: Event Types — complete
- [x] Phase 7: Engine Integration — complete (syncGraph reordered to notify before teardown)
- [x] Phase 8: Voice Count Integration — complete (implemented during Phase 4)

---

## Notes

- Envelope is the primary consumer for initial implementation
- Existing `samplePlayer` node is MIDI-triggered (not gate-triggered) with its own voice pool — it doesn't need Consumer Hold integration
- A future gate-triggered or trigger-based one-shot sampler would integrate with Consumer Hold like envelope does
- Pass-through nodes (Gate Delay, Gate Router) don't exist yet — identity mapping is sufficient for now
- Allocator discovery traverses both gate and trigger ports — a consumer uses the port that received the event to find its allocator

### Consumer-initiated cleanup

Disconnect handling uses a "surgical" approach where consumers are responsible for their own cleanup:

1. **Consumer detects disconnect** via `onConnectionsChanged` callback
2. **Consumer releases all holds** by calling `allocator.release()` for each entry in `voiceToSource`
3. **Consumer fast-fades active voices** by sending `releaseAll` to worklet
4. **Allocator's `consumerDisconnected`** serves as a safety net only — it clears holds without dispatching events

This approach is preferred over allocator-initiated cleanup because:

- The consumer knows its own state and can clean up immediately
- No need for force-release events that wouldn't reach disconnected consumers anyway
- Cleaner separation of concerns — each component manages its own lifecycle

### Multi-source support

The architecture supports multiple voice sources connecting to one consumer (e.g., two MIDI-to-CV → one Envelope). Implementation tracks `voiceToSource` map to route release calls correctly.

**Current limitation:** The engine does not yet offset voice indices when multiple sources connect to one input. If two sources both emit `voice: 0`, they collide. Workarounds:

- Connection system may only allow one cable per gate input
- Sources could use disjoint voice ranges
- Future: Engine applies voice index offset based on connection order

For now, single-source scenarios work correctly. Multi-source with voice collision is undefined behavior until voice offsetting is implemented.
