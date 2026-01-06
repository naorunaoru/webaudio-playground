# Audio Node System

Documentation for the plugin-style node architecture powering the audio graph.

## Overview

Each node is a self-contained "plugin module" that provides:

1. **Graph/UI definition** — Ports, React UI, and optional MIDI/CC handling
2. **Audio runtime factory** — Optional; for nodes that produce/consume audio
3. **AudioWorklet modules** — Optional; for DSP on the render thread
4. **WASM build step** — Optional; for nodes implemented in Rust/C/C++

Adding a node means creating a new folder under `src/nodes/<yourNode>/`.

## Documentation

| Document | Description |
|----------|-------------|
| [overview.md](./overview.md) | Folder layout and architecture |
| [types.md](./types.md) | Node state types and module augmentation |
| [graph-definition.md](./graph-definition.md) | Ports, UI components, event handling |
| [audio-runtime.md](./audio-runtime.md) | Audio factories and node instances |
| [registration.md](./registration.md) | Module exports and registration |
| [event-flow.md](./event-flow.md) | MIDI/CC routing and audio wiring |
| [wasm.md](./wasm.md) | WebAssembly build system |
| [node-catalog.md](./node-catalog.md) | List of implemented nodes |

## File Structure

```
src/nodes/
├── index.ts              # NODE_MODULES registry
├── oscillator/
│   ├── types.ts          # State type + module augmentation
│   ├── graph.tsx         # Ports + UI + event handling
│   ├── audio.ts          # Audio runtime factory
│   └── index.ts          # NodeModule export
├── limiter/
│   ├── types.ts
│   ├── graph.tsx
│   ├── audio.ts
│   ├── index.ts
│   ├── processor.ts      # AudioWorkletProcessor
│   └── build-wasm.mjs    # WASM build script
└── ...
```

## Design Principles

### Self-Contained Modules

Each node folder contains everything needed for that node type:
- Type definitions stay with the node
- UI components are co-located with graph definitions
- Audio runtime logic is isolated per node
- WASM builds are node-local

### Type Safety

The system uses TypeScript module augmentation so that:
- `GraphNode` is a discriminated union of all node types
- `NodeType` is a string literal union of all type names
- Node state is fully typed throughout the system

### Separation of Concerns

- **Graph layer**: Defines structure (ports, connections) and UI
- **Audio layer**: Manages Web Audio API nodes and connections
- **State layer**: Handled externally by Automerge CRDT

## Quick Start

To add a new node, see [overview.md](./overview.md) for the complete walkthrough.

Minimal checklist:
1. Create `src/nodes/<yourNode>/types.ts` — Define state type
2. Create `src/nodes/<yourNode>/graph.tsx` — Define ports and UI
3. Create `src/nodes/<yourNode>/audio.ts` — Define audio runtime (if needed)
4. Create `src/nodes/<yourNode>/index.ts` — Export as NodeModule
5. Register in `src/nodes/index.ts`
