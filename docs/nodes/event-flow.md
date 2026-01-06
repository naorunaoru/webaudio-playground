# Event Flow

This document describes how MIDI/CC events and audio signals flow through the graph.

## Event Types

From `src/graph/types.ts`:

```ts
type MidiEvent =
  | { type: "noteOn"; note: number; velocity: number; channel: number }
  | { type: "noteOff"; note: number; velocity: number; channel: number }
  | { type: "cc"; controller: number; value: number; channel: number };
```

## MIDI/CC Routing

### Overview

1. A source node (midiSource, ccSource) emits an event via `onEmitMidi(nodeId, event)`
2. The router traverses outgoing connections matching the event kind
3. Each destination receives `(event, portId)` via its `onMidi` handler
4. The handler returns a state patch (or null)
5. All patches are applied to the graph state

### Connection Kind Matching

Events follow connections of the appropriate kind:

| Event Type | Connection Kind |
|------------|-----------------|
| `noteOn`, `noteOff` | `midi` |
| `cc` | `cc` |

### Routing Algorithm

From `src/graph/midiRouting.ts`:

```ts
function routeMidi(
  graph: GraphState,
  sourceNodeId: NodeId,
  event: MidiEvent
): Map<NodeId, Partial<NodeState>> {
  const patches = new Map();
  const visited = new Set<string>();
  const queue: Array<{ nodeId: NodeId; portId: string | null }> = [];

  // Find initial outgoing connections from source
  const kind = event.type === "cc" ? "cc" : "midi";
  for (const conn of graph.connections) {
    if (conn.from.nodeId === sourceNodeId && conn.kind === kind) {
      queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
    }
  }

  // BFS traversal
  while (queue.length > 0) {
    const { nodeId, portId } = queue.shift()!;
    const key = `${nodeId}:${portId}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    // Get node definition and call onMidi
    const def = getNodeDefinition(node.type);
    const patch = def.onMidi?.(node, event, portId);
    if (patch) {
      patches.set(nodeId, { ...patches.get(nodeId), ...patch });
    }

    // Continue to downstream nodes
    for (const conn of graph.connections) {
      if (conn.from.nodeId === nodeId && conn.kind === kind) {
        queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
      }
    }
  }

  return patches;
}
```

### Graph Layer: onMidi

Handles state changes in response to events:

```ts
// Example: Filter responding to CC
onMidi: (node, event, portId) => {
  if (event.type === "cc" && portId === "cc_cutoff") {
    const frequency = 20 * Math.pow(1000, event.value / 127);
    return { frequencyHz: frequency };
  }
  return null;
},
```

### Audio Layer: handleMidi

For real-time audio response (e.g., triggering envelopes):

```ts
// Example: Oscillator responding to note events
handleMidi: (event, portId, state) => {
  if (event.type === "noteOn") {
    oscillator.frequency.setValueAtTime(
      midiToFrequency(event.note),
      ctx.currentTime
    );
  }
},
```

## Audio Wiring

### Overview

Audio connections use Web Audio API's native connection system:

1. The engine maintains a map of `NodeId` → `AudioNodeInstance`
2. On graph change, it reconciles connections
3. For each audio connection: `source.getAudioOutput(portId).connect(dest.getAudioInput(portId))`

### Connection Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Oscillator  │     │   Filter    │     │  AudioOut   │
│             │     │             │     │             │
│  audio_out ─┼────►│─ audio_in   │     │             │
│             │     │  audio_out ─┼────►│─ audio_in   │
└─────────────┘     │             │     └─────────────┘
                    │  cv_freq   ─│◄──── (automation)
                    └─────────────┘
```

### AudioParam Connections

When `getAudioInput` returns an `AudioParam`, modulation sources can connect directly:

```ts
// Filter exposes frequency as AudioParam
getAudioInput: (portId) => {
  if (portId === "audio_in") return inputGain;
  if (portId === "cv_freq") return filter.frequency;  // AudioParam
  return null;
},
```

This allows CV/automation connections to modulate parameters at audio rate.

### Engine Reconciliation

From `src/audio/engine.ts`:

```ts
function reconcileConnections(prevConns: Connection[], nextConns: Connection[]) {
  // Disconnect removed connections
  for (const conn of prevConns) {
    if (!nextConns.find((c) => c.id === conn.id)) {
      const sourceInstance = instances.get(conn.from.nodeId);
      const destInstance = instances.get(conn.to.nodeId);
      if (sourceInstance && destInstance) {
        const output = sourceInstance.getAudioOutput?.(conn.from.portId);
        const input = destInstance.getAudioInput?.(conn.to.portId);
        if (output && input) {
          output.disconnect(input);
        }
      }
    }
  }

  // Connect new connections
  for (const conn of nextConns) {
    if (!prevConns.find((c) => c.id === conn.id)) {
      const sourceInstance = instances.get(conn.from.nodeId);
      const destInstance = instances.get(conn.to.nodeId);
      if (sourceInstance && destInstance) {
        const output = sourceInstance.getAudioOutput?.(conn.from.portId);
        const input = destInstance.getAudioInput?.(conn.to.portId);
        if (output && input) {
          output.connect(input);
        }
      }
    }
  }
}
```

## Event Emission

### From UI

Source nodes emit events via the graph editor's dispatch:

```tsx
// In MidiSourceUi
const handleTrigger = () => {
  onEmitMidi?.(node.id, {
    type: "noteOn",
    note: node.state.note,
    velocity: node.state.velocity,
    channel: node.state.channel,
  });
};
```

### Propagation

```
┌──────────────┐      ┌───────────┐      ┌──────────────┐
│  MidiSource  │ midi │ Oscillator│ midi │   Envelope   │
│              │─────►│           │─────►│              │
│  [Trigger]   │      │  onMidi   │      │   onMidi     │
└──────────────┘      │ handleMidi│      │  handleMidi  │
                      └───────────┘      └──────────────┘

1. MidiSource emits noteOn
2. Router finds midi connections
3. Oscillator.onMidi called (state patch)
4. Oscillator.handleMidi called (audio response)
5. Router continues to Envelope
6. Envelope.onMidi called (state patch)
7. Envelope.handleMidi called (triggers attack)
```

## Tips

1. **Keep onMidi pure**: Return state patches, don't mutate
2. **Use handleMidi for audio**: Time-critical responses go here
3. **Stable port IDs**: Events reference ports by ID
4. **Avoid cycles**: The router uses visited set to prevent infinite loops
5. **CC for parameters**: Use CC connections for continuous control
6. **MIDI for triggers**: Use MIDI connections for note events
