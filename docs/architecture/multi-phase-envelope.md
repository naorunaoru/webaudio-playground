# Multi-Phase Envelope Implementation Plan

Refactoring the Envelope node to support arbitrary phase sequences instead of fixed ADSR.

## Overview

The current Envelope node is hardcoded to ADSR (Attack → Decay → Sustain → Release). This limits flexibility for:

- OPL/YM2612-style envelopes (Attack → Decay1 → Decay2 → Release, no sustain hold)
- Complex multi-stage envelopes for pads/ambient sounds
- Percussive envelopes with multiple attack stages

The goal is to replace the fixed ADSR model with a configurable array of phases, where each phase has:

- **Target level** (0-1)
- **Duration** (ms)
- **Curve shape** (-1 to 1)
- **Hold flag** (if true, wait for gate-off before proceeding)

## Data Model

### Current (ADSR)

```typescript
type EnvelopeEnv = {
  attackMs: number;
  decayMs: number;
  sustain: number; // 0..1
  releaseMs: number;
  attackShape: number;
  decayShape: number;
  releaseShape: number;
  retrigger: boolean;
};
```

### Proposed (Multi-Phase)

```typescript
type EnvelopePhase = {
  id: string;           // Unique ID for React keys and selection
  targetLevel: number;  // 0-1, level to reach at end of this phase
  durationMs: number;   // Time to reach target level
  shape: number;        // -1 to 1, curve shape
  hold: boolean;        // If true, hold at targetLevel until gate-off
};

type EnvelopeState = {
  phases: EnvelopePhase[];
  retrigger: boolean;
};
```

### Envelope Behavior

1. **Gate On**: Start from phase 0, progress through phases sequentially
2. **Phase Completion**: When a phase completes:
   - If `hold: true`, stay at `targetLevel` until gate-off
   - If `hold: false`, immediately proceed to next phase
3. **Gate Off**: Jump to the first phase after the last `hold: true` phase (the "release" portion)
   - If no phase has `hold: true`, gate-off has no effect (envelope runs to completion)
   - Release starts from current level, not from the phase's start level
4. **End of Phases**: Envelope goes idle (level = 0)
5. **Hold on Last Phase**: The `hold` flag on the final phase is ignored — once the last phase completes, the envelope always goes idle. This prevents envelopes from holding indefinitely with no release path.

**Force Release**: Voice stealing triggers a fast fade (5ms linear ramp to 0) regardless of current phase. This is separate from normal gate-off behavior and must be preserved.

### ADSR as Multi-Phase

Standard ADSR maps to:

```typescript
phases: [
  { id: "a", targetLevel: 1.0, durationMs: 10,  shape: 0.6, hold: false },  // Attack
  { id: "d", targetLevel: 0.6, durationMs: 120, shape: 0.6, hold: true },   // Decay → Sustain
  { id: "r", targetLevel: 0.0, durationMs: 120, shape: 0.6, hold: false },  // Release
]
```

Note: Sustain level is the `targetLevel` of the decay phase. The `hold: true` makes it wait at that level.

### OPL-Style as Multi-Phase

YM2612/OPL envelope (no sustain hold):

```typescript
phases: [
  { id: "a",  targetLevel: 1.0, durationMs: 10,   shape: 0,   hold: false },  // Attack
  { id: "d1", targetLevel: 0.5, durationMs: 100,  shape: 0.6, hold: false },  // Decay1
  { id: "d2", targetLevel: 0.0, durationMs: 2000, shape: 0.6, hold: false },  // Decay2 (continues during key hold)
  { id: "r",  targetLevel: 0.0, durationMs: 50,   shape: 0.6, hold: false },  // Release
]
```

With no `hold: true`, the envelope continuously decays even while the key is held. Gate-off jumps to the release phase (index 3).

**Release phase detection**: The release portion starts at the first phase after the last `hold: true` phase. If no phase has `hold: true`, release starts at the last phase.

---

## Implementation Phases

### Phase 1: Update Type Definitions

**Files to modify:**

- `src/nodes/envelope/types.ts`

**Implementation:**

```typescript
export type EnvelopePhase = {
  id: string;
  targetLevel: number;
  durationMs: number;
  shape: number;
  hold: boolean;
};

export type EnvelopeState = {
  phases: EnvelopePhase[];
  retrigger: boolean;
};

// Remove EnvelopeEnv type (replaced by EnvelopeState)
```

**Tasks:**

- [ ] Define EnvelopePhase type
- [ ] Update EnvelopeState to use phases array + retrigger
- [ ] Remove EnvelopeEnv type
- [ ] Update normalizeState to return default phases if invalid

---

### Phase 2: Update Processor (AudioWorklet)

