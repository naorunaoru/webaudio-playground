# Audio UI Component Library — Implementation Plan

A React component library for building node-based audio application interfaces, designed for Web Audio playgrounds, synthesizers, and similar tools.

## Design Goals

- **Declarative**: Node UIs described as component trees with standard CSS grid/flex layout
- **Cohesive visual style**: Soft UI aesthetic — subtle shadows, gentle gradients, not flat but not skeuomorphic
- **Themeable**: Color schemes per component/node for visual distinction
- **Consistent interaction patterns**: Shared behaviors across similar controls
- **Compact**: Optimized for dense node graph UIs, with future support for expanded detail panels

## Theme System

Components accept a theme object to enable visual differentiation between nodes:

```typescript
interface ControlTheme {
  primary: string;      // main accent, arc fill, active states
  secondary: string;    // supporting elements, hover states  
  tertiary?: string;    // subtle accents, borders
  gradient?: [string, string];  // background fills
}
```

Derived values (shadows, highlights, dimmed states) are computed from these base colors.

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

### Base Type Interfaces

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

## Grid Layout System

Components align to a grid for predictable, consistent layouts.

### Grid Configuration

```typescript
interface GridConfig {
  columns: number;        // how many units wide the node panel is
  unitSize?: number;      // pixel size of one grid unit
  gap?: number;           // spacing between units
}
```

### Component Grid Sizes

Each component has a default size in grid units, some configurable:

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

### Layout Components

```typescript
// Container with grid layout
interface NodePanelProps {
  columns: number;
  theme: ControlTheme;
  unitSize?: number;
  gap?: number;
  children: ReactNode;
}

// Named group with border/background
// Does NOT consume grid space — padding is visual only
interface GroupProps {
  label: string;
  children: ReactNode;
  // Inherits theme from NodePanel context
  // Width determined by children content
}

// Visual divider, always horizontal, spans full panel width
interface SeparatorProps {
  label?: string;         // named or plain line
}
```

### Group Behavior

Groups provide visual containment (border, background, label) without affecting grid math. The border/background extends slightly outside the child cells visually but doesn't consume grid units:

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

### Example Layout

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

## Component Inventory

### Continuous Controls

#### Knob (Continuous)

Rotary control for continuous value ranges.

**Props:**

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

### Discrete Controls

#### Knob (Discrete)

Rotary switch for selecting from fixed options.

**Props:**

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

#### Slider

Linear control for continuous ranges. Shares value logic with Knob.

**Props:**

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

#### NumericInput

Precise numeric entry with multiple input modes. Mimics FL Studio behavior.

Continuous by nature — discrete integer behavior is achieved via `step={1}`.

**Props:**

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

#### Toggle

Boolean on/off control. A specialized discrete control with implicit options `[false, true]`.

**Props:**

```typescript
interface ToggleProps extends BaseControlProps {
  // Specialized case of SingleSelectProps<boolean>
  // Options implicitly [false, true], no need to specify
  value: boolean;
  onChange: (value: boolean) => void;
  variant?: 'switch' | 'lit';
}
```

**Variants:**

- `switch`: sliding thumb, iOS-style
- `lit`: single button, illuminated when on (hardware aesthetic)

#### RadioGroup

Row or column of buttons for single selection. Same semantics as DiscreteKnob, different layout.

**Props:**

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

#### MultiSelectGroup

Row or column of buttons for multiple selection. Visually identical to RadioGroup, but allows selecting multiple options.

**Props:**

```typescript
interface MultiSelectGroupProps extends MultiSelectProps, BaseControlProps {
  orientation?: 'horizontal' | 'vertical';
}
```

**Grid sizing:**

- Same as RadioGroup

**Behavior:**

- Each button toggles independently
- `min`/`max` constraints prevent deselecting below minimum or selecting above maximum

#### Button

Momentary/trigger control for actions. Not a value control — fires events only.

**Props:**

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

**Modes:**

- `trigger`: fires once per click, visual blip feedback
- `momentary`: fires on press or release (configurable)
- `gate`: fires on press, stops on release (MIDI gate style)
- `repeat`: fires continuously while held, with acceleration

### Utility Components

#### Label

Text label component, used by other controls and available standalone.

**Props:**

```typescript
interface LabelProps {
  text: string;
  variant?: 'default' | 'heading';
  theme?: ControlTheme;
}
```

## Shared Infrastructure

### Context Menu

Controls support a context menu for secondary actions, triggered by right-click (mouse) or long press (touch).

**Trigger hook:**

```typescript
function useContextMenuTrigger(options: {
  onTrigger: (position: { x: number; y: number }) => void;
  longPressDelay?: number;  // default ~500ms
}) {
  // Returns props to spread on element
  // Handles:
  // - Right-click (contextmenu event)
  // - Long press (touch start → wait → fire if not moved/released)
  // - Cancels long press if touch moves or releases early
}
```

**Menu component:**

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

**Export indicator:**

When a control is exported (CC input exposed), a small dot appears in the corner of the grid cell using the theme accent color. The dot may pulse or glow when MIDI data is actively received.

