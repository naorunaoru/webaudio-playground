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
  - [ ] Splice a node into a connection
- Node module system
  - [x] Plugin-style node folders in `src/nodes/*` (typed state + graph UI + optional audio runtime)
  - [x] Implemented nodes (see `docs/nodes/node-catalog.md`): `midiSource`, `ccSource`, `midiPitch`, `oscillator`, `pmOscillator`, `pmPhasor`, `pmSin`, `samplePlayer`, `envelope`, `gain`, `filter`, `delay`, `reverb`, `limiter`, `audioOut`
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
  - 🚧 FM / OPL-like synth (single-voice patching possible; subgraph TBD)
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

## Subgraphs / Patches

The “nested graphs / subgraph as node” idea is now tracked as design docs:
- `docs/patch/README.md` — Patch nodes (reusable, instance-local, frozen interface)
- `docs/group/README.md` — Editor-only grouping (no routing/model changes)

## Design Decisions

- [x] Samples are a first-class concept (project `.zip` embeds samples; `samplePlayer` consumes them)
- [ ] A node can't expose all its parameters via CC, node UI would be overloaded. Add a flag to a control?
- [ ] Should multiple event sources feed one target? How should it be handled?
- [ ] Latency budget (audio-in + scheduling jitter) and what “good enough” means in-browser
- [ ] Hot-swap story for subgraphs (edit nested graph while audio runs)
- [ ] Serialization/versioning of graphs and node states (migrations) 🚧 project `.zip` has `formatVersion`, node-state migrations TBD
- [ ] What if audio data can also be used to control parameters?
