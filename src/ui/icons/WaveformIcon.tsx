export type WaveformType =
  | "sine"
  | "triangle"
  | "square"
  | "sawtooth"
  | "sawtoothDown"
  | "noise";

export interface WaveformIconProps {
  type: WaveformType;
  size?: number;
}

/**
 * SVG icons for oscillator waveform/source types.
 * Uses currentColor to inherit text color from parent.
 */
export function WaveformIcon({ type, size = 16 }: WaveformIconProps) {
  const strokeWidth = 1.5;

  // All paths drawn in a 16x16 viewBox with 2px padding
  const paths: Record<WaveformType, string> = {
    // Sine wave: smooth curve
    sine: "M2 8 Q5 2, 8 8 Q11 14, 14 8",
    // Triangle wave: zigzag peaks
    triangle: "M2 8 L5 3 L11 13 L14 8",
    // Square wave: sharp corners
    square: "M2 11 L2 5 L5 5 L5 11 L8 11 L8 5 L11 5 L11 11 L14 11 L14 5",
    // Sawtooth wave: ramp up, drop down
    sawtooth: "M2 11 L7 5 L7 11 L12 5 L12 11 L14 9",
    // Sawtooth down wave: ramp down, jump up
    sawtoothDown: "M2 5 L7 11 L7 5 L12 11 L12 5 L14 7",
    // Noise: jagged random walk
    noise: "M2 10 L3 6 L4 11 L5 5 L6 12 L7 4 L8 12 L9 5 L10 11 L11 6 L12 10 L13 7 L14 9",
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[type]} />
    </svg>
  );
}
