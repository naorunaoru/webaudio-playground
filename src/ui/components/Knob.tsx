import { useState, useRef } from "react";
import type { ContinuousControlProps, BaseControlProps } from "../types";
import { useTheme } from "../context";
import { useDragValue } from "../hooks";
import { Label } from "./Label";
import { Tooltip } from "./Tooltip";
import { NumericInput } from "./NumericInput";

/** Base size in pixels - all other dimensions scale from this */
const KNOB_SIZE = 32;

export interface KnobProps extends ContinuousControlProps, BaseControlProps {
  indicator?: "arc" | "bipolar" | "catseye" | "pointer";
  format?: (value: number) => string;
  unit?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** When provided, the arc displays this value instead of the base value (for showing modulation) */
  modulationValue?: number;
}

/**
 * Rotary control for continuous value ranges.
 *
 * Indicator modes:
 * - arc: fills from min toward current value
 * - bipolar: fills from center outward (for pan, detune)
 * - catseye: two arcs converging/diverging from center
 * - pointer: notch only, no arc (compact layouts)
 */
export function Knob({
  value,
  onChange,
  min,
  max,
  label,
  indicator = "arc",
  disabled = false,
  format,
  unit,
  onDragStart,
  onDragEnd,
  modulationValue,
}: KnobProps) {
  const { theme, chrome } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isDragging, handlePointerDown } = useDragValue({
    value,
    onChange,
    min,
    max,
    disabled: disabled || isEditing,
    onDragStart,
    onDragEnd,
  });

  // Format value for display
  const formattedValue = format ? format(value) : value.toFixed(2);
  const displayValue = unit ? `${formattedValue} ${unit}` : formattedValue;

  // Normalize value to 0-1 range
  const normalized = (value - min) / (max - min);

  // Normalize modulation value (clamped to valid range)
  const modulationNormalized =
    modulationValue !== undefined
      ? Math.max(0, Math.min(1, (modulationValue - min) / (max - min)))
      : normalized;

  // Knob rotation: -135° to +135° (270° total range)
  const startAngle = -135;
  const endAngle = 135;
  const angle = startAngle + normalized * (endAngle - startAngle);
  const modulationAngle = startAngle + modulationNormalized * (endAngle - startAngle);

  // SVG dimensions derived from base size
  const size = KNOB_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.375; // 18 at size 48
  const trackWidth = size * 0.0625; // 3 at size 48

  // Convert angle to radians for arc
  const toRadians = (deg: number) => (deg - 90) * (Math.PI / 180);

  const arcPath = (start: number, end: number) => {
    const startRad = toRadians(start);
    const endRad = toRadians(end);
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Pointer position
  const pointerLength = size * 0.167; // 8 at size 48
  const pointerRad = toRadians(angle);
  const pointerX = cx + (radius - pointerLength) * Math.cos(pointerRad);
  const pointerY = cy + (radius - pointerLength) * Math.sin(pointerRad);
  const pointerGap = 2;
  const pointerEndX = cx + (radius - pointerGap) * Math.cos(pointerRad);
  const pointerEndY = cy + (radius - pointerGap) * Math.sin(pointerRad);

  // Double-click enters direct editing mode
  const handleDoubleClick = () => {
    if (disabled) return;
    setIsEditing(true);
  };

  // Handle edit completion
  const handleEditChange = (newValue: number) => {
    onChange(newValue);
  };

  const handleEditBlur = () => {
    setIsEditing(false);
  };

  // Render arc based on indicator type
  // When modulationValue is provided, arc shows modulated value; otherwise shows base value
  const renderIndicatorArc = () => {
    const arcAngle = modulationValue !== undefined ? modulationAngle : angle;
    const arcNormalized = modulationValue !== undefined ? modulationNormalized : normalized;

    switch (indicator) {
      case "bipolar": {
        const centerAngle = 0;
        if (arcNormalized >= 0.5) {
          return (
            <path
              d={arcPath(centerAngle, arcAngle)}
              fill="none"
              stroke={theme.primary}
              strokeWidth={trackWidth}
              strokeLinecap="round"
            />
          );
        } else {
          return (
            <path
              d={arcPath(arcAngle, centerAngle)}
              fill="none"
              stroke={theme.primary}
              strokeWidth={trackWidth}
              strokeLinecap="round"
            />
          );
        }
      }
      case "pointer":
        return null;
      case "arc":
      default:
        return (
          <path
            d={arcPath(startAngle, arcAngle)}
            fill="none"
            stroke={theme.primary}
            strokeWidth={trackWidth}
            strokeLinecap="round"
          />
        );
    }
  };

  // When editing, show NumericInput instead of knob
  if (isEditing) {
    return (
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NumericInput
            value={value}
            onChange={handleEditChange}
            min={min}
            max={max}
            format={format}
            unit={unit}
            width={56}
            autoFocus
            onBlur={handleEditBlur}
          />
        </div>
        {label && <Label text={label} />}
      </div>
    );
  }

  return (
    <Tooltip content={displayValue} forceVisible={isDragging}>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "ns-resize",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        {/* Track background */}
        <path
          d={arcPath(startAngle, endAngle)}
          fill="none"
          stroke={chrome.track}
          strokeWidth={trackWidth}
          strokeLinecap="round"
        />

        {/* Active arc */}
        {renderIndicatorArc()}

        {/* Knob body */}
        <circle
          cx={cx}
          cy={cy}
          r={radius - 4}
          fill={chrome.surface}
          stroke={chrome.border}
          strokeWidth={1}
        />

        {/* Pointer/notch */}
        <line
          x1={pointerX}
          y1={pointerY}
          x2={pointerEndX}
          y2={pointerEndY}
          stroke={theme.primary}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>

        {label && <Label text={label} />}
      </div>
    </Tooltip>
  );
}
