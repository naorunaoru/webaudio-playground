# Future Considerations

## Detail Panel

Expanded control view for complex node editing:

- Same components, potentially larger sizes
- More controls visible than in compact node view
- Opens in separate panel/modal

---

## Polyphony & MPE

Ideas for polyphonic voice visualization, to be revisited after basic controls and audio graph polyphony are working.

### Architecture Concept

The node graph would support "voice groups" — subgraphs that are automatically cloned per voice:

- User designs a subgraph once (e.g., oscillator → filter → envelope)
- Wrapping it in a voice group creates N instances at runtime
- UI shows a single subgraph, but audio runs N copies
- Voice allocation handles note assignment (similar to PD's `clone` / Max's `poly~`)

### Per-Voice vs Global Parameters

Controls need to distinguish between:

| Parameter type | Example | UI behavior |
|----------------|---------|-------------|
| Global | Filter base cutoff, oscillator mix | Single value, normal control |
| Per-voice (MPE) | Pitch bend, pressure, slide (CC74) | Multiple simultaneous values |
| Per-voice (internal) | Envelope position, LFO phase | Multiple simultaneous values |

Most controls remain single-value. Only parameters connected to per-voice modulation sources need multi-value display.

### Multi-Value Display Options

When a control receives multiple voice values:

1. **Primary + ghosts**: Show most recent/loudest voice as main indicator, others as faded secondary indicators
2. **Aggregate range**: Show min/max range across voices as a highlighted zone
3. **Average**: Show single averaged value (loses detail but stays clean)
4. **Animation**: Values animate/pulse to show activity without persistent visual clutter

### Interaction Model

When user interacts with a multi-voice control:

- Editing affects the **base/global value**
- Per-voice values are offsets/modulations from that base
- No direct editing of individual voice values (that comes from MPE input)

### Extended Props for Voice-Aware Controls

```typescript
// Extension to base control props for polyphonic rendering
interface VoiceAwareProps {
  values?: number[];              // Multiple values (one per active voice)
  voiceColors?: string[];         // Optional per-voice colors
  multiValueDisplay?: 'ghosts' | 'range' | 'average';
}

// For waveform/envelope displays
interface PlayheadProps {
  playheadPositions?: number[];   // multiple playheads for polyphony
  playheadColors?: string[];
}
```

### Reference Implementations

MPE-native software to study for UI patterns:

- **Equator2** (Roli) — most mature MPE UI
- **Cypher2 / Strobe2** (FXpansion) — MPE-first design
- **Surge** (open source) — accessible codebase to inspect

### Implementation Approach

1. Build single-value controls first
2. Implement basic polyphony in audio graph
3. Test with real MPE controller (Roli Songmaker Kit)
4. Revisit UI components to add optional multi-voice rendering based on real use cases

Don't over-design the multi-voice UI in isolation — let real use cases inform the specifics.
