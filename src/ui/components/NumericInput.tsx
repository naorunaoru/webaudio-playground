import { useState, useRef, useEffect } from "react";
import type { ContinuousControlProps, BaseControlProps } from "@ui/types";
import { useTheme } from "@ui/context";
import { useDragValue } from "@ui/hooks";
import { Label, type LabelPosition } from "./Label";

export interface NumericInputProps extends ContinuousControlProps, BaseControlProps {
  format?: (value: number) => string;
  parse?: (input: string) => number;
  unit?: string;
  width?: number;
  /** Called when focus leaves the input */
  onBlur?: () => void;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
  /** Position of the label relative to the input */
  labelPosition?: LabelPosition;
}

/**
 * Numeric input for continuous value ranges.
 * Supports direct keyboard entry and vertical drag adjustment.
 */
export function NumericInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  disabled = false,
  format,
  parse,
  unit,
  width = 60,
  onBlur: onBlurProp,
  autoFocus = false,
  onDragStart,
  onDragEnd,
  labelPosition = "bottom",
}: NumericInputProps) {
  const { theme, chrome } = useTheme();
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = editingValue !== null;

  const { isDragging, handlePointerDown } = useDragValue({
    value,
    onChange,
    min,
    max,
    mode: "step",
    step,
    disabled: disabled || isEditing,
    onDragStart: () => {
      inputRef.current?.focus();
      onDragStart?.();
    },
    onDragEnd,
  });

  // Auto-focus on mount if requested - also enters editing mode with value selected
  useEffect(() => {
    if (autoFocus) {
      setEditingValue(formattedValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, []);

  // Format value for display
  const formatValue = format ?? ((v: number) => v.toFixed(2));
  const parseValue = parse ?? parseFloat;
  const formattedValue = formatValue(value);
  const displayValue = isEditing
    ? editingValue
    : unit
      ? `${formattedValue} ${unit}`
      : formattedValue;

  // Clamp value to range
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  // Commit the edited value
  const commitValue = (inputValue: string) => {
    const parsed = parseValue(inputValue);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    }
    setEditingValue(null);
  };

  // Enter direct editing mode
  const startEditing = () => {
    if (disabled) return;
    setEditingValue(formattedValue);
    // Select all on next tick so the selection happens after React updates
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    if (editingValue !== null) {
      commitValue(editingValue);
    }
    onBlurProp?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEditing) {
      setEditingValue(e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditingValue(null);
      e.currentTarget.blur();
    } else if (!isEditing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const delta = e.key === "ArrowUp" ? step : -step;
      const fineMultiplier = e.shiftKey ? 0.1 : 1;
      onChange(clamp(value + delta * fineMultiplier));
    }
  };

  // Double-click enters direct editing mode
  const handleDoubleClick = () => {
    startEditing();
  };

  const isHorizontal = labelPosition === "left" || labelPosition === "right";

  const inputElement = (
    <input
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      disabled={disabled}
      readOnly={!isEditing}
      style={{
        width,
        padding: "4px 6px",
        fontSize: 12,
        fontFamily: "monospace",
        textAlign: "center",
        color: chrome.text,
        background: chrome.surface,
        border: `1px solid ${isDragging || isEditing ? theme.primary : chrome.border}`,
        borderRadius: 4,
        outline: "none",
        cursor: disabled ? "not-allowed" : isEditing ? "text" : "ns-resize",
        userSelect: isEditing ? "text" : "none",
      }}
    />
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label && labelPosition === "left" && <Label text={label} position={labelPosition} />}
      {inputElement}
      {label && labelPosition !== "left" && <Label text={label} position={labelPosition} />}
    </div>
  );
}
