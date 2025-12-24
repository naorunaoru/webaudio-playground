# WebAudio Playground — Plan

## Current Status

- Graph editor
  - [x] Create nodes, drag to move, pan canvas
  - [x] Connect typed ports (audio/midi/cc/automation), reject mismatches
  - [x] Delete nodes and connections (keyboard)
  - [x] Persist graph in `localStorage`
  - [x] Render node UI panels in-place
- Node module system (graph + optional audio runtime)
  - [x] Built-in nodes: `midiSource`, `ccSource`, `oscillator`, `delay`, `audioOut`
  - [x] MIDI/CC routing through connections (and optional state patches via `onMidi`)
- Audio engine
  - [x] Instantiate/remove audio runtimes based on graph
  - [x] Reconnect audio edges on graph change
  - [x] Dispatch MIDI note events to audio runtimes (`handleMidi`)
  - [x] Basic level metering (per-node + master)
- UI component library
  - [ ] Knob
  - [ ] Slider
  - [ ] Envelope (ADSR, automation)
  - [ ] Waveform
- Sampler support
  - [ ] We need this
  - [ ] How to load and store?
- Funni synths
  - [ ] FM OPL-like synth (possible via subgraph?)
  - [ ] Wavetable synth (hi Serum)

## Nested graphs

Goal: graphs are nestable; each graph has audio + MIDI + CC inputs/outputs. The top-level graph bridges to the host (audio devices / WebMIDI) and/or hosts sequencers; parent graphs pass streams down into nested graphs.

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
- [ ] Host integration (top-level only)
  - [ ] Audio input node(s): mic/line-in via `getUserMedia` + device selection
  - [ ] Audio output node(s): destination routing + master controls
  - [ ] MIDI in/out nodes: WebMIDI permissions + device selection (optional)
- [ ] Sequencer foundation (many sequencers per workflow)
  - [ ] Transport: play/stop/tempo + global clock service
  - [ ] Event scheduler: lookahead queue to reduce jitter
  - [ ] Minimal “event source” node API so piano roll / tracker / live-coding share outputs

## Design Decisions

- [ ] WE NEED SAMPLES
- [ ] A node can't expose all its parameters via CC, node UI would be overloaded. Add a flag to a control?
- [ ] Should multiple event sources feed one target? How should it be handled?
- [ ] Latency budget (audio-in + scheduling jitter) and what “good enough” means in-browser
- [ ] Hot-swap story for subgraphs (edit nested graph while audio runs)
- [ ] Serialization/versioning of graphs and node states (migrations)
- [ ] What if audio data can also be used to control parameters?
