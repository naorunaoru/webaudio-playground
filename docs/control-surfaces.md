# Control Surfaces

Control surfaces are floating UI panels for MIDI interaction with the currently selected node, without explicit graph connections.

## Motivation

Sometimes you want to quickly trigger notes on a node without wiring up a dedicated MIDI Source. Control surfaces provide immediate, selection-based interaction.

## Behavior

### Targeting

- Events are sent to the currently selected node
- If no node is selected, events are discarded
- If a connection (not a node) is selected, events are discarded
- Changing selection mid-gesture redirects subsequent events to the new target

### Bidirectional Data Flow

Control surfaces are **not** implicit MIDI connections. They are observers and emitters:

- **Outbound**: User interaction (e.g., pressing a key) emits MIDI events to the target node
- **Inbound**: The surface observes the target node's active MIDI state and reflects it visually

This means if a node is already receiving MIDI from a connected source, the control surface shows which notes are currently held.

### Event Handling

- Outbound events are delivered directly to the target node's `onMidi` handler
- If the node has no `onMidi` handler, events are ignored
- Events blend with any existing MIDI connections (they don't override)

### Node MIDI State

Nodes that handle MIDI need to expose their active note state for observation. This could be:

- A `activeNotes: Set<number>` in runtime state
- Or derived from existing state (e.g., oscillator's `lastMidiNote` when gate is open)

### Positioning

- Fixed to viewport (does not pan with the canvas)
- Draggable within the viewport
- Resizable

## Initial Implementation: Piano Keyboard

The first control surface is a piano keyboard for sending note events.

### Features

- Sends `noteOn` on key press, `noteOff` on release
- Configurable octave range
- Velocity sensitivity (optional)

### Future Extensions

- CC fader banks
- Drum pads
- XY pad for pitch bend / modulation
- Adaptive surfaces that reflect the target node's controllable parameters

## Implementation Plan

### Phase 1: Expose selection and MIDI infrastructure

**Selection context**
- Create `SelectionContext` to expose current selection outside `GraphEditor`
- Or extend `GraphDocContext` with selection state

**MIDI dispatch access**
- Lift `emitMidi` from `GraphEditor` internals to a shared context/hook
- Allow external components to emit MIDI to arbitrary nodes

**Node MIDI state**
- Define how nodes expose active notes (runtime state or derived)
- Ensure oscillator/envelope track `activeNotes` for observation

### Phase 2: Floating panel infrastructure

**`<FloatingPanel>` component**
- Portal-based rendering to `document.body`
- Viewport-fixed positioning (`position: fixed`)
- Drag-to-move via header
- Resize via corner/edge handles
- Z-index management for multiple panels

### Phase 3: Piano keyboard

**`<PianoKeyboard>` component**
- Standard piano key layout (white/black keys)
- Octave range selector
- Pointer events for noteOn/noteOff
- Visual feedback for pressed keys (both local and observed)

**Integration**
- Wrap in `<FloatingPanel>`
- Connect to selection context for target node
- Connect to MIDI dispatch for outbound events
- Subscribe to target node's active notes for inbound display
