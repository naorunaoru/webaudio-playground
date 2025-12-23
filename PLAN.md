# WebAudio Playground (SunVox-like) — Coarse Plan

## Product Goals
- **Graph-first**: A node-based audio/MIDI/automation graph where each node can have any number of typed inputs/outputs.
- **Tracker-like sequencer**: Pattern editor that emits MIDI and automation into the graph.
- **Node UI**: Nodes may render anything from a simple activity indicator to full synth controls.
- **Live-coding feel**: Vite HMR updates UI and node code without restarting the audio engine.

## Core Concepts
### Port Types
- **Audio**: Web Audio `AudioNode` connections (stereo/mono; future: multichannel).
- **MIDI**: Event stream (note on/off, CC, program, clock).
- **Automation**: Time-stamped parameter/envelope events (continuous control, curves, LFO outputs).

### Graph Model (engine-facing)
- `Graph` contains `NodeInstance`s and `Connection`s.
- `NodeInstance` references a `NodeDefinition` (code/module) plus its serialized state.
- `Connection` links `(fromNode, fromPort)` → `(toNode, toPort)` with a `type` (audio/midi/automation).
- Nodes may expose:
  - `ports`: dynamic list (allow “add output”, “add input” patterns).
  - `params`: named parameters (for automation + UI binding).
  - `ui`: React component (or view model) that edits `state` and `params`.

## High-level Architecture
### Split: UI thread vs. Audio engine
- **UI thread**
  - Graph editor, node UIs, tracker UI.
  - Maintains authoritative *edit* state and sends incremental patches to the engine.
- **Audio engine**
  - Runs on `AudioWorklet` (preferred) with a lightweight message protocol.
  - Owns actual `AudioNode`/DSP objects and schedules events.
  - Must be resilient to UI reloads/HMR: keep engine in a stable global singleton.

### Message Protocol (UI → Engine)
- `graph/patch`: add/remove node, add/remove connection, update node state, update params.
- `transport/*`: play/stop/seek/bpm.
- `midi/events`: batch of events with sample-accurate timestamps (or AudioContext time).

### Persistence
- Save/load graph + patterns as JSON (localStorage initially; later: file import/export).

## Vite HMR Strategy (no audio restart)
- Create a **persistent engine singleton** stored on `globalThis`:
  - On HMR, UI modules reload but `globalThis.__engine` remains.
  - UI re-attaches to the existing engine via a small “engine client” wrapper.
- Use **hot-swappable NodeDefinitions**:
  - UI-side `NodeDefinition` modules can HMR-update.
  - Engine keeps `NodeInstance` DSP stable unless a definition requires rebuild.
  - Support two update modes:
    1) **UI-only** changes: swap node UI component, keep DSP untouched.
    2) **DSP changes**: version bump triggers node rebuild while preserving state where possible.

## MVP Slice (first usable loop)
1. **Scaffold**
   - Vite + TypeScript app with a minimal UI.
   - Engine singleton with an `AudioContext` and one test oscillator.
2. **Graph editor v0**
   - Create/move nodes on a canvas, connect ports, delete nodes/edges.
   - Validate typed connections (audio↔audio, midi↔midi, automation↔automation).
3. **Node system v0**
   - A small set of built-in nodes:
     - `AudioOut` (destination)
     - `Oscillator` (audio out)
     - `Gain` (audio in/out, automatable `gain`)
     - `MidiKeyboard` (midi out)
     - `MidiToFreq` (midi in → automation out)
4. **Tracker v0**
   - One pattern grid that emits note events to a selected MIDI output node.
   - Transport: play/stop, bpm.
5. **Automation v0**
   - Map automation signals to node params (e.g., `gain`, oscillator frequency).
6. **HMR proof**
   - Editing a node UI component preserves audio output.
   - Refresh/reload UI reconnects to the same engine instance.

## Near-term Enhancements
- Node library system (registry, categories, search, favorites).
- Better scheduling: lookahead clock + jitter control for MIDI/automation.
- Visual debugging: meters, scopes, MIDI event monitor.
- Undo/redo for graph edits.

## Stretch Goals
- Polyphonic voice allocation for synth nodes.
- Sample playback + slicing.
- Subgraphs / macros (module containers).
- WebMIDI input/output integration.
- Export: render to WAV via OfflineAudioContext.

## Open Decisions
- UI framework (React/Solid/Vanilla) and graph UI approach (React Flow vs custom canvas).
- Engine location: main thread with `AudioNode`s vs deeper DSP in `AudioWorkletProcessor`.
- Exact event format for MIDI/automation and timebase (AudioContext time vs sample frames).

