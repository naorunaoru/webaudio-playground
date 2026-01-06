# Primitive Components

These are the foundational building blocks for graph-based visualizations.

## Grid

The foundation component that establishes a 2D coordinate system.

**Responsibilities:**

- Coordinate transformation (data space ↔ pixel space)
- Grid line rendering
- Axis labels and tick marks
- Support for linear and logarithmic scales
- Viewport management (zoom/pan)

**Configuration:**

```typescript
type AxisScale = 'linear' | 'logarithmic' | 'db';

type TimeBase =
  | { type: 'absolute', unit: 'ms' | 's' }
  | { type: 'musical', tempo: number, unit: 'bars' | 'beats' | 'ticks' };

interface AxisConfig {
  scale: AxisScale;
  domain: [number, number];  // [min, max] in data units
  timeBase?: TimeBase;       // For x-axis temporal data
  label?: string;
}

interface GridConfig {
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  width: number;
  height: number;
  chrome: ChromeColors;     // Structural colors (grid lines, labels, background)
  theme: ControlTheme;      // Accent colors for data visualization
  gridLines?: {
    x?: boolean;
    y?: boolean;
  };
}
```

**API:**

```typescript
function Grid({
  config,
  children,
  onViewportChange
}: GridProps) {
  const { chrome, theme } = config;

  // Provides coordinate system context to children
  return (
    <CoordinateSystemProvider config={config}>
      <svg
        width={config.width}
        height={config.height}
        style={{ background: chrome.surface }}
      >
        <GridLines color={chrome.track} axisColor={chrome.border} />
        <AxisLabels color={chrome.text} mutedColor={chrome.textMuted} />
        {children}
      </svg>
    </CoordinateSystemProvider>
  );
}
```

**Coordinate System Hook:**

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

## Curve

Renders a series of points as a continuous curve with configurable interpolation.

**Responsibilities:**

- Point-to-point curve rendering
- Multiple interpolation types (linear, exponential, logarithmic, smooth)
- Curve tension/bias control between points
- Visual styling (color, thickness, fill)

**Types:**

```typescript
interface CurvePoint {
  x: number;
  y: number;
  tension?: number;        // -1 to 1, controls curve shape
  isSustainPoint?: boolean; // For envelopes: stops progression until note-off
}

type InterpolationType =
  | 'linear'       // Straight lines between points
  | 'exponential'  // y = start * (end/start)^t
  | 'logarithmic'  // Inverse of exponential
  | 'smooth';      // Cubic/spline interpolation

interface CurveSegment {
  start: CurvePoint;
  end: CurvePoint;
  interpolation: InterpolationType;
  tension?: number;  // Per-segment override
}
```

**API:**

```typescript
function Curve({
  points,
  interpolation = 'linear',
  tension = 0,
  strokeWidth = 2,
  readonly = false,
  onPointsChange
}: CurveProps) {
  const { toPixels } = useCoordinateSystem();
  const { chrome, theme } = useTheme();

  // Use theme for accents
  const strokeColor = theme.primary;
  const fillColor = theme.secondary;

  // Generates SVG path from points + interpolation
  const path = useMemo(() =>
    generateCurvePath(points, interpolation, tension, toPixels),
    [points, interpolation, tension, toPixels]
  );

  return (
    <g className="curve">
      <path d={path} fill={fillColor} opacity={0.2} />
      <path d={path} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" />
      {!readonly && points.map((pt, i) => (
        <CurvePoint
          key={i}
          point={pt}
          index={i}
          chrome={chrome}
          theme={theme}
        />
      ))}
    </g>
  );
}
```

---

## Waveform

Renders audio sample data as an amplitude-over-time visualization.

**Responsibilities:**

- Efficient rendering of potentially millions of samples
- Level-of-detail (LOD) for zoomed-out views
- Peak/RMS display options
- Stereo/multi-channel support

**Types:**

```typescript
interface WaveformData {
  sampleRate: number;
  channels: Float32Array[];  // One array per channel
  duration: number;          // In seconds
}

type WaveformStyle = 'line' | 'filled' | 'bars';
type WaveformDetail = 'full' | 'peaks' | 'rms';
```

**API:**

```typescript
function Waveform({
  data,
  style = 'filled',
  detail = 'peaks',
  theme,              // Uses ControlTheme
  channels = [0]      // Which channels to display
}: WaveformProps) {
  const { toPixels, viewport } = useCoordinateSystem();

  // Use theme colors
  const color = theme.primary;
  const fillColor = theme.gradient?.[0] || theme.secondary;

  // Downsamples data based on visible pixel width
  const displayData = useMemo(() =>
    downsampleWaveform(data, viewport, detail),
    [data, viewport, detail]
  );

  return (
    <g className="waveform">
      {channels.map(channelIndex => (
        <WaveformChannel
          key={channelIndex}
          data={displayData[channelIndex]}
          style={style}
          color={color}
          fillColor={fillColor}
        />
      ))}
    </g>
  );
}
```

---

## Spectrum

Renders frequency-domain data (FFT results).

**Responsibilities:**

- Bar or line representation of frequency bins
- Logarithmic frequency scaling (standard for audio)
- dB scale for amplitude
- Smoothing and peak hold options

**Types:**

```typescript
interface SpectrumData {
  frequencies: Float32Array;  // Bin frequencies in Hz
  magnitudes: Float32Array;   // Magnitude values (linear or dB)
  sampleRate: number;
}

type SpectrumStyle = 'bars' | 'line' | 'filled';
```

**API:**

```typescript
function Spectrum({
  data,
  style = 'bars',
  theme,              // Uses ControlTheme
  smoothing = 0.8,
  peakHold = false,
  opacity = 1.0
}: SpectrumProps) {
  const { toPixels } = useCoordinateSystem();

  const color = theme.gradient
    ? { start: theme.gradient[0], end: theme.gradient[1] }
    : theme.primary;

  const smoothedData = useMemo(() =>
    smoothSpectrum(data, smoothing),
    [data, smoothing]
  );

  return (
    <g className="spectrum" opacity={opacity}>
      <SpectrumBars data={smoothedData} color={color} />
      {peakHold && <PeakHoldIndicators data={smoothedData} color={theme.secondary} />}
    </g>
  );
}
```

---

## Playhead

A visual indicator of current time/position.

**Responsibilities:**

- Vertical or horizontal line at current position
- Optional time label
- Scrubbing interaction (drag to seek)

**API:**

```typescript
function Playhead({
  position,      // In data units (ms, samples, etc.)
  orientation = 'vertical',
  theme,         // Uses ControlTheme
  showLabel = true,
  interactive = true,
  onPositionChange
}: PlayheadProps) {
  const { toPixels } = useCoordinateSystem();
  const [px, py] = toPixels(position, 0);

  const color = theme.primary;

  return (
    <g className="playhead">
      <line
        x1={px} y1={0}
        x2={px} y2={height}
        stroke={color}
        strokeWidth={2}
      />
      {showLabel && (
        <text x={px} y={-5} fill={color}>
          {formatTime(position)}
        </text>
      )}
    </g>
  );
}
```
