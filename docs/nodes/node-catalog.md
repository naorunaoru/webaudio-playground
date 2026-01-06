# Node Catalog

Reference for all implemented nodes.

## Source Nodes

### midiSource

MIDI note trigger with configurable note, velocity, and channel.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `note` | number | 0-127 | 60 (C4) |
| `velocity` | number | 0-127 | 100 |
| `channel` | number | 1-16 | 1 |

**Ports:**
- `midi_out` (midi, out) — Note events

**Audio:** None (graph-only)

---

### ccSource

Control Change message source.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `controller` | number | 0-127 | 1 |
| `value` | number | 0-127 | 64 |
| `channel` | number | 1-16 | 1 |

**Ports:**
- `cc_out` (cc, out) — CC events

**Audio:** None (graph-only)

---

## Sound Generators

### oscillator

Audio oscillator with waveform selection or noise source.

| Property | Type | Values | Default |
|----------|------|--------|---------|
| `source` | string | `"wave"`, `"noise"` | `"wave"` |
| `waveform` | OscillatorType | `"sine"`, `"triangle"`, `"square"`, `"sawtooth"` | `"sawtooth"` |

**Ports:**
- `midi_in` (midi, in) — Note pitch control
- `audio_out` (audio, out) — Audio signal

**Audio:** OscillatorNode or BufferSourceNode (noise)

---

### samplePlayer

Sample playback with pitch following and polyphonic voice management.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `sampleId` | string \| null | — | `null` |
| `sampleName` | string \| null | — | `null` |
| `gain` | number | 0-2 | 1 |
| `followPitch` | boolean | — | `true` |
| `rootNote` | number | 0-127 | 60 |
| `stopOnNoteOff` | boolean | — | `true` |

**Ports:**
- `midi_in` (midi, in) — Trigger playback
- `audio_out` (audio, out) — Audio signal

**Audio:** Multiple BufferSourceNodes (max 32 voices)

---

## Modulators

### envelope

ADSR envelope generator with shaped curves.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `env.attackMs` | number | 0-10000 | 10 |
| `env.decayMs` | number | 0-10000 | 100 |
| `env.sustain` | number | 0-1 | 0.7 |
| `env.releaseMs` | number | 0-10000 | 200 |
| `env.attackShape` | number | -1 to 1 | 0 |
| `env.decayShape` | number | -1 to 1 | 0 |
| `env.releaseShape` | number | -1 to 1 | 0 |
| `lastMidiNote` | number \| null | — | `null` |
| `lastMidiAtMs` | number \| null | — | `null` |
| `lastMidiOffAtMs` | number \| null | — | `null` |

**Ports:**
- `midi_in` (midi, in) — Trigger envelope
- `cv_out` (automation, out) — Envelope CV signal

**Audio:** ConstantSourceNode + GainNode with scheduled curves

**Runtime State:** `{ phase: "idle" | "attack" | "decay" | "sustain" | "release" }`

---

## Processors

### gain

VCA (Voltage Controlled Amplifier) with CV input.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `depth` | number | 0-2 | 1 |

**Ports:**
- `audio_in` (audio, in) — Audio input
- `cv_in` (automation, in) — Gain CV modulation
- `audio_out` (audio, out) — Audio output

**Audio:** GainNode

---

### filter

Biquad filter with envelope modulation input.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `type` | string | `"lowpass"`, `"highpass"` | `"lowpass"` |
| `frequencyHz` | number | 20-20000 | 1000 |
| `q` | number | 0.0001-30 | 1 |
| `envAmountHz` | number | 0-20000 | 0 |

**Ports:**
- `audio_in` (audio, in) — Audio input
- `cv_freq` (automation, in) — Frequency CV modulation
- `audio_out` (audio, out) — Audio output

**Audio:** BiquadFilterNode

---

## Effects

### delay

Delay effect with feedback.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `delayMs` | number | 0-5000 | 250 |
| `feedback` | number | 0-0.98 | 0.3 |
| `mix` | number | 0-1 | 0.5 |

**Ports:**
- `audio_in` (audio, in) — Audio input
- `audio_out` (audio, out) — Audio output

**Audio:** DelayNode + feedback GainNode + wet/dry mixing

---

### reverb

Convolution reverb with procedural impulse response.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `seconds` | number | 0.1-10 | 2 |
| `decay` | number | 0.1-20 | 4 |
| `preDelayMs` | number | 0-1000 | 0 |
| `mix` | number | 0-1 | 0.3 |
| `reverse` | boolean | — | `false` |

**Ports:**
- `audio_in` (audio, in) — Audio input
- `audio_out` (audio, out) — Audio output

**Audio:** ConvolverNode with generated impulse response

---

### limiter

Dynamic range limiter using AudioWorklet + WASM.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `ceilingDb` | number | -60 to 0 | -0.3 |
| `releaseMs` | number | 1-5000 | 100 |
| `makeupDb` | number | -24 to 24 | 0 |
| `bypass` | boolean | — | `false` |
| `stereoLink` | boolean | — | `true` |
| `channelCount` | number | 1, 2 | 2 |
| `lookaheadMs` | number | — | 0 (reserved) |

**Ports:**
- `audio_in` (audio, in) — Audio input
- `audio_out` (audio, out) — Audio output

**Audio:** AudioWorkletNode with WASM processor

---

## Output

### audioOut

Master output connecting to system audio.

| Property | Type | Range | Default |
|----------|------|-------|---------|
| `volume` | number | 0-1 | 0.8 |

**Ports:**
- `audio_in` (audio, in) — Audio input

**Audio:** GainNode → `services.masterInput`

---

## Node Summary Table

| Node | Category | Audio | MIDI | CC | Automation |
|------|----------|-------|------|-----|------------|
| midiSource | Source | — | out | — | — |
| ccSource | Source | — | — | out | — |
| oscillator | Generator | out | in | — | — |
| samplePlayer | Generator | out | in | — | — |
| envelope | Modulator | — | in | — | out |
| gain | Processor | in/out | — | — | in |
| filter | Processor | in/out | — | — | in |
| delay | Effect | in/out | — | — | — |
| reverb | Effect | in/out | — | — | — |
| limiter | Effect | in/out | — | — | — |
| audioOut | Output | in | — | — | — |
