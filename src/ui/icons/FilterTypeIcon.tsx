export type FilterResponseType = "lowpass" | "highpass";

export interface FilterTypeIconProps {
  type: FilterResponseType;
  size?: number;
}

/**
 * SVG icons for filter response types.
 * Uses currentColor to inherit text color from parent.
 */
export function FilterTypeIcon({ type, size = 16 }: FilterTypeIconProps) {
  const strokeWidth = 1.5;

  // All paths drawn in a 16x16 viewBox with 2px padding
  const paths: Record<FilterResponseType, string> = {
    // Lowpass response: flat then rolls off down
    lowpass: "M2 5 L9 5 Q12 5 14 12",
    // Highpass response: rises up then flattens
    highpass: "M2 12 Q4 12 6 5 L14 5",
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
