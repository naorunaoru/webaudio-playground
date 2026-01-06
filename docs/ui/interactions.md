# Interaction Components

These components handle user input for editing graph data.

## PointEditor

Enables adding, moving, and deleting points on a curve.

**Responsibilities:**

- Click to add points
- Drag to move points
- Context menu for deletion
- Snap-to-grid behavior
- Multi-select and bulk operations

**API:**

```typescript
function PointEditor({
  points,
  onPointsChange,
  constraints,      // Min/max bounds, allowed regions
  snapToGrid = true,
  multiSelect = false
}: PointEditorProps) {
  const { fromPixels, snapToGrid: snap } = useCoordinateSystem();

  const handleCanvasClick = (e: MouseEvent) => {
    const [x, y] = fromPixels(e.clientX, e.clientY);
    const snapped = snapToGrid
      ? { x: snap(x, 'x'), y: snap(y, 'y') }
      : { x, y };

    onPointsChange([...points, snapped]);
  };

  const handlePointDrag = (index: number, e: MouseEvent) => {
    const [x, y] = fromPixels(e.clientX, e.clientY);
    const updated = [...points];
    updated[index] = {
      ...updated[index],
      x: snapToGrid ? snap(x, 'x') : x,
      y: snapToGrid ? snap(y, 'y') : y
    };
    onPointsChange(updated);
  };

  return (
    <g className="point-editor">
      <rect
        width="100%"
        height="100%"
        fill="transparent"
        onClick={handleCanvasClick}
      />
      {points.map((pt, i) => (
        <EditablePoint
          key={i}
          point={pt}
          index={i}
          onDrag={(e) => handlePointDrag(i, e)}
          onContextMenu={(e) => showPointMenu(i, e)}
        />
      ))}
    </g>
  );
}
```

---

## CurveHandle

Visual control for adjusting curve tension/bias between points.

**Responsibilities:**

- Appears when a curve segment is selected
- Drag handle to adjust tension parameter
- Visual feedback showing curve shape change

**API:**

```typescript
function CurveHandle({
  segment,        // The curve segment being edited
  segmentIndex,
  theme,          // Uses ControlTheme
  onTensionChange
}: CurveHandleProps) {
  const { toPixels, fromPixels } = useCoordinateSystem();

  // Handle appears at curve midpoint
  const midpoint = interpolatePoint(segment.start, segment.end, 0.5, segment.tension);
  const [px, py] = toPixels(midpoint.x, midpoint.y);

  const handleDrag = (e: MouseEvent) => {
    // Map vertical drag to tension value
    const delta = e.movementY;
    const newTension = clamp(segment.tension + delta * 0.01, -1, 1);
    onTensionChange(segmentIndex, newTension);
  };

  return (
    <g className="curve-handle">
      <line
        x1={px}
        y1={py}
        x2={px}
        y2={py - 20}
        stroke={theme.secondary}
        strokeWidth={1}
      />
      <circle
        cx={px}
        cy={py - 20}
        r={6}
        fill={theme.primary}
        style={{ cursor: 'ns-resize' }}
        onMouseDown={handleDrag}
      />
    </g>
  );
}
```

---

## RegionSelector

Allows selecting time or frequency ranges.

**Responsibilities:**

- Click and drag to select region
- Visual highlight of selected range
- Snap to meaningful boundaries (bar lines, beat divisions)

**API:**

```typescript
function RegionSelector({
  onRegionChange,
  initialRegion,
  axis = 'x',      // 'x' for time, 'y' for frequency
  snapToGrid = true,
  theme            // Uses ControlTheme
}: RegionSelectorProps) {
  const [region, setRegion] = useState(initialRegion);
  const { fromPixels, snapToGrid: snap } = useCoordinateSystem();

  // Use theme with transparency
  const fillColor = theme.secondary + '40'; // Add alpha for transparency

  return (
    <g className="region-selector">
      {region && (
        <rect
          x={toPixels(region.start, 0)[0]}
          y={0}
          width={toPixels(region.end, 0)[0] - toPixels(region.start, 0)[0]}
          height="100%"
          fill={fillColor}
          stroke={theme.primary}
          strokeWidth={2}
        />
      )}
    </g>
  );
}
```

---

## ZoomPan

Provides viewport navigation controls.

**Responsibilities:**

- Mouse wheel zoom
- Click-drag pan
- Pinch zoom on touch devices
- Zoom to fit / zoom to selection

**API:**

```typescript
function ZoomPan({
  viewport,
  onViewportChange,
  bounds,          // Min/max zoom levels
  zoomSpeed = 0.1
}: ZoomPanProps) {
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * zoomSpeed;
    const newZoom = clamp(viewport.zoom * (1 - delta), bounds.minZoom, bounds.maxZoom);
    onViewportChange({ ...viewport, zoom: newZoom });
  };

  const handlePan = (e: MouseEvent) => {
    if (e.buttons !== 1) return; // Left button only
    const newPan = {
      x: viewport.pan.x + e.movementX / viewport.zoom,
      y: viewport.pan.y + e.movementY / viewport.zoom
    };
    onViewportChange({ ...viewport, pan: newPan });
  };

  return (
    <g
      className="zoom-pan"
      onWheel={handleWheel}
      onMouseMove={handlePan}
    >
      {/* Transparent overlay to capture events */}
      <rect width="100%" height="100%" fill="transparent" />
    </g>
  );
}
```
