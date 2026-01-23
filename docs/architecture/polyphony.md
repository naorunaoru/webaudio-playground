# Polyphony Design Document

## Overview

This document outlines the architecture for polyphony support, covering poly cables, poly-aware nodes, voice groups, and MPE integration.

## Core Concepts

### Poly Cables

A cable carries 1-N audio/CV channels through a single connection. There is no separate "mono" cable type — mono is simply a poly cable with `channelCount: 1`.

**Behavior:**

- Cables have a channel count (runtime parameter, determined by source node)
- When higher channel count connects to lower: excess channels dropped
- When lower channel count connects to higher: channels connect 1:1, excess destination channels receive nothing
- When connecting to `channelCount: 1`: all source channels sum automatically (Web Audio behavior)

**Initial implementation:** Fixed channel count (e.g., 8 voices). Dynamic allocation deferred to later iteration.

### Poly-Aware Nodes

A poly-aware node processes N channels when it receives N channels. It doesn't require voice groups — polyphony emerges from the cable channel count.

**Node categories:**

1. **Generators** (oscillator, noise): Output poly if configured to, or if receiving poly pitch input
2. **Processors** (filter, wavefolder, delay): Process N channels in, N channels out
3. **Modulators** (envelope, LFO): Can be poly (per-voice envelope) or mono (shared modulation)
4. **Utilities** (mixer, gain): Either sum to mono or process per-channel

**Implementation:** Each node processes `channelCount` iterations per audio block. Mono nodes are just the `channelCount = 1` case.

### Gate and Trigger Signals

Gates and triggers are discrete events, not continuous signals. They travel through cables via graph traversal (BFS), similar to MIDI routing.

**Trigger:** Instantaneous event. "Something happened now." Used for:

- Envelope attack initiation
- Sequencer step advance
- Sample & hold capture
- Reset signals

**Gate:** State change with duration. "On" and "off" are separate events. Used for:

- Envelope sustain (attack on gate-on, release on gate-off)
- Muting/unmuting
- Legato detection

**Gate/trigger compatibility:** Nothing prevents connecting a trigger output to a gate input or vice versa. A trigger can be treated as an instantaneous gate-on (with implicit immediate gate-off). A gate-on can be treated as a trigger (ignoring the gate-off).

### Event Routing

Events are discrete messages routed through cables via BFS graph traversal, the same mechanism used for MIDI routing today.

```typescript
interface GateEvent {
  voice: number;
  type: 'on' | 'off';
  time: number;           // ctx.currentTime for sample-accurate scheduling
  velocity?: number;      // optional, for note-on
}

interface TriggerEvent {
  voice: number;
  time: number;
}

type VoiceEvent = GateEvent | TriggerEvent;
```

**Why not audio-rate gate signals?**

- Edge detection at every node is expensive (8 voices × N nodes × every sample)
- Gate is semantically binary — a value of 0.7 has no meaning
- Web Audio's scheduler provides sample-accurate response if `event.time` is accurate

**Event flow:**

```
┌─────────────────────────────────────────────────────────────┐
│  Event routing (discrete messages via cables)               │
│                                                             │
│  [MIDI-to-CV] ──gate──→ [Envelope] ──gate──→ [Oscillator]  │
│       │                      │                              │
│       └──────trigger──→ [Sample & Hold]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Audio graph (continuous signals)                           │
│                                                             │
│  [MIDI-to-CV] ──pitch──→ [Osc] ──audio──→ [VCA] ──→ out    │
│                                             ↑               │
│                          [Envelope] ──cv────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Routing mechanism:**

Events are dispatched through the graph using BFS traversal, following edges of `gate` or `trigger` kind. This mirrors the existing MIDI routing system:

```typescript
// Existing MIDI dispatch
engine.dispatchMidi(graph, sourceNodeId, midiEvent);

