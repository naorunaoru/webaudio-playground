# Time Base System

## Absolute vs Musical Time

Many audio parameters can be expressed in either absolute time (milliseconds/seconds) or musical time (bars/beats/ticks). The system supports switching between these representations.

**Types:**

```typescript
type TimeBase =
  | { type: 'absolute', unit: 'ms' | 's' }
  | { type: 'musical', tempo: number, unit: 'bars' | 'beats' | 'ticks' };

interface TimebaseConversion {
  toAbsolute: (value: number) => number;  // Convert to milliseconds
  toMusical: (ms: number) => number;      // Convert from milliseconds
  formatLabel: (value: number) => string; // Format for display
}
```

**Hook:**

```typescript
function useTimebase(config: TimeBase): TimebaseConversion {
  const toAbsolute = useCallback((value: number): number => {
    if (config.type === 'absolute') {
      return config.unit === 's' ? value * 1000 : value;
    }

    const { tempo, unit } = config;
    const beatDuration = 60000 / tempo; // ms per beat

    switch (unit) {
      case 'bars':
        return value * beatDuration * 4; // Assuming 4/4 time
      case 'beats':
        return value * beatDuration;
      case 'ticks':
        return value * beatDuration / 480; // 480 ticks per beat (MIDI standard)
    }
  }, [config]);

  const toMusical = useCallback((ms: number): number => {
    if (config.type === 'absolute') {
      return config.unit === 's' ? ms / 1000 : ms;
    }

    const { tempo, unit } = config;
    const beatDuration = 60000 / tempo;

    switch (unit) {
      case 'bars':
        return ms / (beatDuration * 4);
      case 'beats':
        return ms / beatDuration;
      case 'ticks':
        return ms / (beatDuration / 480);
    }
  }, [config]);

  const formatLabel = useCallback((value: number): string => {
    if (config.type === 'absolute') {
      return config.unit === 's'
        ? `${value.toFixed(2)}s`
        : `${value.toFixed(0)}ms`;
    }

    const { unit } = config;
    switch (unit) {
      case 'bars':
        return `${value.toFixed(2)} bars`;
      case 'beats':
        return `${value.toFixed(2)} beats`;
      case 'ticks':
        return `${value.toFixed(0)} ticks`;
    }
  }, [config]);

  return { toAbsolute, toMusical, formatLabel };
}
```

## Musical Time Snapping

When in musical time mode, snap-to-grid should respect musical divisions:

```typescript
const MUSICAL_DIVISIONS = {
  bars: [1, 0.5, 0.25],           // Whole, half, quarter bars
  beats: [1, 0.5, 0.25, 0.125],   // Whole, half, quarter, eighth notes
  ticks: [480, 240, 120, 60, 30]  // Various tick divisions
};

function snapToMusicalGrid(
  value: number,
  unit: 'bars' | 'beats' | 'ticks',
  divisions: number[] = MUSICAL_DIVISIONS[unit]
): number {
  // Find closest division
  let closest = divisions[0];
  let minDiff = Math.abs(value % divisions[0]);

  for (const div of divisions) {
    const diff = Math.abs(value % div);
    if (diff < minDiff) {
      minDiff = diff;
      closest = div;
    }
  }

  return Math.round(value / closest) * closest;
}
```
