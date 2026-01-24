# Polyphony

Polyphonic cables, gate/trigger events, and CV routing.

## Core Concepts

### Poly Cables

A cable carries 1-N audio/CV channels through a single connection. Mono is simply `channelCount: 1`.

**Channel matching:**
- Many-to-one: all source channels sum into single destination (Web Audio behavior)
- One-to-many: single source fans out to all destinations
- Many-to-many: 1:1 mapping, excess channels dropped or unfilled

### Port Kinds

```typescript
type PortKind =
  | 'audio'    // Continuous audio-rate signal (-1 to 1)
  | 'cv'       // Continuous control voltage (0-1 or -1 to 1)
  | 'pitch'    // V/oct pitch CV (continuous)
  | 'gate'     // Event: on/off with duration (discrete)
  | 'trigger'  // Event: instantaneous (discrete)
  | 'midi';    // MIDI messages
```

**Compatibility:**
- `audio`, `cv`, `pitch` are interchangeable (all continuous signals)
- `gate` and `trigger` are interchangeable (both discrete events)
- `midi` is separate (bridges to CV/gate via MIDI-to-CV node)

### Gate and Trigger Events

Gates and triggers are discrete events routed via BFS graph traversal (same mechanism as MIDI).

```typescript
type GateEvent = {
  type: "gate";
  voice: number;
  state: "on" | "off";
  time: number;  // AudioContext.currentTime
};

type TriggerEvent = {
  type: "trigger";
  voice: number;
  time: number;
};
```

Events carry timestamps for sample-accurate scheduling via Web Audio automation.

## Signal Flow

```
Event routing (discrete messages):
[MIDI-to-CV] ──gate──> [Envelope]

Audio graph (continuous signals):
[MIDI-to-CV] ──pitch──> [VCO] ──audio──> [VCA] ──> out
                                           ^
                         [Envelope] ──cv───┘
```

## Implemented Nodes

### MIDI-to-CV

Converts MIDI to CV signals with polyphonic voice allocation.

**Outputs:**
- `gate_out` (gate) — Gate on/off per voice
- `pitch_out` (pitch) — V/oct pitch CV (N channels)
- `velocity_out` (cv) — Velocity CV (N channels)

**Voice allocation:** FIFO with voice stealing.

### VCO (Voltage Controlled Oscillator)

AudioWorklet-based oscillator accepting V/oct pitch input.

**Ports:**
- `pitch_in` (pitch) — V/oct pitch CV input
- `audio_out` (audio) — Audio output (N channels)

**V/oct conversion:** `Hz = A4 * 2^(vOct - 69/12)` where A4 comes from graph context.

### VCA (Voltage Controlled Amplifier)

Polyphonic amplitude control.

**Ports:**
- `audio_in` (audio) — Audio input (N channels)
- `cv_in` (cv) — Gain CV modulation (N channels)
- `audio_out` (audio) — Audio output (N channels)

### Envelope

ADSR envelope generator with gate input.

**Ports:**
- `gate_in` (gate) — Gate events trigger envelope
- `env_out` (cv) — Envelope CV output (N channels)

## Design Decisions

1. **V/oct pitch:** Following Eurorack convention. Transposition is addition, which works with Web Audio's additive AudioParam connections.

2. **Events vs audio-rate gates:** Gate is semantically binary. Edge detection at audio rate would be expensive and wasteful.

3. **Per-port channel count:** Different ports on the same node can have different channel counts.

4. **AudioWorklet for VCO:** Native `OscillatorNode.frequency` expects Hz, but V/oct → Hz is exponential (requires sample-by-sample processing).

5. **No hardcoded stereo:** Spatial audio handled by dedicated nodes at the end of the chain.

## Future Work

- MPE support (per-note pressure, slide)
- Voice Groups (subgraph instancing)
- Extract/Split/Merge utilities
- Dynamic voice count negotiation
