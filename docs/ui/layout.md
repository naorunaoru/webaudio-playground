# Layout System

Grid-based layout for node UI controls.

## Grid Configuration

Components align to a grid for predictable, consistent layouts.

```typescript
interface GridConfig {
  columns: number;        // how many units wide the node panel is
  unitSize?: number;      // pixel size of one grid unit
  gap?: number;           // spacing between units
}
```

## NodePanel

Container with grid layout:

```typescript
interface NodePanelProps {
  columns: number;
  theme: ControlTheme;
  unitSize?: number;
  gap?: number;
  children: ReactNode;
}
```

## Example Layout

```jsx
<NodePanel columns={3} theme={oscillatorTheme}>
  <Group label="Waveform">
    <DiscreteKnob options={waveforms} {...props} />
  </Group>

  <Separator label="Pitch" />

  <Knob label="Freq" {...props} />
  <Knob label="Fine" {...props} />
  <Knob label="Detune" {...props} />

  <Separator />

  <Group label="Output">
    <Slider orientation="vertical" span={2} label="Level" {...props} />
    <Toggle label="Mute" {...props} />
  </Group>
</NodePanel>
```

## Component Sizes

Each component has a default size in grid units:

| Component | Width | Height | Notes |
|-----------|-------|--------|-------|
| Knob | 1 | 1 | Fixed |
| DiscreteKnob | 1 | 1 | Fixed |
| Slider (V) | 1 | 2 | Height via `span` |
| Slider (H) | 2 | 1 | Width via `span` |
| NumericInput | 1-2 | 1 | TBD empirically |
| Toggle | 1 | 1 | Fixed |
| RadioGroup (H) | options.length | 1 | Sized by options |
| RadioGroup (V) | 1 | options.length | Sized by options |
| Button | 1 | 1 | Fixed |
| Separator | full | auto | Always spans full width |

## Group Behavior

Groups provide visual containment without affecting grid math. The border/background extends slightly outside the child cells visually but doesn't consume grid units:

```
┌───────────────────────┐
│ Group Label           │
│ ┌─────┬─────┬─────┐  │
│ │Knob │Knob │Knob │  │  ← 3 grid units of content
│ └─────┴─────┴─────┘  │
└───────────────────────┘
    └── 3 units total ──┘
```

This keeps layout math simple — a Group containing 3 single-unit controls still occupies 3 columns.

## Integration with Graph Components

Graph-based components (EnvelopeEditor, SamplePlayer, etc.) need more space than standard controls:

1. **Span full width**: Use the full width of the node content area
2. **Separate section**: Avoid mixing with knobs/sliders on the same row
3. **Explicit dimensions**: Specify width/height that works within the node layout

See [theme-system.md](./theme-system.md) for integration examples.
