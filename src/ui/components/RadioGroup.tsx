import { useRef, useCallback } from "react";
import type { SingleSelectProps, BaseControlProps } from "@ui/types";
import { useTheme } from "@ui/context";
import { Label } from "./Label";

export interface RadioGroupProps<T extends string | number = string>
  extends SingleSelectProps<T>,
    BaseControlProps {
  orientation?: "horizontal" | "vertical";
}

/**
 * Row or column of buttons for single selection.
 * Same semantics as DiscreteKnob, different layout.
 */
export function RadioGroup<T extends string | number = string>({
  value,
  onChange,
  options,
  orientation = "horizontal",
  label,
  disabled = false,
}: RadioGroupProps<T>) {
  const { theme, chrome } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = options.findIndex((opt) => opt.value === value);

  const selectByIndex = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(options.length - 1, index));
      onChange(options[clampedIndex].value);
    },
    [options, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const isHorizontal = orientation === "horizontal";
      const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

      switch (e.key) {
        case prevKey:
          e.preventDefault();
          selectByIndex(currentIndex - 1);
          break;
        case nextKey:
          e.preventDefault();
          selectByIndex(currentIndex + 1);
          break;
        case "Home":
          e.preventDefault();
          selectByIndex(0);
          break;
        case "End":
          e.preventDefault();
          selectByIndex(options.length - 1);
          break;
      }
    },
    [disabled, orientation, currentIndex, selectByIndex, options.length]
  );

  const borderRadius = 4;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div
        ref={containerRef}
        role="radiogroup"
        aria-label={label}
        onKeyDown={handleKeyDown}
        style={{
          display: "flex",
          flexDirection: orientation === "horizontal" ? "row" : "column",
        }}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isFirst = index === 0;
          const isLast = index === options.length - 1;

          // Compute border radius for joined button effect
          const radiusStyle =
            orientation === "horizontal"
              ? {
                  borderTopLeftRadius: isFirst ? borderRadius : 0,
                  borderBottomLeftRadius: isFirst ? borderRadius : 0,
                  borderTopRightRadius: isLast ? borderRadius : 0,
                  borderBottomRightRadius: isLast ? borderRadius : 0,
                }
              : {
                  borderTopLeftRadius: isFirst ? borderRadius : 0,
                  borderTopRightRadius: isFirst ? borderRadius : 0,
                  borderBottomLeftRadius: isLast ? borderRadius : 0,
                  borderBottomRightRadius: isLast ? borderRadius : 0,
                };

          // Avoid double borders between buttons
          const borderStyle =
            orientation === "horizontal"
              ? { marginLeft: isFirst ? 0 : -1 }
              : { marginTop: isFirst ? 0 : -1 };

          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.ariaLabel}
              tabIndex={isSelected ? 0 : -1}
              disabled={disabled}
              onClick={() => !disabled && onChange(option.value)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 28,
                minHeight: 28,
                padding: "4px 8px",
                border: `1px solid ${isSelected ? theme.primary : chrome.border}`,
                background: isSelected ? theme.primary : chrome.surface,
                color: isSelected ? "#fff" : chrome.text,
                cursor: disabled ? "not-allowed" : "pointer",
                outline: "none",
                fontSize: 12,
                fontFamily: "inherit",
                ...radiusStyle,
                ...borderStyle,
                // Ensure selected button appears on top for border overlap
                position: "relative",
                zIndex: isSelected ? 1 : 0,
              }}
            >
              {option.content}
            </button>
          );
        })}
      </div>
      {label && <Label text={label} />}
    </div>
  );
}
