# UI Component Library

Documentation for the React component library powering the audio playground interface.

## Overview

This library provides two categories of components:

1. **Controls** — Knobs, sliders, buttons, and other interactive elements for audio parameters
2. **Graph Components** — Visualizations like envelope editors, waveforms, and spectrum analyzers

All components share a unified theme system and design language optimized for dense node-based UIs.

## Documentation

| Document | Description |
|----------|-------------|
| [roadmap.md](./roadmap.md) | Implementation checklist with status |
| [theme-system.md](./theme-system.md) | Chrome colors, accent themes, ThemeProvider |
| [controls.md](./controls.md) | Knob, Slider, NumericInput, Toggle, RadioGroup, Button |
| [types.md](./types.md) | Shared type definitions |
| [hooks.md](./hooks.md) | Shared behavior hooks |
| [layout.md](./layout.md) | Grid system and NodePanel |
| [style-guide.md](./style-guide.md) | Visual design guidelines |
| [primitives.md](./primitives.md) | Grid, Curve, Waveform, Spectrum, Playhead |
| [interactions.md](./interactions.md) | PointEditor, CurveHandle, RegionSelector, ZoomPan |
| [editor.md](./editor.md) | Editor-level metaphors (selection, menus, inspector, patch UX) |
| [composed-components.md](./composed-components.md) | EnvelopeEditor, SamplePlayer, ParametricEQ |
| [time-base.md](./time-base.md) | Musical vs absolute time |
| [utilities.md](./utilities.md) | Interpolation, downsampling, performance |
| [future.md](./future.md) | Polyphony, MPE, detail panels |

## Design Principles

### Layered Composition

Components are built from composable primitives:

```
Composed Component
├── Grid (coordinate system)
├── Visualization Layer (curves, waveforms, spectrum)
├── Interaction Layer (point editing, region selection)
└── Overlay Layer (playhead, markers)
```

### Declarative Configuration

Components are configured through declarative data structures rather than imperative APIs.

### Separation of Concerns

- **Grid**: Coordinate mapping and visual scaffolding
- **Visualization**: Renders data in the coordinate space
- **Interaction**: Handles user input and editing
- **Animation**: Manages time-based updates

## File Structure

```
src/ui/
├── components/
│   ├── Knob.tsx
│   ├── NumericInput.tsx
│   ├── RadioGroup.tsx
│   ├── Label.tsx
│   ├── Tooltip.tsx
│   ├── EnvelopeEditor.tsx
│   └── ... (planned components)
│
├── hooks/
│   ├── useDragValue.ts
│   └── ... (planned hooks)
│
├── context/
│   └── theme.ts
│
├── types/
│   └── index.ts
│
└── icons/
    └── ...
```

## Open Questions

1. **Undo/redo**: External (handled by GraphDocContext with Automerge)
2. **Multi-select**: Yes, for efficiency in complex envelopes
3. **Copy/paste**: Yes, via clipboard API

## Performance Targets

- Curve rendering: < 16ms for up to 100 points
- Waveform rendering: < 16ms for visible viewport
- Spectrum updates: 60fps for real-time analysis
- Interaction latency: < 100ms for point drag