```
┌─────────┐
│       ● │  ← export indicator
│  ╭───╮  │
│  │   │  │
│  ╰───╯  │
│  Freq   │
└─────────┘
```

### Tooltip System

- Shows formatted value on hover
- Also visible during drag, positioned to not obscure control
- Falls back to ariaLabel for discrete options

### Range Value Utilities

Shared hook for all continuous controls (Knob, Slider, NumericInput).
Implements the logic defined in `ContinuousControlProps`:

```typescript
function useContinuousValue(config: ContinuousControlProps) {
  // Returns helpers for:
  // - Converting between normalized (0-1) and actual values
  // - Applying log/linear scaling
  // - Snapping to detents with magnetic behavior
  // - Clamping and stepping
  // - Fine step handling
}
```

### Discrete Value Utilities

Shared hooks for discrete controls.

**Single selection** (DiscreteKnob, RadioGroup, Toggle):

```typescript
function useSingleSelect<T>(config: SingleSelectProps<T>) {
  // Returns helpers for:
  // - Finding current option index
  // - Navigating to next/previous option
  // - Validating value against options
}
```

**Multiple selection** (MultiSelectGroup):

```typescript
function useMultiSelect<T>(config: MultiSelectProps<T>) {
  // Returns helpers for:
  // - Toggling individual options
  // - Enforcing min/max constraints
  // - Checking if option is selected
}
```

### Drag Interaction Hook

Shared vertical drag behavior:

```typescript
function useDragInteraction(options: {
  onDelta: (delta: number, fine: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  // Returns props to spread on draggable element
  // Handles mouse and touch
  // Detects shift key for fine mode
}
```

### Repeat/Ramp Timing

For arrow buttons and hold-to-repeat:

```typescript
function useRepeatAction(options: {
  onTrigger: () => void;
  delay?: number;       // ms before repeat starts (default 300)
  initialInterval?: number;
  minInterval?: number;
  ramp?: boolean;
}) {
  // Returns handlers for press/release
}
```

## Visual Style Guidelines

### General Aesthetic

- Soft shadows (subtle, slightly blurred)
- Gentle gradients (not harsh, 2-3% variation)
- Rounded corners on containers
- Neutral grays for control bodies
- Theme colors for active/accent elements

### States

- **Default**: base appearance
- **Hover**: slight brightening, enhanced shadow
- **Active/dragging**: stronger accent, possible glow
- **Focused**: visible focus ring for keyboard nav
- **Disabled**: reduced opacity, no interactions

### Accessibility

- All controls keyboard navigable
- ARIA roles and labels
- Screen reader announcements for value changes
- Sufficient color contrast
- Focus indicators

## Future Considerations

### Waveform Display

Visual waveform editor with draggable points:

- Reuses drag interaction patterns
- Markers/handles at key positions
- Could share logic with envelope editor

### Envelope Editor (ADSR, etc.)

Multi-point envelope with draggable segments:

- Attack/Decay/Sustain/Release or arbitrary points
- Visual curve between points
- Shares marker/handle logic with waveform display

### Detail Panel

Expanded control view for complex node editing:

- Same components, potentially larger sizes
- More controls visible than in compact node view
- Opens in separate panel/modal

## Future: Polyphony & MPE

This section captures ideas for polyphonic voice visualization, to be revisited after basic controls and audio graph polyphony are working.

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

The right approach may vary by control type and context.

### Interaction Model

When user interacts with a multi-voice control:

- Editing affects the **base/global value**
- Per-voice values are offsets/modulations from that base
- No direct editing of individual voice values (that comes from MPE input)

### Extended Props for Voice-Aware Controls

```typescript
// Extension to base control props for polyphonic rendering
interface VoiceAwareProps {
  // Multiple values (one per active voice) — if provided, renders multi-voice
  values?: number[];
  
  // Optional per-voice colors for visual distinction
  voiceColors?: string[];
  
  // How to display multiple values
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

1. Build single-value controls first (current plan)
2. Implement basic polyphony in audio graph
3. Test with real MPE controller (Roli Songmaker Kit)
4. Revisit UI components to add optional multi-voice rendering based on real usage patterns

Don't over-design the multi-voice UI in isolation — let real use cases inform the specifics.

## Implementation Order

Suggested sequence for incremental development:

1. **Theme system and base styles** — establish visual foundation
2. **Grid layout (NodePanel)** — container for all controls
3. **Label** — simple, used by everything
4. **Shared hooks** — useContinuousValue, useSingleSelect, useMultiSelect, useDragInteraction, useRepeatAction
5. **Knob (continuous)** — core component, exercises most patterns
6. **Slider** — reuses Knob's value logic
7. **NumericInput** — reuses drag + adds text entry
8. **Toggle** — simpler, boolean only
9. **Button** — trigger/gate modes
10. **RadioGroup** — single select button row/column
11. **MultiSelectGroup** — multi select, same visual as RadioGroup
12. **Knob (discrete)** — rotary switch variant, uses same selection logic as RadioGroup
13. **Group** — visual containment for control clusters
14. **Separator** — layout dividers
15. **Tooltip system** — can be added incrementally
16. **Context menu** — right-click/long-press actions

Each component should be usable independently as completed, allowing gradual migration from current browser defaults.