// New event dispatch (same pattern)
engine.dispatchEvent(graph, sourceNodeId, portId, voiceEvent);
```

A cable connection represents a subscription — when node A connects its gate output to node B's gate input, node B receives events dispatched from node A.

**Direct dispatch:** Nodes call `engine.dispatchEvent()` directly when they have an event to emit. This keeps timing immediate — important for sample-accurate scheduling. No queuing or batching; events are dispatched as they occur.

**Sample-accurate response:**

Events carry `time` (captured at MIDI input). Receiving nodes use Web Audio scheduling:

```typescript
// Envelope receives gate event
onGateEvent(event: GateEvent) {
  if (event.type === 'on') {
    this.output.cancelScheduledValues(event.time);
    this.output.setValueAtTime(0, event.time);
    this.output.linearRampToValueAtTime(1, event.time + this.attack);
  }
  if (event.type === 'off') {
    this.output.cancelScheduledValues(event.time);
    this.output.setTargetAtTime(0, event.time, this.release / 4);
  }
}
```

The message isn't sample-accurate, but the scheduled automation is.

**Continuous modulation is separate:**

| Want this? | Use this |
|------------|----------|
| Trigger envelope | Gate event → Envelope |
| Amplitude modulation | LFO/Osc → VCA gain input (audio/CV) |
| Frequency modulation | LFO/Osc → Oscillator pitch input (audio/CV) |
| Tremolo | Slow LFO → VCA gain input (audio/CV) |
| Vibrato | Slow LFO → Oscillator pitch input (audio/CV) |

Gate/trigger = discrete events. Modulation = continuous audio/CV signals. Clean separation.

### Envelope Behavior

Envelopes receive triggers (or gate-on events), run their ADSR cycle, and output:

1. **CV output** (continuous): The envelope curve value (0-1), used for amplitude, filter cutoff, etc.
2. **Gate output** (event): Indicates the envelope is currently running (attack through release). Goes low when envelope completes.

The gate output allows downstream nodes to know when a voice is active. For example, an oscillator can use this to enable/disable itself, or a voice allocator can know when a voice is free.

### MIDI-to-CV Node

Bridges external MIDI/MPE to the internal CV/gate world.

**Inputs:**

- MIDI input port (receives MIDI events via existing MIDI routing)

**Outputs:**

**Event output:**

| Output | Kind | Description |
|--------|------|-------------|
| gate | gate | Gate on/off per voice, with velocity |

**CV outputs (audio-rate cables):**

| Output | Channels | Kind | Range | Description |
|--------|----------|------|-------|-------------|
| pitch | N | pitch | V/oct | Note + per-note pitch bend combined |
| velocity | N | cv | 0-1 | Note-on velocity, held until next note |
| pressure | N | cv | 0-1 | Per-note aftertouch (MPE) |
| slide | N | cv | 0-1 | CC74 per note (MPE) |

**Global CV outputs (1-channel):**

| Output | Kind | Range | Description |
|--------|------|-------|-------------|
| mod | cv | 0-1 | CC1 mod wheel |
| expression | cv | 0-1 | CC11 expression |
| sustain | cv | 0 / 1 | CC64 sustain pedal |
| bend | cv | -1 to 1 | Global pitch bend (master channel) |

**Parameters:**

- Voice count (runtime parameter, e.g., 4, 8, 16)
- Voice allocation mode: fifo, lifo, lowest, highest, round-robin
- Pitch bend range (semitones)

**Voice allocation:**

- Maintains a pool of N voices
- On note-on: assign to free voice, or steal based on allocation mode
- On note-off: voice enters release (gate goes low), becomes free when envelope reports idle
- Voices without active notes output: gate low, other CVs hold last value

### Voice Groups (Future)

A voice group is a container that:

1. Receives poly cables as input
2. Unpacks channel N into instance N
3. Runs a monophonic subgraph per instance
4. Packs instance outputs back into poly cable

**Inside the voice group:**

- All cables are mono
- Special "Voice Input" nodes expose gate, pitch, pressure, slide, velocity
- Special "Voice Output" node defines what gets packed back out

**This allows:**

- Complex per-voice routing with existing mono nodes
- No need to make every node poly-aware
- Clear boundary between "per-voice" and "shared" processing

**Deferred:** Implement after poly cables and poly-aware nodes are proven.

## Signal Flow Examples

### Minimal Poly Synth (No Voice Groups)

```
[MIDI-to-CV] → pitch (8ch) ──→ [Oscillator] → audio (8ch) → [Sum to 1ch] → output
             → gate (8ch) ───→ [Envelope] ──→ [VCA] ↗
