# WebAudio Playground — Plan

## Current Status

Status legend: [x] Done | 🚧 Partial | [ ] Planned

- Graph editor
  - [x] Create nodes (toolbar), drag to move, pan via scrolling
  - [x] Connect typed ports (audio/midi/cc/automation), reject mismatches
  - [x] Delete nodes and connections (keyboard)
  - [x] Persist graph locally (Automerge repo + IndexedDB; current doc ID in `localStorage`)
  - [x] Render node UI panels in-place
  - [x] Undo/redo
  - [x] Import/export projects as `.zip` (graph + embedded samples)
  - [ ] Replace nodes
  - [ ] Insert nodes
  - [ ] Combine nodes
- Node module system
  - [x] Plugin-style node folders in `src/nodes/*` (typed state + graph UI + optional audio runtime)
  - [x] Implemented nodes (see `docs/nodes/node-catalog.md`): `midiSource`, `ccSource`, `oscillator`, `samplePlayer`, `envelope`, `gain`, `filter`, `delay`, `reverb`, `limiter`, `audioOut`
  - [x] MIDI/CC routing through connections (optional state patches via `onMidi`/`onCc`)
- Audio engine
  - [x] Instantiate/remove audio runtimes based on graph
  - [x] Reconnect audio edges on graph change
  - [x] Dispatch MIDI note events to audio runtimes (`handleMidi`)
  - [x] Basic level metering (per-node + master)
  - [x] AudioWorklet + WASM support for custom DSP nodes (e.g. `limiter`)
  - [x] Master output waveform sampling for UI
- UI component library (see `docs/ui/roadmap.md`)
- Sampler support
  - [x] Sample playback node (`samplePlayer`)
  - [x] Sample import/export + storage (project `.zip` embeds samples; stored in IndexedDB)
  - [ ] Sample editing UI (trim, normalize, slice)
  - [ ] Sample markers (looping)
- Funni synths
  - [ ] FM / OPL-like synth (should possible via subgraph)
  - [ ] Wavetable synth (hi Serum)
- Open Sound Control
  - [ ] Consume and parse OSC data from WebSocket connection
- Electron app
  - [ ] Basic distribution for macOS
  - [ ] File system access, project/sample browser
  - [ ] Unix/TCP/UDP/UART sockets for OSC
  - [ ] What happens if a project includes desktop-specific nodes but the app runs in the browser?
- Host integration
  - [ ] Audio input node(s): mic/line-in via `getUserMedia` + device selection
  - [x] Audio output node(s): destination routing + master controls (`audioOut`)
  - [ ] MIDI in/out nodes: WebMIDI permissions + device selection
  - Audio input/output configuration
    - [ ] Device selection
    - [ ] Channel mapping
- Sequencer foundation
  - [ ] Transport: play/stop/tempo + global clock service
  - [ ] Event scheduler: lookahead queue to reduce jitter
  - [ ] Minimal “event source” node API
- Polyphony
  - [ ] Multiple instances of a subgraph, one per voice
  - [ ] UI challenges
- Flying probes
  - [ ] MIDI controller (keyboard) window, sends events to selected node
  - [ ] A way to listen just to a single node's audio output
  - [ ] Debug data input/output (view raw MIDI/OSC events)

## Nested graphs

Goal: graphs are nestable; each graph has its own inputs/outputs. The top-level graph bridges to the host (audio devices / WebMIDI) and/or hosts sequencers; parent graphs pass streams down into nested graphs.

- [ ] Define a “graph as node” model (subgraph instances)
  - [ ] Explicit boundary nodes (no implicit forwarding)
    - [ ] Host to graph I/O mapping is done outside the graph scope
    - [ ] A graph uses dedicated I/O nodes (e.g. `graphAudioIn`, `graphAudioOut`, `graphMidiIn`, `graphMidiOut`, `graphCcIn`, `graphCcOut`)
    - [ ] Subgraph node ports are derived from those nodes, and parent wires into/out of them explicitly
  - [ ] Cycle/feedback policy across boundaries (allow/deny, audio vs event loops)
- [ ] Define I/O semantics per kind
  - [ ] Audio: channel format and (future) multichannel strategy
  - [ ] Events: define `midi` (= notes only), `cc` (= MIDI CC messages), other?
  - [ ] Timebase: choose canonical time (`AudioContext.currentTime` / sample frames) and conversions
- [ ] Build navigation + UX for nested graphs
  - [ ] Enter/exit subgraph, breadcrumb, “edit in place” vs “open in tab”
  - [ ] Expose subgraph interface ports visually on the subgraph node
  - [ ] Copy/paste or “promote to subgraph” workflow (select nodes → extract)
  - [ ] UI for exposing state/controls from a nested graph

## Design Decisions

- [x] Samples are a first-class concept (project `.zip` embeds samples; `samplePlayer` consumes them)
- [ ] A node can't expose all its parameters via CC, node UI would be overloaded. Add a flag to a control?
- [ ] Should multiple event sources feed one target? How should it be handled?
- [ ] Latency budget (audio-in + scheduling jitter) and what “good enough” means in-browser
- [ ] Hot-swap story for subgraphs (edit nested graph while audio runs)
- [ ] Serialization/versioning of graphs and node states (migrations) 🚧 project `.zip` has `formatVersion`, node-state migrations TBD
- [ ] What if audio data can also be used to control parameters?
