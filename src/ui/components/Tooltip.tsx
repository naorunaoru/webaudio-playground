import { useState, useRef, useCallback, type ReactNode } from "react";
import { useTheme } from "../context";

export interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Show tooltip while dragging (controlled externally) */
  forceVisible?: boolean;
}

export function Tooltip({ content, children, forceVisible = false }: TooltipProps) {
  const { chrome } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visible = isHovered || forceVisible;

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {children}
      {visible && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 4,
            padding: "3px 6px",
            fontSize: 10,
            fontFamily: "monospace",
            color: chrome.text,
            background: chrome.popover,
            border: `1px solid ${chrome.track}`,
            borderRadius: 3,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