```

All nodes are poly-aware. 8 notes in = 8 oscillators + 8 envelopes + 8 VCAs, summed to single-channel output.

### Poly Synth with Voice Group (Future)

```
[MIDI-to-CV] → pitch/gate/pressure (8ch) → [Voice Group] → audio (8ch) → [Reverb] → out
                                               │
                         ┌─────────────────────┘
                         ↓ (inside, single-channel per voice)
                  [Voice In: pitch] → [Oscillator] → [Filter] → [VCA] → [Voice Out]
                  [Voice In: gate]  → [Envelope] ────────────────↗
                  [Voice In: pressure] → [Filter cutoff mod]
```

Patch once, runs N times. Reverb is shared (outside voice group, receives summed output or processes all channels).

### Per-Voice Effects with Cross-Routing

```
[Voice Group] → audio (8ch) → [Delay (8ch aware)] → audio (8ch) → [Sum] → out
                                  ↑
                            (feedback matrix: voice N feeds voice N+1)
```

Delay is channel-aware with custom cross-voice feedback. Voices bleed into each other rhythmically.

## Cable Utilities

Explicit routing nodes for when implicit sum isn't what you want:

| Node | Inputs | Outputs | Purpose |
|------|--------|---------|---------|
| **Sum** | N channels | 1 channel | Explicit mix-down (same as implicit behavior when connecting to 1-channel input) |
| **Extract** | N channels, index param | 1 channel | Pull out single voice for individual processing |
| **Split** | N channels | N × 1-channel | Unpack all channels to separate cables |
| **Merge** | N × 1-channel | N channels | Pack separate cables into multi-channel cable |

**Implementation priority:** Extract and Split first. Merge when needed. Sum is implicit so explicit node is low priority.

## Port Kinds

The system uses these port kinds:

```typescript
type PortKind =
  | 'audio'    // Continuous audio-rate signal (-1 to 1)
  | 'cv'       // Continuous control voltage (0-1 or -1 to 1)
  | 'pitch'    // V/oct pitch CV (continuous)
  | 'gate'     // Event: on/off with duration (discrete)
  | 'trigger'  // Event: instantaneous (discrete)
  | 'midi';    // MIDI messages (existing system, unchanged)
