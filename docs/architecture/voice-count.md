# Voice Count Propagation

## Overview

Voice count (channel count) flows downstream from source nodes. Downstream nodes automatically match their upstream source rather than maintaining independent voice counts.

## The Rule

```typescript
function getChannelCount(node: Node): number {
  const sourceInput = node.inputs.find(i => i.definesChannelCount);
  
  if (sourceInput && sourceInput.connected) {
    // Inherit from upstream
    return sourceInput.source.channelCount;
  } else {
    // Use node's own setting
    return node.params.voiceCount ?? 1;
  }
}
```

**Source nodes** (MIDI-to-CV, etc.) define voice count explicitly.

**Downstream nodes** inherit from their source input.

## Flow Example

```
[MIDI-to-CV]     voiceCount: 12 (explicit)
      │
      ▼
[Oscillator]     voiceCount: 12 (inherited from pitch input)
      │
      ▼
[Filter]         voiceCount: 12 (inherited from audio input)
      │
      ▼
[VCA]            voiceCount: 12 (inherited from audio input)
      │
      ▼
[Output]         voiceCount: 1 (sums all channels)
```

## Which Input Defines Channel Count?

Nodes may have multiple inputs. One input is marked as the "channel count source" via the `definesChannelCount` property in the port definition.

| Node | Channel-defining input | Why |
|------|------------------------|-----|
| Oscillator | pitch | Pitch determines how many oscillators |
| Filter | audio in | Processing N audio channels |
| VCA | audio in | Processing N audio channels |
| Envelope | gate (event) | One envelope per voice |
| Mixer | — (takes max) | Combines multiple sources |

For most processing nodes, the primary audio/signal input defines channel count.

### Port Definition

```typescript
type PortSpec = {
  id: PortId;
  name: string;
  kind: PortKind;
  direction: PortDirection;
  channelCount?: number;
  /** If true, this input determines the node's channel count when connected. */
  definesChannelCount?: boolean;
};
```

### Channel Count Strategy

Mixer-type nodes that combine multiple inputs use a different strategy:

```typescript
type ChannelCountStrategy =
  | { type: "inherit" }      // Use definesChannelCount input (default)
  | { type: "max" }          // Take maximum of all connected inputs
  | { type: "fixed"; count: number }; // Always this count (e.g., Output = 1)
```

Nodes specify their strategy in the module definition. If not specified, defaults to `"inherit"`.

## Edge Cases

### Multiple Sources with Different Counts

```
[Source A (8ch)] ───→ [Mixer] → ?
[Source B (12ch)] ───→   ↗
```

**Resolution:** Take the maximum. Mixer becomes 12-channel. Source A's 8 channels connect to channels 1-8, channels 9-12 receive nothing from A.

```typescript
function getChannelCountMultipleInputs(node: Node): number {
  const counts = node.inputs
    .filter(i => i.connected)
    .map(i => i.source.channelCount);
  
  return Math.max(...counts, node.params.voiceCount ?? 1);
}
```

### No Source Connected

Node uses its own `voiceCount` parameter (default: 1).

```
[Oscillator]     voiceCount: 1 (no pitch input connected)
     │
     └── pitch input: disconnected
     └── user param voiceCount: 1
```

User can manually set `voiceCount` for standalone nodes (e.g., drone oscillator with manual pitch).

### Source Disconnected / Reconnected

When source changes:

1. New channel count calculated
2. Node reallocates Web Audio instances
3. Brief audio glitch possible during reallocation

