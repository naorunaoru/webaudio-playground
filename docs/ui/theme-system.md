# Theme System Integration

Graph-based components use the same theme system as the audio UI controls, which separates neutral "chrome" colors from accent "control theme" colors.

## Chrome Colors (Neutral)

Shared across all components, these provide consistent base styling:

```typescript
/**
 * Neutral "chrome" colors shared across all controls.
 * These don't change with the accent theme.
 */
interface ChromeColors {
  /** Track/groove background (e.g., knob arc track, slider track) */
  track: string;
  /** Control body fill (e.g., knob center, button background) */
  surface: string;
  /** Control body stroke/border */
  border: string;
  /** Primary text color */
  text: string;
  /** Secondary/muted text color (labels, placeholders) */
  textMuted: string;
  /** Tooltip/popover background */
  tooltip: string;
}
```

## Control Theme (Accent Colors)

Per-node accent colors for visual differentiation:

```typescript
/**
 * Theme object for visual customization of UI controls.
 * Components accept a theme to enable visual differentiation between nodes.
 */
interface ControlTheme {
  /** Main accent color - arc fill, active states */
  primary: string;
  /** Supporting elements - hover states */
  secondary: string;
  /** Subtle accents - borders (optional) */
  tertiary?: string;
  /** Background fills (optional) */
  gradient?: [string, string];
}
```

Derived values (shadows, highlights, dimmed states) are computed from these base colors.

## Theme Provider Pattern

Components access both chrome and control theme through a `useTheme` hook:

```tsx
// Inside any graph component
function EnvelopeEditor({ ... }: EnvelopeEditorProps) {
  const { chrome, theme } = useTheme();

  // Use chrome for structural elements
  // Use theme for accent elements

  return (
    <Grid
      config={gridConfig}
      chrome={chrome}
      theme={theme}
    >
      {/* ... */}
    </Grid>
  );
}
```

## Application to Graph Components

**Chrome colors (structural, neutral):**

- **Grid background**: `chrome.surface` or transparent
- **Grid lines**: `chrome.track` (subtle), `chrome.border` (axes)
- **Axis labels**: `chrome.text`
- **Point borders (unselected)**: `chrome.border`
- **Tooltips**: `chrome.tooltip` background, `chrome.text` for text

**Control theme colors (accent, per-node):**

- **Curves**: `theme.primary` for stroke, `theme.secondary` for fill
- **Control points (selected)**: `theme.primary` fill, `theme.secondary` stroke on hover
- **Playhead**: `theme.primary` for the position line
- **Spectrum bars**: `theme.gradient` for fills (if provided), otherwise `theme.primary`
- **Region selection**: `theme.secondary` with transparency
- **Curve handles**: `theme.primary` for handle, `theme.secondary` for connecting line

This separation ensures that graph components maintain visual consistency with audio controls while allowing per-node accent customization.

## Integration with Audio Node UI

Graph-based components can be embedded within node UI components (following the pattern in `src/nodes/*/graph.tsx`). Since these components typically need more space than standard controls, they should:

1. **Span full width**: Use the full width of the node content area
2. **Be placed in their own section**: Avoid mixing with knobs/sliders on the same row
3. **Have explicit dimensions**: Specify width/height that works within the node layout

**Example: Envelope editor in a node UI**

```typescript
// In src/nodes/envelope/graph.tsx
const EnvelopeNodeUI: React.FC<NodeUiProps<EnvelopeNode>> = ({ node, onPatchNode }) => {
  const { chrome, theme } = useTheme();

  return (
    <div className="node-controls">
      {/* Standard controls */}
      <div className="control-row">
        <Knob label="Attack" {...attackProps} />
        <Knob label="Decay" {...decayProps} />
        <Knob label="Sustain" {...sustainProps} />
        <Knob label="Release" {...releaseProps} />
      </div>

      {/* Envelope editor spans full width */}
      <EnvelopeEditor
        points={node.state.points}
        onChange={(points) => onPatchNode({ points })}
        // chrome and theme come from useTheme() inside EnvelopeEditor
      />
    </div>
  );
}
```

## Theme Propagation

Each node UI component wraps its content in a `ThemeProvider` with its accent colors. Graph-based components use `useTheme()` to access both chrome and theme:

```tsx
// In GraphNodeCard, each node's UI is wrapped with its theme
<ThemeProvider theme={nodeTheme}>
  <NodeUI node={node} onPatchNode={onPatchNode} />
</ThemeProvider>

// Inside any graph component
function EnvelopeEditor({ points, onChange }: EnvelopeEditorProps) {
  const { chrome, theme } = useTheme();
  // chrome provides structural colors, theme provides accent colors
  // ...
}
```

## Considerations

- Graph components are more visually prominent than standard controls, so use them intentionally
- Consider making them collapsible/expandable for compact node views
- Chrome colors maintain consistency across all nodes (structure, text, borders)
- Theme colors differentiate nodes visually (accents, active states, data visualization)
- Graph components respect the soft UI aesthetic established by the control library