```

**Routing behavior by kind:**

| Kind | Transport | Routing |
|------|-----------|---------|
| `audio`, `cv`, `pitch` | Web Audio connections | Continuous signal flow |
| `gate`, `trigger` | Event dispatch | BFS traversal, like MIDI |
| `midi` | MIDI dispatch | Existing BFS routing (unchanged) |

**Compatibility:**

- `audio`, `cv`, `pitch` are interchangeable (all continuous signals)
- `gate` and `trigger` are interchangeable (both discrete events)
- `midi` is separate (bridges to CV/gate via MIDI-to-CV node)

## Data Types Summary

After this implementation, the system has two transport mechanisms:

### Audio/CV (continuous, via cables)

| Type | Range | Interpretation |
|------|-------|----------------|
| **Audio** | -1 to 1 | Sound signal |
| **CV** | 0 to 1 (or -1 to 1) | Control voltage (mod amount, etc.) |
| **Pitch** | V/oct | Pitch CV (0V = C0) |

All are audio-rate signals. Cables carry 1-N channels.

### Events (discrete, via cables)

| Type | Data | Interpretation |
|------|------|----------------|
| **Gate** | voice, on/off, time, velocity | Note start/end, envelope active |
| **Trigger** | voice, time | Instantaneous event |

Events are messages with timestamps, routed via BFS through graph connections. Receivers schedule sample-accurate responses via Web Audio automation.

### Why two systems?

- **Audio/CV:** Continuous modulation (AM, FM, filter sweeps). Runs at audio rate.
- **Events:** Discrete moments (note on, clock tick, reset). No wasted cycles on edge detection.

## Implementation Phases

### Phase 0: Infrastructure

**Goal:** Prepare the codebase for polyphony without changing behavior.

**Tasks:**

1. Add `channelCount` to `PortSpec` (per-port, default to 1 for existing nodes)
2. Refactor `getAudioOutput/Input` to return arrays (`AudioNode[]` instead of `AudioNode`)
3. Update connection logic in engine to handle N:M channel connections
4. Add new port kinds: `cv`, `pitch`, `gate`, `trigger`
5. Implement event dispatch system (parallel to MIDI dispatch, direct dispatch from nodes)
6. Remove experimental nodes: `midiPitch`, `pmOscillator`, `pmPhasor`, `pmSin`

**Result:** Existing nodes continue to work (all mono), but infrastructure supports poly.

### Phase 1: Poly Cables + Poly-Aware Oscillator

**Goal:** Play a MIDI chord, hear multiple notes.

**Tasks:**

1. Create MIDI-to-CV node with configurable voice count, outputs poly gate + poly pitch (V/oct)
2. Make oscillator poly-aware (N pitch inputs → N audio outputs, V/oct → Hz conversion internal)
3. Test: MIDI keyboard → MIDI-to-CV → Poly Osc → output. Play chord. Hear chord.

**Not included:** Envelopes, velocity, pressure, voice stealing. Just pitch and dumb gates.

### Phase 2: Poly Envelope + VCA

**Goal:** Notes have amplitude shape, not just on/off.

**Tasks:**

1. Make envelope poly-aware (N gate events in → N CV outputs + N gate outputs)
2. Make VCA poly-aware (N audio in × N CV in → N audio out)
3. Wire: gate → envelope → VCA control

**Result:** A playable, if basic, polysynth.

### Phase 3: MPE Support

**Goal:** Full expressive control per note.

**Tasks:**

1. Extend MIDI-to-CV to parse MPE (pitch bend per channel, pressure, slide)
2. Output poly pressure and poly slide CVs
3. Route pressure/slide to filter, amplitude, whatever

### Phase 4: Voice Groups

**Goal:** Complex per-voice routing without poly-aware everything.

**Tasks:**

1. Implement Voice Group container node
2. Implement Voice Input / Voice Output nodes
3. Subgraph instantiation (N copies of internal graph)
4. Poly cable unpacking at input, repacking at output

### Phase 5: Utilities + Refinement

**Goal:** Flexible routing, edge cases.

**Tasks:**

1. Extract, Split, Merge nodes
2. Voice stealing policies (beyond FIFO)
3. Dynamic voice count (maybe)
4. Poly channel count negotiation between nodes

## Ports and Wiring

### Core Concepts

Cables connect output ports to input ports. The cable itself is just a relationship — the ports hold the metadata and capabilities.

### Port Types

```typescript
interface PortSpec {
  id: string;
  name: string;
  kind: PortKind;
  direction: 'in' | 'out';
  channelCount: number;  // 1 = mono, N = poly (per-port, not per-node)
}
```

**Channel count is per-port, not per-node.** A single node can have ports with different channel counts:

```typescript
// Example: MIDI-to-CV node with 8 voices
const ports: PortSpec[] = [
  { id: 'gate', name: 'Gate', kind: 'gate', direction: 'out', channelCount: 8 },
  { id: 'pitch', name: 'Pitch', kind: 'pitch', direction: 'out', channelCount: 8 },
  { id: 'velocity', name: 'Velocity', kind: 'cv', direction: 'out', channelCount: 8 },
  { id: 'mod', name: 'Mod', kind: 'cv', direction: 'out', channelCount: 1 },  // Global, mono
  { id: 'sustain', name: 'Sustain', kind: 'cv', direction: 'out', channelCount: 1 },  // Global, mono
];
```

A node's parameters (like "voice count") determine what the channel counts are for its ports. The ports function returns the current port specs based on node state.

```typescript
interface ParameterInfo {
  name: string;
  range: [number, number];
  default: number;
  step?: number;           // for discrete params
  unit?: string;           // "Hz", "dB", "V/oct", "normalized"
}

// Runtime interface for audio nodes
interface AudioPortAccess {
  getAudioOutputs(portId: string): AudioNode[];   // Array of N nodes
  getAudioInputs(portId: string): (AudioNode | AudioParam)[];  // Array of N targets
}

