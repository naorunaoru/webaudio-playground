# Utilities

## Animation and Real-Time Updates

Components that display real-time data (playhead, spectrum analyzer) need efficient animation loops.

**Hook:**

```typescript
function useAnimationFrame(callback: () => void) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  const animate = useCallback((time: number) => {
    if (previousTimeRef.current !== undefined) {
      callback();
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [callback]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate]);
}
```

**Usage in Playhead:**

```typescript
function AnimatedPlayhead({
  getPosition,  // Function that returns current position
  ...props
}: AnimatedPlayheadProps) {
  const [position, setPosition] = useState(0);

  useAnimationFrame(() => {
    setPosition(getPosition());
  });

  return <Playhead position={position} {...props} />;
}
```

**Usage in Spectrum Analyzer:**

```typescript
function RealtimeSpectrum({
  analyser,
  ...props
}: RealtimeSpectrumProps) {
  const [data, setData] = useState<SpectrumData | null>(null);

  useAnimationFrame(() => {
    const frequencies = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(frequencies);

    setData({
      frequencies: computeFrequencyArray(analyser),
      magnitudes: frequencies,
      sampleRate: analyser.context.sampleRate
    });
  });

  return <Spectrum data={data} {...props} />;
}
```

---

## Curve Interpolation Mathematics

Different interpolation types require different mathematical approaches.

### Linear Interpolation

Simplest case: straight lines between points.

```typescript
function linearInterpolate(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
```

### Exponential Interpolation

Common in audio envelopes for natural-sounding curves.

```typescript
function exponentialInterpolate(
  start: number,
  end: number,
  t: number,
  exponent: number = 2
): number {
  // Avoid division by zero
  if (start === 0) start = 0.0001;
  if (end === 0) end = 0.0001;

  return start * Math.pow(end / start, Math.pow(t, exponent));
}
```

### Logarithmic Interpolation

Inverse of exponential, useful for filter cutoff frequencies.

```typescript
function logarithmicInterpolate(
  start: number,
  end: number,
  t: number,
  exponent: number = 2
): number {
  return exponentialInterpolate(start, end, 1 - t, exponent);
}
```

### Smooth Interpolation (Cubic)

Uses tension parameter for bezier-like curves.

```typescript
function smoothInterpolate(
  start: number,
  end: number,
  t: number,
  tension: number = 0  // -1 to 1
): number {
  // Hermite interpolation with tension
  const t2 = t * t;
  const t3 = t2 * t;

  const m0 = (end - start) * (1 + tension) / 2;
  const m1 = m0;

  return (
    (2 * t3 - 3 * t2 + 1) * start +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * end +
    (t3 - t2) * m1
  );
}
```

### Generating SVG Paths

Convert interpolated points to SVG path commands:

```typescript
function generateCurvePath(
  points: CurvePoint[],
  interpolation: InterpolationType,
  defaultTension: number,
  toPixels: (x: number, y: number) => [number, number]
): string {
  if (points.length === 0) return '';

  const segments: string[] = [];
  const [startX, startY] = toPixels(points[0].x, points[0].y);
  segments.push(`M ${startX} ${startY}`);

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const tension = end.tension ?? defaultTension;

    // Generate intermediate points based on interpolation type
    const numSteps = 20; // More steps = smoother curve
    for (let step = 1; step <= numSteps; step++) {
      const t = step / numSteps;
      let y: number;

      switch (interpolation) {
        case 'linear':
          y = linearInterpolate(start.y, end.y, t);
          break;
        case 'exponential':
          y = exponentialInterpolate(start.y, end.y, t, 2 + tension);
          break;
        case 'logarithmic':
          y = logarithmicInterpolate(start.y, end.y, t, 2 - tension);
          break;
        case 'smooth':
          y = smoothInterpolate(start.y, end.y, t, tension);
          break;
      }

      const x = linearInterpolate(start.x, end.x, t);
      const [px, py] = toPixels(x, y);
      segments.push(`L ${px} ${py}`);
    }
  }

  return segments.join(' ');
}
```

---

## Waveform Downsampling

For efficient rendering of potentially millions of audio samples, implement level-of-detail downsampling.

```typescript
interface WaveformLOD {
  samplesPerPixel: number;
  peaks: { min: number, max: number }[];
  rms: number[];
}

function downsampleWaveform(
  channelData: Float32Array,
  viewport: { zoom: number, pan: { x: number } },
  pixelWidth: number,
  detail: 'full' | 'peaks' | 'rms'
): WaveformLOD {
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / (pixelWidth * viewport.zoom)));

  const peaks: { min: number, max: number }[] = [];
  const rms: number[] = [];

  for (let i = 0; i < channelData.length; i += samplesPerPixel) {
    const chunk = channelData.slice(i, i + samplesPerPixel);

    if (detail === 'full' || detail === 'peaks') {
      peaks.push({
        min: Math.min(...chunk),
        max: Math.max(...chunk)
      });
    }

    if (detail === 'full' || detail === 'rms') {
      const sumSquares = chunk.reduce((sum, val) => sum + val * val, 0);
      rms.push(Math.sqrt(sumSquares / chunk.length));
    }
  }

  return { samplesPerPixel, peaks, rms };
}
```

---

## Performance Considerations

### Memoization

Expensive calculations should be memoized:

```typescript
// In Curve component
const path = useMemo(
  () => generateCurvePath(points, interpolation, tension, toPixels),
  [points, interpolation, tension, toPixels]
);

// In Waveform component
const displayData = useMemo(
  () => downsampleWaveform(data, viewport, detail),
  [data, viewport, detail]
);
```

### Canvas vs SVG

For high-density real-time visualizations (spectrum analyzer with many bins), use Canvas instead of SVG:

```typescript
function CanvasSpectrum({ data, width, height, theme }: CanvasSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use theme colors
  const fillColor = theme.gradient?.[0] || theme.primary;

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);

    // Direct canvas drawing is faster than SVG for many elements
    const barWidth = width / data.magnitudes.length;
    data.magnitudes.forEach((magnitude, i) => {
      const barHeight = (magnitude + 90) / 90 * height; // -90dB to 0dB
      ctx.fillStyle = fillColor;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    });
  });

  return <canvas ref={canvasRef} width={width} height={height} />;
}
```

### Virtual Scrolling

For very long waveforms, only render visible portions:

```typescript
function VirtualizedWaveform({
  data,
  viewport,
  ...props
}: VirtualizedWaveformProps) {
  // Only process samples visible in current viewport
  const visibleStart = Math.floor(viewport.pan.x);
  const visibleEnd = Math.ceil(viewport.pan.x + viewport.width / viewport.zoom);

  const visibleData = useMemo(() => ({
    ...data,
    channels: data.channels.map(channel =>
      channel.slice(visibleStart, visibleEnd)
    )
  }), [data, visibleStart, visibleEnd]);

  return <Waveform data={visibleData} {...props} />;
}
```
