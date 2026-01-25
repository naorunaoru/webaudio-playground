import { useState, useCallback } from "react";

export interface UseDragValueOptions {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /**
   * Sensitivity mode:
   * - 'range': sensitivity is fraction of (max - min) per pixel (default, good for knobs)
   * - 'step': sensitivity is step value per pixel (good for numeric inputs)
   */
  mode?: "range" | "step";
  /** Step size when mode is 'step' */
  step?: number;
  /** Sensitivity multiplier for drag distance to value change (mode: 'range') */
  sensitivity?: number;
  /** Fine sensitivity when shift is held (multiplier) */
  fineSensitivity?: number;
  /** Whether drag is disabled */
  disabled?: boolean;
  /** Callback when drag starts */
  onDragStart?: () => void;
  /** Callback when drag ends */
  onDragEnd?: () => void;
}

export interface UseDragValueResult {
  isDragging: boolean;
  handlePointerDown: (e: React.PointerEvent) => void;
}

/** Quantize value to nearest step */
const quantize = (value: number, step: number): number =>
  Math.round(value / step) * step;

/**
 * Hook for drag-to-change-value interaction.
 * Vertical drag adjusts value, shift key enables fine control.
 */
export function useDragValue({
  value,
  onChange,
  min,
  max,
  mode = "range",
  step,
  sensitivity = 0.005,
  fineSensitivity = 0.001,
  disabled = false,
  onDragStart,
  onDragEnd,
}: UseDragValueOptions): UseDragValueResult {
  const [isDragging, setIsDragging] = useState(false);

  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, v)),
    [min, max]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      // Ignore right-click (context menu)
      if (e.button !== 0) return;

      e.preventDefault();
      setIsDragging(true);
      onDragStart?.();

      const startY = e.clientY;
      const startValue = value;
      const range = max - min;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = startY - moveEvent.clientY;
        let deltaValue: number;

        if (mode === "step") {
          const sens = moveEvent.shiftKey ? 0.1 : 1;
          deltaValue = deltaY * (step ?? 1) * sens;
        } else {
          const sens = moveEvent.shiftKey ? fineSensitivity : sensitivity;
          deltaValue = deltaY * sens * range;
        }

        let newValue = clamp(startValue + deltaValue);
        if (step) newValue = quantize(newValue, step);
        onChange(newValue);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        onDragEnd?.();
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [value, onChange, min, max, mode, step, sensitivity, fineSensitivity, disabled, clamp, onDragStart, onDragEnd]
  );

  return { isDragging, handlePointerDown };
}