// Runtime interface for event handling
interface EventPortAccess {
  handleEvent(portId: string, event: VoiceEvent): void;
}
```

### Cable

```typescript
interface Cable {
  id: string;
  kind: PortKind;
  source: { nodeId: string; portId: string };
  destination: { nodeId: string; portId: string };
}
```

The cable doesn't carry signal data — it's a graph-level record of what's connected to what.

### Connection Behavior

```typescript
function connectAudio(sourcePort: PortSpec, destPort: PortSpec,
                      sourceNodes: AudioNode[], destNodes: (AudioNode | AudioParam)[]): void {
  const srcCount = sourceNodes.length;
  const dstCount = destNodes.length;

  if (dstCount === 1) {
    // Many-to-one: all sources sum into single destination (Web Audio behavior)
    sourceNodes.forEach(src => src.connect(destNodes[0]));
  } else if (srcCount === 1) {
    // One-to-many: single source fans out to all destinations
    destNodes.forEach(dst => sourceNodes[0].connect(dst));
  } else {
    // Many-to-many: 1:1 mapping, excess channels dropped or unfilled
    const connectCount = Math.min(srcCount, dstCount);
    for (let i = 0; i < connectCount; i++) {
      sourceNodes[i].connect(destNodes[i]);
    }
  }
}
```

### Channel Count Mismatch

| Source Channels | Dest Channels | Behavior |
|-----------------|---------------|----------|
| 8 | 4 | Channels 5-8 dropped |
| 4 | 8 | Channels 1-4 connected, 5-8 receive nothing |
| 8 | 1 | All channels sum into single-channel input |
| 1 | 8 | Single channel fans out to all 8 destinations |

## Web Audio Implementation

### Current Architecture

Nodes are implemented using native Web Audio primitives:

- **Gain node:** `ConstantSource` + `GainNode`
- **Envelope:** `ConstantSource` with scheduled automation
- **Oscillator:** `OscillatorNode`
- **Filter:** `BiquadFilterNode`
- etc.

This approach is performant, handles audio threading automatically, and provides battle-tested DSP. Custom DSP (e.g., limiter) uses AudioWorklet + WASM.

### Poly Cables as Node Instances

In this architecture, a poly cable isn't a multi-channel buffer — it's a reference to N parallel Web Audio node instances.

```javascript
// Mono oscillator
const osc = ctx.createOscillator();

// Poly oscillator = 8 OscillatorNode instances
const oscsPoly = Array(8).fill(null).map(() => ctx.createOscillator());
```

**Channel count = instance count.** An 8-voice poly oscillator means 8 `OscillatorNode` instances, each with its own frequency parameter.

### Implicit Sum via Web Audio

Web Audio automatically sums when multiple nodes connect to one input. The "implicit sum" behavior is free:

```javascript
// All 8 oscillators connect to same destination = automatic sum
oscs.forEach(osc => osc.connect(destinationGain));
```

No explicit mixer node needed at the Web Audio level (though you may still want one in the graph UI for gain control).

### Poly CV/Automation Routing

**1-channel modulator → N-channel target (fan-out):**

One LFO modulates all 8 filter cutoffs:

```javascript
// 1-channel LFO connects to all filter instances
filters.forEach(f => lfo.connect(f.frequency));
```

**N-channel modulator → N-channel target (1:1):**

Per-voice envelope to per-voice VCA:

```javascript
// Each envelope connects to its corresponding VCA
envelopes.forEach((env, i) => env.connect(vcas[i].gain));
```

**N-channel modulator → 1-channel target (implicit sum):**

8 envelope outputs summed into one parameter — unusual, but Web Audio handles it:

```javascript
// All envelopes sum into one gain param (weird, but works)
envelopes.forEach(env => env.connect(singleVca.gain));
```

### MIDI-to-CV Implementation

The MIDI-to-CV node maintains N voice slots, each with its own `ConstantSource` nodes:

```javascript
const voices = Array(8).fill(null).map(() => ({
  pitch: ctx.createConstantSource(),     // V/oct
  velocity: ctx.createConstantSource(),  // 0-1
  pressure: ctx.createConstantSource(),  // 0-1 (MPE)
  slide: ctx.createConstantSource(),     // 0-1 (MPE CC74)
}));

