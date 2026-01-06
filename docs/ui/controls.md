# UI Controls

React components for building node-based audio application interfaces.

## Component Taxonomy

Controls are grouped semantically by value type:

**Continuous** — value from a range, theoretically infinite positions:
- Knob (continuous)
- Slider
- NumericInput

**Discrete** — value from a finite set of options:
- Knob (discrete)
- Toggle (2 options, specialized case)
- Button (no value, just events)

This grouping enables shared base interfaces and behavior hooks.

---

## Continuous Controls

### Knob (Continuous)

Rotary control for continuous value ranges.

```typescript
interface KnobProps extends ContinuousControlProps, BaseControlProps {
  indicator?: 'arc' | 'bipolar' | 'catseye' | 'pointer';
  format?: (value: number) => string;
  unit?: string;
}
```

**Indicator modes:**
- `arc`: fills from min toward current value
- `bipolar`: fills from center outward (for pan, detune)
- `catseye`: two arcs converging/diverging from center (stereo width, balance)
- `pointer`: notch only, no arc (compact layouts)

**Interactions:**
- Vertical drag to change value (up = increase)
- Shift + drag for fine adjustment
- Double-click to reset to default
- Scroll wheel when hovered/focused
- Keyboard arrows when focused

**Visual elements:**
- Neutral body (gray) with themed arc
- Pointer/notch indicating position
- Detent positions marked as subtle notches on track

---

### Slider

Linear control for continuous ranges. Shares value logic with Knob.

```typescript
interface SliderProps extends ContinuousControlProps, BaseControlProps {
  orientation?: 'horizontal' | 'vertical';
  span?: number;          // length in grid units (default 2)
  format?: (value: number) => string;
  unit?: string;
}
```

**Visual elements:**
- Track (groove)
- Fill from min to current (themed)
- Thumb/handle

---

### NumericInput

Precise numeric entry with multiple input modes. Mimics FL Studio behavior.

```typescript
interface NumericInputProps extends ContinuousControlProps, BaseControlProps {
  width?: 1 | 2;          // grid units (default TBD empirically)
  format?: (value: number) => string;
  parse?: (str: string) => number;  // for direct text entry
  unit?: string;              // displayed after value
}
```

**Layout:**
```
┌───────────────┐
│       ▲       │
│   1250 Hz     │  ← drag area
│       ▼       │
└───────────────┘
     Delay
```

**Interactions:**
- Vertical drag on value to increment/decrement
- Click arrows for single step
- Hold arrows: repeat after ~300ms, then accelerate
- Double-click value for direct text entry
- Scroll wheel when hovered/focused

**Touch considerations:**
- Arrows hidden or disabled on touch devices (hold would clash with long-press context menu)
- Drag on value remains primary interaction
- Double-tap for direct entry
- Long press triggers context menu
- Detect touch via `pointer: coarse` media query or pointer events

---

## Discrete Controls

### Knob (Discrete)

Rotary switch for selecting from fixed options.

```typescript
interface DiscreteKnobProps extends SingleSelectProps, BaseControlProps {
  // Uses OptionDef — content can be icon, label, or any ReactNode
}
```

**Visual elements:**
- Pointer in center
- Icons arranged radially at each stop position
- Selected icon highlighted/glowing
- Unselected icons dimmed
- No arc, tick marks at positions

**Interactions:**
- Drag or click to switch between positions
- Snaps directly to positions, no in-between values
- Subtle click/notch feedback on position change

---

### Toggle

Boolean on/off control. A specialized discrete control with implicit options `[false, true]`.

```typescript
interface ToggleProps extends BaseControlProps {
  value: boolean;
  onChange: (value: boolean) => void;
  variant?: 'switch' | 'lit';
}
```

**Variants:**
- `switch`: sliding thumb, iOS-style
- `lit`: single button, illuminated when on (hardware aesthetic)

---

### RadioGroup

Row or column of buttons for single selection. Same semantics as DiscreteKnob, different layout.

```typescript
interface RadioGroupProps extends SingleSelectProps, BaseControlProps {
  orientation?: 'horizontal' | 'vertical';
}
```

**Grid sizing:**
- Horizontal: width = `options.length`, height = 1
- Vertical: width = 1, height = `options.length`

**Visual:**
```
Horizontal (4 options):
┌────┬────┬────┬────┐
│ ∿  │ ⊿  │ ▭  │ ⩘  │
└────┴────┴────┴────┘
   selected has accent background/border

Vertical (4 options):
┌────┐
│ ∿  │ ← selected
├────┤
│ ⊿  │
├────┤
│ ▭  │
├────┤
│ ⩘  │
└────┘
```

---

### MultiSelectGroup

Row or column of buttons for multiple selection. Visually identical to RadioGroup, but allows selecting multiple options.

```typescript
interface MultiSelectGroupProps extends MultiSelectProps, BaseControlProps {
  orientation?: 'horizontal' | 'vertical';
}
```

**Behavior:**
- Each button toggles independently
- `min`/`max` constraints prevent deselecting below minimum or selecting above maximum

---

### Button

Momentary/trigger control for actions. Not a value control — fires events only.

```typescript
interface ButtonProps extends BaseControlProps {
  onTrigger?: () => void;           // for trigger mode
  onPress?: () => void;             // for gate/momentary
  onRelease?: () => void;           // for gate/momentary
  mode?: 'trigger' | 'momentary' | 'gate' | 'repeat';
  repeatDelay?: number;             // ms before repeat starts
  repeatRamp?: boolean;             // accelerate while held
  icon?: ReactNode;
}
```

---

## Editor Controls (Non-Audio)

These aren’t “audio parameter controls” but are frequently needed in node-graph editors.

### InlineRename

Inline text editing for titles (click-to-edit, Enter/Escape, blur to commit/cancel).

**Use cases:**
- Node display names (“Oscillator 1”)
- Group names
- Patch instance and patch definition names


**Modes:**
- `trigger`: fires once per click, visual blip feedback
- `momentary`: fires on press or release (configurable)
- `gate`: fires on press, stops on release (MIDI gate style)
- `repeat`: fires continuously while held, with acceleration

---

## Utility Components

### Label

Text label component, used by other controls and available standalone.

```typescript
interface LabelProps {
  text: string;
  variant?: 'default' | 'heading';
  theme?: ControlTheme;
}
```

### Separator

Visual divider, always horizontal, spans full panel width.

```typescript
interface SeparatorProps {
  label?: string;         // named or plain line
}
```

### Group

Named group with border/background. Does NOT consume grid space — padding is visual only.

```typescript
interface GroupProps {
  label: string;
  children: ReactNode;
  // Inherits theme from NodePanel context
  // Width determined by children content
}
```

**Behavior:**
Groups provide visual containment (border, background, label) without affecting grid math:

```
┌───────────────────────┐
│ Group Label           │
│ ┌─────┬─────┬─────┐  │
│ │Knob │Knob │Knob │  │  ← 3 grid units of content
│ └─────┴─────┴─────┘  │
└───────────────────────┘
    └── 3 units total ──┘
```
