# Type Definitions

Shared interfaces and types for UI components.

## Base Control Interfaces

### Continuous Controls

```typescript
// Continuous controls share this value shape
interface ContinuousControlProps<T = number> {
  value: T;
  onChange: (value: T) => void;
  min: T;
  max: T;
  step?: T;
  fineStep?: T;
  scale?: 'linear' | 'log';
  detents?: T[];
  detentStrength?: number;
}
```

### Discrete Controls

```typescript
// Option definition shared by all discrete controls
interface OptionDef<T = string | number> {
  value: T;
  content: ReactNode;     // icon, label, or anything
  ariaLabel?: string;     // accessibility, required if content isn't text
}

// Single selection (RadioGroup, DiscreteKnob)
interface SingleSelectProps<T = string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Array<OptionDef<T>>;
}

// Multiple selection (MultiSelectGroup)
interface MultiSelectProps<T = string | number> {
  value: T[];                         // array of selected values
  onChange: (value: T[]) => void;
  options: Array<OptionDef<T>>;
  min?: number;                       // minimum selected (default 0)
  max?: number;                       // maximum selected (default all)
}
```

### Common Props

```typescript
// Common props all controls share
interface BaseControlProps {
  label?: string;
  theme: ControlTheme;
  disabled?: boolean;

  // CC export
  exported?: boolean;                           // shows indicator dot
  onContextMenu?: (action: ContextMenuAction) => void;
}
```

---

## Grid Layout Types

```typescript
interface GridConfig {
  columns: number;        // how many units wide the node panel is
  unitSize?: number;      // pixel size of one grid unit
  gap?: number;           // spacing between units
}

// Container with grid layout
interface NodePanelProps {
  columns: number;
  theme: ControlTheme;
  unitSize?: number;
  gap?: number;
  children: ReactNode;
}
```

### Component Grid Sizes

Each component has a default size in grid units:

| Component | Width | Height | Configurable |
|-----------|-------|--------|--------------|
| Knob | 1 | 1 | no |
| DiscreteKnob | 1 | 1 | no |
| Slider (V) | 1 | 2 | height via `span` |
| Slider (H) | 2 | 1 | width via `span` |
| NumericInput | 1 or 2 | 1 | TBD empirically |
| Toggle | 1 | 1 | no |
| RadioGroup (H) | options.length | 1 | no, sized by options |
| RadioGroup (V) | 1 | options.length | no, sized by options |
| MultiSelectGroup | (same as RadioGroup) | | |
| Button | 1 | 1 | no |
| Separator | full | auto | always spans full width |

---

## Context Menu Types

```typescript
interface ControlContextMenuProps {
  position: { x: number; y: number };
  exported?: boolean;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}

// Extensible action types
type ContextMenuAction =
  | { type: 'toggleExport' }
  | { type: 'resetDefault' }
  // future: 'midiLearn', 'copyValue', 'pasteValue', etc.
```

---

## Curve & Graph Types

See [primitives.md](./primitives.md) for graph-specific types like `CurvePoint`, `InterpolationType`, etc.
