# Shared Hooks

Reusable hooks for UI control behavior.

## Range Value Utilities

Shared hook for all continuous controls (Knob, Slider, NumericInput).

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

---

## Discrete Value Utilities

### Single Selection

For DiscreteKnob, RadioGroup, Toggle:

```typescript
function useSingleSelect<T>(config: SingleSelectProps<T>) {
  // Returns helpers for:
  // - Finding current option index
  // - Navigating to next/previous option
  // - Validating value against options
}
```

### Multiple Selection

For MultiSelectGroup:

```typescript
function useMultiSelect<T>(config: MultiSelectProps<T>) {
  // Returns helpers for:
  // - Toggling individual options
  // - Enforcing min/max constraints
  // - Checking if option is selected
}
```

---

## Drag Interaction

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

---

## Repeat/Ramp Timing

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

---

## Context Menu Trigger

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

---

## Animation Frame

For real-time visualizations (playhead, spectrum):

```typescript
function useAnimationFrame(callback: () => void) {
  // Runs callback on each animation frame
  // Cleans up on unmount
}
```

See [utilities.md](./utilities.md) for implementation details.

---

## Coordinate System

For graph-based components:

```typescript
function useCoordinateSystem() {
  const context = useContext(CoordinateSystemContext);

  return {
    toPixels: (x: number, y: number) => [px, py],
    fromPixels: (px: number, py: number) => [x, y],
    snapToGrid: (value: number, axis: 'x' | 'y', divisions?: number) => number,
    viewport: { zoom: number, pan: { x: number, y: number } }
  };
}
```

---

## Time Base

For musical time conversion:

```typescript
function useTimebase(config: TimeBase): TimebaseConversion {
  return {
    toAbsolute: (value: number) => number,   // Convert to milliseconds
    toMusical: (ms: number) => number,       // Convert from milliseconds
    formatLabel: (value: number) => string   // Format for display
  };
}
```

See [time-base.md](./time-base.md) for full implementation.