**Files to modify:**

- `src/nodes/envelope/processor.ts`

**Key changes:**

1. Replace hardcoded phase enum with index-based progression
2. Track current phase index per voice
3. Compute release start index from phases array
4. Handle `hold` flag to pause progression

**Voice state:**

```typescript
type VoiceState = {
  phaseIndex: number;        // Current phase (0 to N-1), or -1 for idle
  level: number;             // Current output level
  phaseStartSample: number;  // Sample when current phase started
  phaseDurationSamples: number;
  startLevel: number;        // Level at start of current phase
  targetLevel: number;       // Level at end of current phase
  shape: number;
  isHolding: boolean;        // True if waiting for gate-off at a hold phase
  releasePhaseIndex: number; // Cached: first phase after last hold
};
```

**Message protocol update:**

```typescript
type EnvelopeMessage =
  | { type: "params"; phases: EnvelopePhase[]; retrigger: boolean }
  | { type: "gate"; voice: number; state: "on" | "off" }
  | { type: "forceRelease"; voice: number }  // Fast 5ms fade for voice stealing
  | { type: "releaseAll" };                  // Fast fade all voices (on disconnect)
```

**Tasks:**

- [ ] Update EnvelopeParams type to use phases array
- [ ] Update VoiceState to track phaseIndex instead of phase enum
- [ ] Compute releasePhaseIndex when params change
- [ ] Update handleGate for gate-on: start at phase 0
- [ ] Update handleGate for gate-off: jump to releasePhaseIndex
- [ ] Update advanceVoice to handle hold flag (pause at phase end if hold=true)
- [ ] Update advanceVoice to progress through phases by index
- [ ] Handle edge case: empty phases array (output silence)
- [ ] Handle edge case: all phases have hold=false (gate-off jumps to last phase)
- [ ] Handle edge case: hold=true on last phase (ignore hold, go idle after completion)
- [ ] Preserve forceRelease handling (5ms linear fade for voice stealing)
- [ ] Preserve releaseAll handling (fast fade on disconnect)

---

### Phase 3: Update Audio Runtime

**Files to modify:**

- `src/nodes/envelope/audio.ts`

**Key changes:**

1. Update state shape sent to worklet
2. Update runtime state type for UI visualization

**Runtime state for visualization:**

```typescript
export type VoiceRuntimeState = {
  voiceIndex: number;
  phaseIndex: number;      // -1 = idle
  phaseProgress: number;   // 0-1 within current phase
  currentLevel: number;
};

export type EnvelopeRuntimeState = {
  voices: VoiceRuntimeState[];
};
```

**Tasks:**

- [ ] Update worklet message to send phases array
- [ ] Update EnvelopeRuntimeState type
- [ ] Add worklet message listener to update runtime state

---

### Phase 4: Update EnvelopeEditor Component

**Files to modify:**

- `src/ui/components/EnvelopeEditor/`
  - `EnvelopeEditor.tsx`
  - `types.ts`
  - `geometry.ts`
  - `drawing.ts`
  - `handles.ts`
  - `index.ts`

The existing `EnvelopeEditor` will be updated in-place to support multi-phase envelopes. This maintains the public API export while extending functionality.