// Start all sources (they output constant values, updated on MIDI events)
voices.forEach(v => {
  Object.values(v).forEach(source => source.start());
});
```

On MIDI note-on:

```javascript
function noteOn(voiceIndex, note, velocity, time) {
  const v = voices[voiceIndex];
  v.pitch.offset.setValueAtTime(note / 12, time);  // MIDI note to V/oct
  v.velocity.offset.setValueAtTime(velocity / 127, time);

  // Dispatch gate event to connected nodes
  dispatchEvent({ voice: voiceIndex, type: 'on', time, velocity: velocity / 127 });
}
```

On MIDI note-off:

```javascript
function noteOff(voiceIndex, time) {
  dispatchEvent({ voice: voiceIndex, type: 'off', time });
}
```

### Oscillator Implementation (AudioWorklet)

Oscillators that accept V/oct pitch CV input must use AudioWorklet. Native `OscillatorNode.frequency` expects Hz, but the V/oct → Hz conversion is exponential (`hz = C0 * 2^vOct`), which cannot be done with native Web Audio node math (which is linear/additive).

**AudioWorklet oscillator benefits:**

- Accepts V/oct pitch input directly, converts to Hz internally
- Audio-rate pitch modulation (FM, vibrato) works correctly
- More control over waveform generation (custom waveforms, wavetables)
- Poly-aware from the start (N voices = N channels in worklet)

```javascript
// In AudioWorklet processor
process(inputs, outputs, parameters) {
  const pitchInput = inputs[0];  // V/oct from pitch CV input
  const output = outputs[0];

  for (let voice = 0; voice < this.voiceCount; voice++) {
    const pitchChannel = pitchInput[voice] || pitchInput[0];  // Fan-out if mono
    const outputChannel = output[voice];

    for (let i = 0; i < outputChannel.length; i++) {
      // V/oct to Hz conversion per sample
      const vOct = pitchChannel?.[i] ?? this.baseVOct;
      const hz = 16.35159783 * Math.pow(2, vOct);  // C0 = 16.35 Hz

      // Phase increment
      this.phases[voice] += hz / sampleRate;
      this.phases[voice] %= 1;

      // Generate waveform
      outputChannel[i] = this.generateSample(this.phases[voice], this.waveform);
    }
  }
  return true;
}
```

**V/oct reference:**

- 0V = C0 ≈ 16.35 Hz
- MIDI note to V/oct: `midiNote / 12`
- Transposition: +1V = up one octave, +7/12 V = up a fifth

### Envelope Implementation

Envelopes receive gate events via event dispatch and schedule automation using Web Audio:

```javascript
class PolyEnvelope {
  constructor(ctx, channelCount) {
    this.outputs = Array(channelCount).fill(null).map(() => {
      const src = ctx.createConstantSource();
      src.offset.value = 0;
      src.start();
      return src;
    });
    this.activeVoices = new Set();
  }