See [Deferred Shrinking](#deferred-shrinking) for how shrinking coordinates with active voices.

### Runaway Voice Count

User connects a 128-voice source. Every downstream node allocates 128 instances.

**Mitigation:** Global maximum voice cap.

```typescript
const GLOBAL_MAX_VOICES = 32;

function getChannelCount(node: Node): number {
  const inherited = /* ... */;
  return Math.min(inherited, GLOBAL_MAX_VOICES);
}
```

Cap is configurable. Exceeding it shows a warning but doesn't break the graph.

## Implementation

### Node Base Class

```typescript
abstract class Node {
  protected channelCount: number = 1;

  // From module definition
  protected channelCountStrategy: ChannelCountStrategy = { type: "inherit" };

  updateChannelCount(): void {
    let newCount: number;

    switch (this.channelCountStrategy.type) {
      case "fixed":
        newCount = this.channelCountStrategy.count;
        break;

      case "max":
        // Take maximum of all connected inputs
        const counts = this.inputs
          .filter(i => i.connected)
          .map(i => i.source.channelCount);
        newCount = Math.max(...counts, this.params.voiceCount ?? 1);
        break;

      case "inherit":
      default:
        // Find the input marked with definesChannelCount
        const definingInput = this.inputs.find(i => i.definesChannelCount);
        if (definingInput?.connected) {
          newCount = definingInput.source.channelCount;
        } else {
          newCount = this.params.voiceCount ?? 1;
        }
        break;
    }

    newCount = Math.min(newCount, GLOBAL_MAX_VOICES);

    if (newCount !== this.channelCount) {
      this.channelCount = newCount;
      this.reallocate();  // Recreate Web Audio nodes
      this.propagateDownstream();  // Notify connected nodes
    }
  }

  protected abstract reallocate(): void;

  private propagateDownstream(): void {
    for (const output of this.outputs) {
      for (const connection of output.connections) {
        connection.destination.node.updateChannelCount();
      }
    }
  }
}
```

### On Connection Change

```typescript
function onConnect(source: OutputPort, dest: InputPort): void {
  // ... create cable ...
  
  // Propagate channel count downstream
  dest.node.updateChannelCount();
}

function onDisconnect(cable: Cable): void {
  // ... remove cable ...
  
  // Recalculate channel count
  cable.destination.node.updateChannelCount();
}
```

### Mixer Node (Multiple Inputs)

Mixer uses the `max` strategy, which is defined in the module definition:

```typescript
// In mixer module definition
const mixerModule = {
  type: "mixer",
  channelCountStrategy: { type: "max" },
  // ...
};
```

The base class `updateChannelCount()` handles the `max` strategy automatically — no override needed.

## Extracting Single Channel

When user uses Extract node to pull out one channel:

```
[MIDI-to-CV (12ch)] → [Oscillator (12ch)] → [Extract ch3] → [Effect (1ch)]
```

Extract node outputs `channelCount: 1`. Downstream sees 1 channel, allocates accordingly.

```typescript
class ExtractNode extends Node {
  updateChannelCount(): void {
    // Extract always outputs 1 channel, regardless of input
    this.channelCount = 1;
    this.propagateDownstream();
  }
}
```

## Summary

| Scenario                    | Channel count                      | Strategy    |
| --------------------------- | ---------------------------------- | ----------- |
| Source node (MIDI-to-CV)    | Explicit parameter                 | —           |
| Node with source connected  | Inherited from source              | `inherit`   |
| Node with no source         | Own `voiceCount` param (default 1) | `inherit`   |
| Mixer (multiple sources)    | Maximum of all sources             | `max`       |
| Global cap exceeded         | Clamped to `GLOBAL_MAX_VOICES`     | —           |
| Extract node                | Always 1                           | `fixed: 1`  |
| Sum/Output node             | Always 1                           | `fixed: 1`  |

## Deferred Shrinking

When voice count decreases, active voices may still be in use (e.g., envelope in release phase). Rather than cutting off notes mid-release, shrinking is deferred until excess voices are free.

This coordinates with the [Consumer Hold](./voice-propagation.md#solution-b-consumer-hold-model) model from voice lifecycle management.

### Behavior

| Operation        | Behavior                                    |
|------------------|---------------------------------------------|
| **Grow** (4→8)   | Immediate — new voice slots added instantly |
| **Shrink** (8→4) | Deferred — wait until voices 4-7 are free   |

### Example Timeline

```
Current: 8 voices, voices 5,6,7 in release phase
User requests: 4 voices

├── t0: Request to shrink to 4
│       Voices 5,6,7 still releasing — do nothing yet
├── t1: Voice 7 release completes → 5,6 still held
├── t2: Voice 6 release completes → 5 still held
├── t3: Voice 5 release completes → all voices ≥4 are free
└── t4: NOW resize to 4 voices, propagate downstream
```

### During Shrinking State

While waiting for excess voices to free:

- New allocations only use voices 0 to `targetCount - 1`
- Voice stealing is limited to the target range
- Downstream nodes are not notified until resize completes
- Growing cancels the pending shrink and applies immediately

### Multiple Resize Requests

Rapid changes (8→4→2→6) update the target:

- If new count ≥ current: abort shrink, grow immediately
- If new count < current target: shrink further
- If new count > current target but < current: update target, check completion

## Design Decisions

1. **Circular graphs use global cap:** Feedback loops may be used intentionally (e.g., algorithmic ambient patches). Channel count propagation doesn't need cycle detection — the global cap (`GLOBAL_MAX_VOICES`) prevents runaway allocation regardless of graph topology.

2. **No per-node caps:** Nodes don't have individual voice limits. If a user wants to limit voices going into a reverb, they can use a mixer or channel reduction node upstream. This keeps node behavior predictable and puts control in the user's hands.

3. **No shrink timeout:** Deferred shrinking waits indefinitely for voices to free. We cannot distinguish between a buggy consumer and a legitimate long drone note. If voices are urgently needed, voice stealing handles it. See [Voice Lifecycle — Design Decisions](./voice-propagation.md#design-decisions) for full rationale.