**UI Design:**

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│     ╱╲                                                 │
│    ╱  ╲___[H]                                          │  <- [H] = hold indicator on segment
│   ╱       ╲                                            │
│  ╱         ╲___                                        │
│ ○           ○   ╲                                      │
│              [H] ○                                     │
│                                                        │
└────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────┐
│ [+]  Phase 2 of 4                              [−]     │
├────────────────────────────────────────────────────────┤
│  Level ●────────○ 0.70    Time ●────────○ 120 ms      │
│  Curve ●────────○ 0.60    [✓] Hold                    │
└────────────────────────────────────────────────────────┘
```

**Interactions:**

- Click handle to select phase
- Drag handle horizontally to adjust duration
- Drag handle vertically to adjust target level
- Click segment to select phase, drag vertically to adjust curve shape
- `[+]` button adds phase after selected (or at end)
- `[−]` button removes selected phase (minimum 1 phase)
- Hold checkbox toggles hold flag for selected phase

**Coordinate system:**

- X axis: cumulative time (sum of all durations)
- Y axis: level (0-1)
- Handle N is at (sum of durations 0..N, targetLevel of phase N)
- First point is always at (0, 0) — implicit start

**Drawing:**

- Draw segments between consecutive handles
- Each segment uses its phase's shape for curve interpolation
- Hold phases get a visual indicator (icon or color)
- Selected phase/handle highlighted

**Tasks:**

- [ ] Update types.ts: change `EnvelopeEditorProps` to accept `phases[]` instead of `EnvelopeEnv`
- [ ] Update geometry.ts: variable handle count, cumulative duration calculation
- [ ] Update drawing.ts: render N segments, hold indicators on phases
- [ ] Update handles.ts: drag logic for dynamic phase indices
- [ ] Update EnvelopeEditor.tsx: phase selection, add/remove controls
- [ ] Implement phase selection state (click handle to select)
- [ ] Implement add/remove phase controls ([+]/[−] buttons)
- [ ] Implement hold toggle for selected phase

---

### Phase 5: Update Envelope Node Graph/UI

**Files to modify:**

- `src/nodes/envelope/graph.tsx`

**Key changes:**

1. Update EnvelopeEditor props to pass phases array
2. Update state management for phases array
3. Simplify UI (most controls move into the editor component)

**Tasks:**

- [ ] Update defaultState to use phases array (default ADSR equivalent)
- [ ] Update EnvelopeEditor props to pass phases instead of env
- [ ] Keep retrigger toggle outside editor
- [ ] Update normalizeState to migrate legacy ADSR format
- [ ] Remove individual A/D/S/R NumericInputs (now in editor)

---

### Phase 6: Update Envelope Utilities

**Files to modify:**

- `src/utils/envelope.ts`

**Key changes:**

1. Update `phaseToMs` to work with phase indices
2. Add utility to compute release phase index
3. Add utility to compute total envelope duration

**Tasks:**

- [ ] Update or create `phaseIndexToMs(phaseIndex, progress, phases)`
- [ ] Create `computeReleasePhaseIndex(phases)` utility
- [ ] Create `computeTotalDuration(phases)` utility
- [ ] Update `shapedT` if needed (should already be generic)

---

### Phase 7: Cleanup Legacy Code

**Tasks:**

- [ ] Remove `EnvelopeEnv` type from `src/nodes/envelope/types.ts`
- [ ] Remove old `EnvelopePhase` string union from `src/utils/envelope.ts`
- [ ] Remove ADSR-specific utilities (`getPhaseAtTime`, `phaseToMs`) or replace with multi-phase versions

---

## Testing Plan

### Unit Tests

- [ ] Processor: single phase envelope (just attack)
- [ ] Processor: two phase envelope (attack + release)
- [ ] Processor: hold phase pauses until gate-off
- [ ] Processor: gate-off jumps to correct release phase
- [ ] Processor: no hold phases means gate-off jumps to last phase
- [ ] Processor: retrigger resets to phase 0
- [ ] Processor: retrigger=false continues from current level
- [ ] Migration: ADSR format converts correctly

### Manual Tests

- [ ] Default envelope sounds like old ADSR
- [ ] Add/remove phases in UI works
- [ ] Drag handles to adjust level and duration
- [ ] Drag segments to adjust curve shape
- [ ] Hold toggle affects envelope behavior
- [ ] Playhead visualization shows correct position
- [ ] Multi-voice playheads render correctly
- [ ] OPL-style envelope (no hold) decays continuously

---

## Migration Strategy

No backwards compatibility needed — this is a breaking change. The `normalizeState` function will:

1. Check if state has `phases` array → use as-is
2. Otherwise → return default state (ADSR-equivalent phases)

Existing saved projects with old ADSR format will reset to defaults.

---

## Future Enhancements

Not in scope for this implementation, but possible future work:

- **Looping**: Allow phases to loop (e.g., for LFO-like behavior)
- **Per-phase velocity sensitivity**: Scale duration or level by velocity
- **Presets**: Save/load common envelope shapes (ADSR, OPL, etc.)
- **Visual envelope library**: Browse and select from preset shapes
- **Bezier curves**: More complex curve shapes beyond single shape parameter

---

## Dependencies

```
Phase 1 (Types) ──────┬──→ Phase 2 (Processor)
                      │
                      ├──→ Phase 3 (Audio Runtime)
                      │
                      └──→ Phase 5 (Graph/UI) ──→ Phase 7 (Cleanup)
                                │
Phase 4 (Editor Update) ────────┘

Phase 6 (Utilities) ←── Phase 2, Phase 4
```

Phases 1-3 can be developed together (backend changes).
Phase 4 can be developed in parallel (update existing EnvelopeEditor).
Phase 5 integrates them.
Phase 6 supports both.
Phase 7 is cleanup after everything works.

---

## Current Status

- [x] Phase 1: Type Definitions
- [x] Phase 2: Processor
- [x] Phase 3: Audio Runtime
- [x] Phase 4: EnvelopeEditor Update
- [x] Phase 5: Envelope Node Graph/UI
- [x] Phase 6: Envelope Utilities
- [x] Phase 7: Cleanup (legacy ADSR types removed)