  handleEvent(event) {
    const output = this.outputs[event.voice];
    if (!output) return;

    if (event.type === 'on') {
      this.activeVoices.add(event.voice);
      output.offset.cancelScheduledValues(event.time);
      output.offset.setValueAtTime(0, event.time);
      output.offset.linearRampToValueAtTime(1, event.time + this.attack);
      // Dispatch gate-on to indicate envelope is active
      this.dispatchGate({ voice: event.voice, type: 'on', time: event.time });
    }

    if (event.type === 'off') {
      output.offset.cancelScheduledValues(event.time);
      output.offset.setTargetAtTime(0, event.time, this.release / 4);
      // Schedule gate-off when envelope completes
      const releaseComplete = event.time + this.release;
      setTimeout(() => {
        this.activeVoices.delete(event.voice);
        this.dispatchGate({ voice: event.voice, type: 'off', time: releaseComplete });
      }, (releaseComplete - ctx.currentTime) * 1000);
    }
  }
}
```

The event carries the timestamp from MIDI input, so the envelope responds sample-accurately via Web Audio's scheduler.

### Graph Model Mapping

The UI graph and Web Audio graph mirror each other:

| UI Concept | Web Audio Equivalent |
|------------|---------------------|
| Node | One or more AudioNodes (N instances for poly) |
| Cable (audio/cv/pitch) | N parallel AudioNode connections (one per channel) |
| Cable (gate/trigger) | Event subscription via graph edge |
| Implicit sum | Multiple connections to same AudioParam/AudioNode |
| Voice group | N instances of a subgraph |

### When to Escape to AudioWorklet

Native Web Audio nodes cover most cases. Use AudioWorklet + WASM when:

- **Sample-by-sample logic:** Wavefolder, waveshaper with custom curves, ring mod
- **Stateful DSP:** Lookahead limiter, compressor with specific characteristics
- **Non-standard algorithms:** Karplus-Strong, granular, spectral processing
- **V/oct to Hz conversion:** For oscillators that need pitch CV input

The hybrid approach (native nodes + AudioWorklet where needed) is the right tradeoff for now.

## Decisions

1. **Channel count mismatch:** Higher channel count into lower drops excess channels. No UI indicator for now.

2. **Pitch representation:** V/oct, following Eurorack convention (0V = C0 ≈ 16.35 Hz).

   **Rationale:** Web Audio param connections are additive. With V/oct:
   - Transposition is addition (up octave = +1V, up fifth = +7/12 V)
   - LFO/envelope modulation depth is constant across pitch range
   - Hz requires multiplication, which doesn't map to AudioParam connections

   **Conversion:** Oscillator nodes convert V/oct → Hz internally.

   **MIDI note to V/oct:** `midiNote / 12` (since MIDI note 0 = C0, and 12 semitones = 1V).

3. **Voice stealing:** FIFO (oldest voice first) as default.

   **Behavior:** When all voices are active and a new note arrives, the voice that started earliest gets stolen. The stolen voice's gate goes low (triggering release), then immediately reassigned to the new note.

4. **Spatial audio:** No hardcoded stereo or L/R panning concept.

   **Rationale:** Baking in "stereo = 2 channels with L/R semantics" limits future expansion to surround, ambisonics, binaural/HRTF, or object-based audio.

   **Approach:**
   - Audio channels are just channels, no special stereo type
   - Spatialization is handled by dedicated spatial nodes at the end of the chain
   - Spatial format (stereo, binaural, ambi, etc.) is a property of the spatial node, not the cable
   - For now: mono everywhere, panner/spatial nodes output N channels as needed

   **Poly + spatial:** Kept separate. Poly = N voices. Spatial = M output channels. A poly panner takes N mono voices, outputs N×M channels (or sums voices into one spatial output, depending on design).

5. **CV-audio compatibility:** No type enforcement between audio, cv, and pitch kinds.

   **Rationale:** Audio and CV are both continuous signals at audio rate. Patching an LFO to audio output = you hear a low rumble. Patching an oscillator to a filter cutoff = FM-style modulation. Both are valid.

6. **Gate/trigger compatibility:** Gate and trigger ports are interchangeable.

   **Rationale:** A trigger can be treated as an instantaneous gate-on. A gate-on can be treated as a trigger. Users may connect either to either.

7. **Event routing:** Events (gate/trigger) travel through cables via BFS graph traversal, same as MIDI.

   **Rationale:** Consistent with existing MIDI routing. Cables represent subscriptions. No separate invisible pub/sub system.

8. **MIDI routing:** Unchanged. The `midi` port kind continues to use existing MIDI dispatch. MIDI-to-CV node bridges MIDI to the CV/gate world.

9. **Channel count:** Per-port runtime value, not per-node or fixed at compile time. Different ports on the same node can have different channel counts. Dynamic allocation is future work.

10. **Oscillator implementation:** AudioWorklet-based. Native `OscillatorNode` cannot accept V/oct pitch CV (the exponential conversion requires sample-by-sample processing). AudioWorklet also enables custom waveforms and poly-aware processing.

## References

- VCV Rack polyphonic cables: <https://vcvrack.com/manual/Polyphony>
- MPE specification: <https://www.midi.org/midi-articles/midi-polyphonic-expression-mpe>
