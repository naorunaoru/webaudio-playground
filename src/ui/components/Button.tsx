import { useId, type ReactNode, type ButtonHTMLAttributes } from "react";
import { useTheme } from "../context";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children?: ReactNode;
  variant?: "default" | "primary";
}

export function Button({
  children,
  variant = "default",
  disabled = false,
  style,
  className,
  ...props
}: ButtonProps) {
  const { theme, chrome } = useTheme();
  const id = useId();
  const buttonClass = `btn-${id.replace(/:/g, "")}`;

  const isPrimary = variant === "primary";

  return (
    <>
      <style>{`
        .${buttonClass}:active:not(:disabled),
        .${buttonClass}[aria-pressed="true"] {
          background: ${theme.primary}30 !important;
          border-color: ${theme.primary}90 !important;
        }
      `}</style>
      <button
        type="button"
        disabled={disabled}
        className={className ? `${buttonClass} ${className}` : buttonClass}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 28,
          minHeight: 28,
          padding: "4px 8px",
          border: `1px solid ${isPrimary ? theme.primary : chrome.border}`,
          borderRadius: 4,
          background: isPrimary ? theme.primary : chrome.surface,
          color: isPrimary ? "#fff" : chrome.text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          outline: "none",
          fontSize: 12,
          fontFamily: "inherit",
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    </>
  );
}
