# Graph Definition

The graph definition specifies how a node appears and behaves in the graph editor: its ports, UI, and event handling.

## NodeDefinition Interface

From `src/types/nodeModule.ts`:

```ts
type NodeDefinition<TNode extends GraphNode> = {
  type: TNode["type"];
  title: string;
  ports: (node: TNode) => PortSpec[];
  ui?: React.ComponentType<NodeUiProps<TNode>>;
  onMidi?: (node: TNode, event: MidiEvent, portId: string | null) => Partial<TNode["state"]> | null;
};
```

## Defining Ports

Ports define the connection points on a node.

### Port Specification

```ts
type PortSpec = {
  id: string;                                    // Stable identifier
  name: string;                                  // Display name
  kind: "audio" | "midi" | "cc" | "automation"; // Connection type
  direction: "in" | "out";
};
```

### Port Kinds

| Kind | Purpose | Color |
|------|---------|-------|
| `audio` | Audio signal flow | Cyan (#88c0d0) |
| `midi` | MIDI note events (noteOn, noteOff) | Purple (#b48ead) |
| `cc` | Control Change messages | Teal (#8fbcbb) |
| `automation` | Parameter modulation (CV) | Orange (#d08770) |

### Dynamic Ports

The `ports()` function receives the node, allowing dynamic port lists:

```ts
ports: (node) => {
  const ports: PortSpec[] = [
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ];

  // Add CV input only if modulation is enabled
  if (node.state.hasModulation) {
    ports.push({ id: "cv_in", name: "CV", kind: "automation", direction: "in" });
  }

  return ports;
},
```

### Port ID Conventions

Keep port IDs stable across versions since connections reference them:

```ts
// Good - descriptive and stable
{ id: "audio_in", name: "In", kind: "audio", direction: "in" }
{ id: "midi_in", name: "MIDI", kind: "midi", direction: "in" }
{ id: "cv_frequency", name: "Freq CV", kind: "automation", direction: "in" }

// Avoid - generic IDs that might conflict
{ id: "in", name: "In", kind: "audio", direction: "in" }
```

## Defining the UI

The `ui` component renders inside the node card, below the ports.

### UI Props

```ts
type NodeUiProps<TNode extends GraphNode> = {
  node: TNode;
  onPatchNode: (nodeId: NodeId, patch: Partial<TNode["state"]>) => void;
  onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<TNode["state"]>) => void;
  runtimeState?: unknown;
};
```

### Basic UI Example

```tsx
const FooUi: React.FC<NodeUiProps<FooNode>> = ({ node, onPatchNode }) => {
  return (
    <div>
      <NumericInput
        value={node.state.value}
        min={0}
        max={100}
        onChange={(value) => onPatchNode(node.id, { value })}
      />
    </div>
  );
};
```

### Ephemeral Updates

Use `onPatchNodeEphemeral` for high-frequency updates (like dragging a knob) to avoid flooding the undo history:

```tsx
const KnobUi: React.FC<NodeUiProps<GainNode>> = ({ node, onPatchNode, onPatchNodeEphemeral }) => {
  return (
    <Knob
      value={node.state.depth}
      min={0}
      max={2}
      onChange={(depth) => onPatchNodeEphemeral?.(node.id, { depth })}
      onChangeEnd={(depth) => onPatchNode(node.id, { depth })}
    />
  );
};
```

### Runtime State

For displaying runtime-only data (like envelope phase), use `runtimeState`:

```tsx
const EnvelopeUi: React.FC<NodeUiProps<EnvelopeNode>> = ({ node, runtimeState }) => {
  const phase = (runtimeState as EnvelopeRuntimeState)?.phase ?? "idle";
  return <div>Phase: {phase}</div>;
};
```

### Theming

Wrap UI in `ThemeProvider` for custom accent colors:

```tsx
import { ThemeProvider } from "../../ui/context/theme";

const MidiSourceUi: React.FC<NodeUiProps<MidiSourceNode>> = (props) => (
  <ThemeProvider accent="purple">
    <MidiSourceControls {...props} />
  </ThemeProvider>
);
```

## Event Handling

### onMidi Handler

Called when MIDI/CC events arrive at this node:

```ts
onMidi: (node, event, portId) => {
  if (event.type === "cc" && portId === "cc_cutoff") {
    // Map CC value (0-127) to frequency (20-20000 Hz)
    const frequency = 20 + (event.value / 127) * 19980;
    return { frequencyHz: frequency };
  }
  return null;  // No state change
},
```

### Event Types

```ts
type MidiEvent =
  | { type: "noteOn"; note: number; velocity: number; channel: number }
  | { type: "noteOff"; note: number; velocity: number; channel: number }
  | { type: "cc"; controller: number; value: number; channel: number };
```

### Port-Specific Handling

The `portId` parameter tells you which input received the event:

```ts
onMidi: (node, event, portId) => {
  if (event.type === "cc") {
    switch (portId) {
      case "cc_attack":
        return { env: { ...node.state.env, attackMs: event.value * 10 } };
      case "cc_decay":
        return { env: { ...node.state.env, decayMs: event.value * 10 } };
      default:
        return null;
    }
  }
  return null;
},
```

## Complete Example

```tsx
// src/nodes/gain/graph.tsx
import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/nodeModule";
import { NumericInput } from "../../ui/components/NumericInput";

type GainNode = Extract<GraphNode, { type: "gain" }>;

const GainUi: React.FC<NodeUiProps<GainNode>> = ({ node, onPatchNode }) => (
  <NumericInput
    value={node.state.depth}
    min={0}
    max={2}
    step={0.01}
    onChange={(depth) => onPatchNode(node.id, { depth })}
  />
);

export const gainGraph: NodeDefinition<GainNode> = {
  type: "gain",
  title: "VCA",
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "cv_in", name: "CV", kind: "automation", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: GainUi,
  onMidi: (node, event) => {
    if (event.type === "cc") {
      return { depth: event.value / 127 * 2 };
    }
    return null;
  },
};
```
