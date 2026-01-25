# Voice Lifecycle Management

## Problem Statement

Voice allocation and envelope lifecycle are decoupled, causing premature voice reuse.

### The Scenario

1. Note on → voice 1 allocated
2. Oscillator sets voice 1 frequency
3. Envelope starts attack/decay/sustain on voice 1
4. Note off → voice 1 marked as free
5. Envelope starts release phase on voice 1
6. New note on → voice 1 reallocated (it's "free")
7. Oscillator changes voice 1 frequency to new note
8. Envelope's release phase is cut, restarts with new note

### The Problem

MIDI note-off means "finger lifted," not "sound finished."

The allocator treats note-off as "voice is free," but the envelope still needs that voice for its release phase. When the voice gets reallocated, the old note's release is cut short and the oscillator retunes — audible as a click or pitch jump.

### Who Cares About Voice Lifecycle?

Most nodes don't:

| Node | Voice-aware? | Why |
|------|--------------|-----|
| Oscillator | No | Just outputs frequency it's told |
| Filter | No | Processes continuous audio stream |
| VCA | No | Processes continuous audio stream |
| Delay | No | Delays whatever audio arrives |
| Reverb | No | Processes continuous audio stream |
| **Envelope** | **Yes** | Needs release phase to complete |
| **One-shot sampler** | **Maybe** | May need to play to completion |

Audio-processing nodes see a continuous stream per channel. Notes overlap, releases blend into attacks — they just process. Only nodes that respond to gate events and need time to "finish" care about voice lifecycle.

## Solution A: Round-Robin Allocation

### Concept

Each new note gets the next voice in sequence, regardless of which voices are free.

```
Note 1 → voice 0
Note 2 → voice 1
Note 3 → voice 2
Note 4 → voice 3
Note 5 → voice 4
Note 6 → voice 5
Note 7 → voice 6
Note 8 → voice 7
Note 9 → voice 0 (wraps around)
```

### Implementation

```typescript
class VoiceAllocator {
  private nextVoice = 0;
  private voiceCount: number;
  
  allocate(): number {
    const voice = this.nextVoice;
    this.nextVoice = (this.nextVoice + 1) % this.voiceCount;
    return voice;
  }
}
```

### Pros

- Dead simple
- No coordination with downstream nodes
- Predictable behavior

### Cons

- Wasteful — burns through voices even when earlier ones are fully idle
- With 8 voices and fast staccato, you wrap around quickly
- Doesn't actually guarantee release completes — just makes collision less likely
- Playing 9+ overlapping notes still causes the same problem

### Verdict

Works as a quick fix. Doesn't solve the fundamental problem, just reduces its frequency.

## Solution B: Consumer Hold Model

### Concept

Downstream nodes that need voice lifecycle (envelope) register as "consumers." A voice is only free when:

1. MIDI note is off (`noteActive === false`)
2. No consumers are holding it (`consumers.size === 0`)

### Voice State

```typescript
interface VoiceState {
  index: number;
  noteActive: boolean;      // MIDI note currently held
  consumers: Set<string>;   // IDs of nodes holding this voice
}

function isVoiceFree(voice: VoiceState): boolean {
  return !voice.noteActive && voice.consumers.size === 0;
}
```

### Allocator API

```typescript
interface VoiceAllocator {
  // Called by MIDI-to-CV
  allocate(): number | null;           // Returns voice index, or null if none free
  noteOff(voiceIndex: number): void;   // Marks noteActive = false
  
  // Called by downstream consumers (envelope, etc.)
  hold(voiceIndex: number, consumerId: string): void;
  release(voiceIndex: number, consumerId: string): void;
}
```

### Flow

```
MIDI note on:
  1. allocator.allocate() → returns free voice (e.g., voice 1)
  2. Set voice 1 pitch
  3. Emit gate-on event for voice 1

Envelope receives gate-on:
  4. allocator.hold(1, "envelope-xyz")
  5. Start attack phase

MIDI note off:
  6. allocator.noteOff(1) → noteActive = false
  7. Emit gate-off event for voice 1

Envelope receives gate-off:
  8. Start release phase
  (voice 1 is NOT free yet — envelope still holds it)

Envelope release completes:
  9. allocator.release(1, "envelope-xyz")
  10. Now voice 1 is free (noteActive=false, consumers empty)

Next MIDI note on:
  11. allocator.allocate() → can now return voice 1
```

### Implementation

```typescript
class VoiceAllocator {
  private voices: VoiceState[];
  
  constructor(voiceCount: number) {
    this.voices = Array(voiceCount).fill(null).map((_, i) => ({
      index: i,
      noteActive: false,
      consumers: new Set()
    }));
  }
  
  allocate(): number | null {
    const free = this.voices.find(v => !v.noteActive && v.consumers.size === 0);
    if (!free) return null;  // No free voices — need stealing strategy
    free.noteActive = true;
    return free.index;
  }
  
  noteOff(voiceIndex: number): void {
    this.voices[voiceIndex].noteActive = false;
  }
  
  hold(voiceIndex: number, consumerId: string): void {
    this.voices[voiceIndex].consumers.add(consumerId);
  }
  
  release(voiceIndex: number, consumerId: string): void {
    this.voices[voiceIndex].consumers.delete(consumerId);
  }
}
```

### Envelope Integration

```typescript
class Envelope {
  private consumerId: string; // Format: `${nodeId}:${portId}`
  private allocator: VoiceAllocator;

  onGateOn(event: GateEvent) {
    this.allocator.hold(event.voice, this.consumerId);
    this.startAttack(event.voice, event.time);
  }

  onGateOff(event: GateEvent) {
    this.startRelease(event.voice, event.time);
    // Don't release hold yet — wait for release to complete
  }

  onReleaseComplete(voiceIndex: number) {
    this.allocator.release(voiceIndex, this.consumerId);
  }
}
```

### Worklet Communication Protocol

The envelope runs in an AudioWorklet for sample-accurate processing. Communication between main thread and worklet:

**Main → Worklet:**

```typescript
// Gate state change
{ type: "gate", voice: number, state: "on" | "off" }

// Force release (voice stolen or consumer disconnected)
{ type: "forceRelease", voice: number }

// Parameter updates
{ type: "params", params: EnvelopeParams }
```

**Worklet → Main:**

```typescript
// Release phase completed naturally
{ type: "releaseComplete", voice: number }
```

The worklet tracks envelope phase per voice. When a voice's release phase completes (level reaches zero), it sends `releaseComplete` so the main thread can call `allocator.release()`.

On `forceRelease`, the worklet performs a fast fade (~5ms) to prevent clicks, then resets the voice to idle. No `releaseComplete` is sent — the allocator already cleared the hold.

### Pros

- Actually solves the problem — release phase completes fully
- Scales to multiple consumers (multiple envelopes, one-shot samplers, etc.)
- Voice reuse is optimal — freed as soon as actually idle

### Cons

- More complex coordination
- Envelope needs reference to allocator
- Need to handle "what if release never completes" (safety timeout?)
- Need voice stealing strategy when all voices are held

### Voice Stealing When All Held

If `allocate()` returns null, need a fallback:

```typescript
allocate(): number {
  // Try free voice first
  const free = this.voices.find(v => !v.noteActive && v.consumers.size === 0);
  if (free) {
    free.noteActive = true;
    return free.index;
  }
  
  // Steal: prefer voices with noteActive=false (in release)
  const releasing = this.voices.find(v => !v.noteActive);
  if (releasing) {
    this.forceRelease(releasing.index);  // Notify consumers to abort
    releasing.noteActive = true;
    releasing.consumers.clear();
    return releasing.index;
  }
  
  // Last resort: steal oldest active note (FIFO)
  const oldest = this.voices[0];  // Assumes sorted by age, or track separately
  this.forceRelease(oldest.index);
  oldest.noteActive = true;
  oldest.consumers.clear();
  return oldest.index;
}
```

## Comparison

| Aspect | Round-Robin | Consumer Hold |
|--------|-------------|---------------|
| Complexity | Low | Medium |
| Solves problem | Partially (reduces frequency) | Fully |
| Voice efficiency | Poor (wastes voices) | Optimal |
| Downstream coordination | None | Required |
| Handles multiple envelopes | No | Yes |
| Implementation effort | 5 min | 30 min |

## Recommendation

**Start with Consumer Hold (Solution B).**

It's more work upfront but solves the actual problem. Round-robin is a bandaid that breaks down under load.

The implementation isn't that complex — envelope is likely the only node that needs to hold voices initially. Voice stealing handles edge cases where all voices are held.

## Voice Source Nodes

Voice allocators are owned by **voice source nodes** — any node that translates external or discrete input into polyphonic CV and gate signals.

### Examples

| Node        | Input         | Output         | Owns Allocator?   |
|-------------|---------------|----------------|-------------------|
| MIDI-to-CV  | MIDI events   | pitch CV, gate | Yes               |
| OSC-to-CV   | OSC messages  | pitch CV, gate | Yes               |
| Sequencer   | clock/trigger | pitch CV, gate | Yes               |
| Arpeggiator | MIDI + clock  | pitch CV, gate | Yes               |
| Gate Delay  | gate          | gate (delayed) | No (pass-through) |
| Gate Router | gate          | gate (routed)  | No (pass-through) |

The pattern: any node that **originates** voice allocation owns an allocator. Nodes that process or route existing gate signals are pass-through nodes.

### Node Interface

Voice source nodes expose their allocator:

```typescript
interface AudioNodeInstance {
  // ... existing methods ...

  /** If this node owns a voice allocator, return it. */
  voiceAllocator?: VoiceAllocator;
}

function isVoiceSource(node: AudioNodeInstance): node is AudioNodeInstance & { voiceAllocator: VoiceAllocator } {
  return node.voiceAllocator !== undefined;
}
```

## Allocator Discovery

Consumer nodes (envelope, one-shot sampler) need to find their upstream allocator. This is done by traversing the graph backward from the event input port (gate or trigger).

### Discovery Strategy

Allocator discovery follows `kind === "gate"` or `kind === "trigger"` ports backward through the graph. No extra flags are needed — these event ports inherently trace back to voice sources (MIDI-to-CV, sequencer, etc.).

**Edge case:** A node could theoretically have both gate and trigger inputs connected to *different* allocators. Discovery uses the specific input port that received the event to find the correct allocator.

**When to discover:** On every gate-on or trigger event. This is the pragmatic choice:

- Graph traversal is cheap (typically 1-3 hops)
- No complex cache invalidation logic
- Always correct after connection changes
- The "cache" is really just `voiceToSource` — remembering which source each active voice came from

### Graph Traversal

```typescript
type AllocatorLookupResult = {
  allocator: VoiceAllocator;
  sourceId: string;           // Node ID of the allocator owner
  mapping: VoiceMapping;      // Composed voice index mapping
};

function findAllocator(
  graph: GraphState,
  nodeId: string,
  inputPortId: string,
  getAudioNodeInstance: (nodeId: string) => AudioNodeInstance | undefined
): AllocatorLookupResult | null {
  // Find the connection to this input
  const connection = graph.connections.find(
    c => c.to.nodeId === nodeId && c.to.portId === inputPortId
  );
  if (!connection) return null;

  const sourceNodeId = connection.from.nodeId;
  const sourcePortId = connection.from.portId;
  const sourceInstance = getAudioNodeInstance(sourceNodeId); // From engine

  // Does this node own an allocator?
  if (sourceInstance.voiceAllocator) {
    const mapping = sourceInstance.getVoiceMappingForOutput?.(sourcePortId) ?? identityMapping;
    return {
      allocator: sourceInstance.voiceAllocator,
      sourceId: sourceNodeId,
      mapping,
    };
  }

  // Traverse upstream through pass-through nodes
  // Follow the matching event input of the pass-through node (gate or trigger)
  const upstreamEventPort = findMatchingEventInput(sourceInstance, connection.kind);
  if (!upstreamEventPort) return null;

  const upstream = findAllocator(graph, sourceNodeId, upstreamEventPort);
  if (!upstream) return null;

  // Compose voice mappings
  const nodeMapping = sourceInstance.getVoiceMappingForOutput?.(sourcePortId) ?? identityMapping;
  return {
    allocator: upstream.allocator,
    sourceId: upstream.sourceId,
    mapping: composeMappings(nodeMapping, upstream.mapping),
  };
}
```

## Voice Index Mapping

Pass-through nodes may transform voice indices. For example, a Gate Router might split 8 voices across two outputs:

```
MIDI-to-CV (8 voices)
    │
    ▼ voices 0-7
Gate Router
    ├─ Output A: voices 0,2,4,6 → remapped to 0,1,2,3
    └─ Output B: voices 1,3,5,7 → remapped to 0,1,2,3
```

### Mapping Interface

```typescript
interface VoiceMapping {
  /** Map downstream voice index to upstream voice index */
  toUpstream(downstreamVoice: number): number;

  /** Map upstream voice index to downstream (for force-release). Returns null if not routed. */
  toDownstream(upstreamVoice: number): number | null;
}

const identityMapping: VoiceMapping = {
  toUpstream: (v) => v,
  toDownstream: (v) => v,
};

function composeMappings(outer: VoiceMapping, inner: VoiceMapping): VoiceMapping {
  return {
    toUpstream: (v) => inner.toUpstream(outer.toUpstream(v)),
    toDownstream: (v) => {
      const mid = inner.toDownstream(v);
      return mid !== null ? outer.toDownstream(mid) : null;
    },
  };
}
```

### Consumer Usage

Consumers use the mapping when communicating with the allocator:

```typescript
class Envelope {
  private allocatorInfo: AllocatorLookupResult | null;
  private consumerId: string; // Format: `${nodeId}:${portId}`

  constructor(nodeId: string) {
    this.consumerId = `${nodeId}:gate_in`;
  }

  onGateOn(event: GateEvent) {
    if (!this.allocatorInfo) return;

    const upstreamVoice = this.allocatorInfo.mapping.toUpstream(event.voice);
    this.allocatorInfo.allocator.hold(upstreamVoice, this.consumerId);
    this.startAttack(event.voice, event.time);
  }

  onReleaseComplete(voiceIndex: number) {
    if (!this.allocatorInfo) return;

    const upstreamVoice = this.allocatorInfo.mapping.toUpstream(voiceIndex);
    this.allocatorInfo.allocator.release(upstreamVoice, this.consumerId);
  }
}
```

## Multiple Allocators

When multiple voice sources connect to one consumer, the consumer tracks each allocator independently.

### Scenario

```
MIDI-to-CV 1 (8 voices) ──┐
                          ├──→ Envelope (16 channels)
MIDI-to-CV 2 (8 voices) ──┘
```

Voice indices are offset by the connection system:

- MIDI-to-CV 1: voices 0-7 → Envelope sees 0-7
- MIDI-to-CV 2: voices 0-7 → Envelope sees 8-15

### Voice Index Offsetting

**Current limitation:** The engine does not yet automatically offset voice indices when multiple sources connect to one input. If two sources both emit `voice: 0`, they would collide.

**Workarounds:**

- Connection system may only allow one cable per gate input (problem doesn't arise)
- Sources could use disjoint voice ranges by configuration
- Future: Engine applies voice index offset based on connection order

For initial implementation, track `voiceToSource` to remember which allocator each active voice came from. This naturally extends to proper multi-source when voice offsetting is added.

### Consumer Tracking

```typescript
class Envelope {
  private nodeId: string;
  private consumerId: string; // Format: `${nodeId}:${portId}`
  private graphRef: GraphState;

  // Track which source owns each active voice
  private voiceToSource = new Map<number, AllocatorLookupResult>();

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.consumerId = `${nodeId}:gate_in`;
  }

  onGateOn(event: GateEvent) {
    // Discover allocator on every gate-on (cheap traversal, always correct)
    const info = findAllocator(this.graphRef, this.nodeId, "gate_in");
    if (!info) return;

    const upstreamVoice = info.mapping.toUpstream(event.voice);
    info.allocator.hold(upstreamVoice, this.consumerId);

    // Remember which allocator this voice came from
    this.voiceToSource.set(event.voice, info);
    this.startAttack(event.voice, event.time);
  }

  onReleaseComplete(voiceIndex: number) {
    const info = this.voiceToSource.get(voiceIndex);
    if (!info) return;

    const upstreamVoice = info.mapping.toUpstream(voiceIndex);
    info.allocator.release(upstreamVoice, this.consumerId);

    this.voiceToSource.delete(voiceIndex);
  }
}
```

## Force-Release Protocol

When a voice must be reclaimed due to **voice stealing**, the allocator notifies consumers via the event bus. Note: disconnect scenarios use consumer-initiated cleanup instead (see [Connection Lifecycle](#connection-lifecycle)).

### Event Type

```typescript
type ForceReleaseEvent = {
  type: "force-release";
  voice: number;
  time: number;
};

type VoiceEvent = GateEvent | TriggerEvent | ForceReleaseEvent;
```

### Allocator Dispatch

```typescript
class VoiceAllocator {
  private dispatchEvent: DispatchEventFn;

  forceRelease(voiceIndex: number): void {
    // Notify consumers via event bus
    this.dispatchEvent(this.graphRef, this.nodeId, "gate_out", {
      type: "force-release",
      voice: voiceIndex,
      time: this.ctx.currentTime,
    });

    // Clear allocator state
    this.voices[voiceIndex].consumers.clear();
  }
}
```

### Consumer Handling

Consumers receiving force-release should fast-transition to avoid clicks:

```typescript
class Envelope {
  handleEvent(portId: string, event: VoiceEvent) {
    if (event.type === "force-release") {
      // Fast transition to attack-ready state (not snap to zero)
      // This prevents clicking when a new note immediately follows
      this.fastTransitionToIdle(event.voice);
      // No need to call allocator.release() — allocator already cleared the hold
    }
  }

  private fastTransitionToIdle(voiceIndex: number) {
    // Quick fade (~5ms) to prevent click, then reset to idle
    // If a new gate-on arrives during fade, transition to attack from current level
    this.worklet?.port.postMessage({
      type: "forceRelease",
      voice: voiceIndex,
    });
  }
}
```

## Connection Lifecycle

When connections change, allocator state must be cleaned up to prevent orphaned holds. This uses a **consumer-initiated cleanup** approach where consumers are responsible for releasing their own holds.

### Disconnect Handling (Consumer-Initiated)

When a consumer's gate input is disconnected:

1. Engine calls `onConnectionsChanged` on the consumer
2. Consumer detects that `gate_in` is no longer connected
3. Consumer releases all holds by calling `allocator.release()` for each voice
4. Consumer sends fast-fade to worklet for any active voices

```typescript
// In envelope (consumer):
onConnectionsChanged: ({ inputs }) => {
  if (!inputs.has("gate_in") && voiceToSource.size > 0) {
    // Gate input disconnected — release all holds
    for (const [voiceIdx, info] of voiceToSource) {
      const upstreamVoice = info.mapping.toUpstream(voiceIdx);
      info.allocator.release(upstreamVoice, consumerId);
    }
    voiceToSource.clear();

    // Fast-fade any active voices
    worklet?.port.postMessage({ type: "releaseAll" });
  }
},
```

### Allocator Safety Net

The allocator's `consumerDisconnected` method serves as a safety net for edge cases where the consumer didn't clean up properly (e.g., was removed abruptly). It simply clears holds without dispatching events:

```typescript
// In allocator (safety net only):
consumerDisconnected(consumerId: string): void {
  for (const voice of this.voices) {
    voice.consumers.delete(consumerId);
  }
}
```

### Node Deletion

When a consumer node is deleted:

1. Consumer's `onRemove()` releases all holds
2. Engine may call `consumerDisconnected` as safety net

```typescript
// In envelope's onRemove():
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

When a voice source node is deleted:

1. Engine calls `onConnectionsChanged` on downstream consumers (they clean up)
2. Then destroy the node and its allocator

### Why Consumer-Initiated?

This approach is preferred over allocator-initiated cleanup because:

- **Consumer knows its own state** and can clean up immediately
- **No wasted events** — force-release events wouldn't reach disconnected consumers anyway
- **Cleaner separation of concerns** — each component manages its own lifecycle
- **Simpler allocator** — `consumerDisconnected` is just a fallback, not the primary mechanism

### Summary

| Scenario              | Who cleans up                       | How                                            |
|-----------------------|-------------------------------------|------------------------------------------------|
| Cable disconnected    | Consumer via `onConnectionsChanged` | Consumer releases holds, fast-fades voices     |
| Consumer node deleted | Consumer in `onRemove()`            | Consumer releases holds before destruction     |
| Voice source deleted  | Consumers via connection change     | `onConnectionsChanged` triggers cleanup        |
| Voice stolen          | Allocator dispatches event          | Force-release event sent, consumers fast-fade  |
| Cable reconnected     | N/A                                 | Fresh allocator discovery on next gate-on      |

## Integration with Voice Count Propagation

Voice lifecycle management operates within a voice pool whose size is determined by [Voice Count Propagation](./voice-count.md). The two systems interact during resize operations.

### Resize Coordination

When voice count changes, the allocator coordinates with Consumer Hold:

| Operation        | Behavior                                    |
|------------------|---------------------------------------------|
| **Grow** (4→8)   | Immediate — new voice slots added instantly |
| **Shrink** (8→4) | Deferred — wait until voices 4-7 are free   |

Deferred shrinking ensures notes complete their release phase naturally, avoiding clicks or cut-off tails.

### Allocator State Machine

```typescript
type AllocationState =
  | { type: "stable"; voiceCount: number }
  | { type: "shrinking"; currentCount: number; targetCount: number };
```

During shrinking:
- New allocations only use voices 0 to `targetCount - 1`
- Voice stealing is limited to the target range
- On each `release()`, check if all voices ≥ `targetCount` are free
- When all excess voices are free, complete the resize and propagate downstream

```typescript
requestResize(newCount: number): void {
  const current = this.getCurrentCount();

  if (newCount >= current) {
    // Growing: immediate
    this.completeResize(newCount);
  } else {
    // Shrinking: deferred
    this.state = { type: "shrinking", currentCount: current, targetCount: newCount };
    this.checkShrinkComplete();  // Maybe already free?
  }
}

release(voiceIndex: number, consumerId: string): void {
  this.voices[voiceIndex].consumers.delete(consumerId);

  if (this.state.type === "shrinking") {
    this.checkShrinkComplete();
  }
}

private checkShrinkComplete(): void {
  if (this.state.type !== "shrinking") return;

  const { targetCount, currentCount } = this.state;

  for (let i = targetCount; i < currentCount; i++) {
    if (!this.isVoiceFree(i)) return;  // Still waiting
  }

  this.completeResize(targetCount);
}
```

### Multiple Resize Requests

Rapid changes (8→4→2→6) are handled by updating the target:

- If new count ≥ current: abort shrink, grow immediately
- If new count < current target: shrink further
- If new count > current target but < current: update target, check completion

## Design Decisions

1. **No safety timeout:** We cannot reliably distinguish between a buggy consumer and a legitimate long drone note. Voices remain held until explicitly released. If something is truly broken, voice stealing will eventually reclaim the voice when needed.

2. **Multiple consumers hold independently:** If voice 1 feeds two envelopes with different release times, both hold independently. The voice is only free when *all* consumers have released. This is correct behavior — the voice is genuinely still in use until both envelopes complete.

3. **Force-release via event bus (voice stealing only):** When a voice is stolen, consumers are notified via a `force-release` event through the existing event bus. This is only used for voice stealing — disconnect scenarios use consumer-initiated cleanup instead.

4. **Consumer-initiated cleanup on disconnect:** When a consumer is disconnected, it releases its own holds via `onConnectionsChanged` rather than waiting for the allocator to notify it. This is cleaner because: (a) the consumer knows its own state, (b) force-release events wouldn't reach disconnected consumers anyway, (c) each component manages its own lifecycle.

5. **No shrink timeout:** Same reasoning as safety timeout. Deferred shrinking waits indefinitely for voices to free. If a voice is held by a long drone, the shrink completes when the drone ends. Voice stealing handles the case where new notes need voices urgently.
