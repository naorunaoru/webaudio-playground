import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./FloatingPanel.module.css";

export interface FloatingPanelProps {
  title: string;
  open: boolean;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** Enable horizontal resize handle on the right edge. */
  resizable?: boolean;
  /** Initial width when resizable (default: 420). */
  defaultWidth?: number;
  /** Minimum width when resizable (default: 120). */
  minWidth?: number;
  children: ReactNode;
}

export function FloatingPanel({
  title,
  open,
  onClose,
  defaultPosition,
  position: controlledPosition,
  onPositionChange,
  resizable = false,
  defaultWidth = 420,
  minWidth = 120,
  children,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [internalPosition, setInternalPosition] = useState(() => ({
    x: controlledPosition?.x ?? defaultPosition?.x ?? 100,
    y: controlledPosition?.y ?? defaultPosition?.y ?? 100,
  }));
  const [isVisible, setIsVisible] = useState(false);
  const [width, setWidth] = useState(defaultWidth);

  // Use controlled position if provided, otherwise internal
  const position = controlledPosition ?? internalPosition;
  const setPosition = useCallback(
    (pos: { x: number; y: number }) => {
      setInternalPosition(pos);
      onPositionChange?.(pos);
    },
    [onPositionChange]
  );

  // Animation on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // Clamp position to viewport on mount and resize
  useEffect(() => {
    if (!open) return;

    const clampToViewport = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const padding = 8;

      let { x, y } = position;

      if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
      }
      if (y + rect.height > window.innerHeight - padding) {
        y = window.innerHeight - rect.height - padding;
      }
      if (x < padding) x = padding;
      if (y < padding) y = padding;

      if (x !== position.x || y !== position.y) {
        setPosition({ x, y });
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [open, position]);

  const handleHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      e.preventDefault();
      const panel = panelRef.current;
      if (!panel) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startPosX = position.x;
      const startPosY = position.y;

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const rect = panel.getBoundingClientRect();
        const padding = 8;

        let newX = startPosX + deltaX;
        let newY = startPosY + deltaY;

        // Clamp to viewport
        if (newX + rect.width > window.innerWidth - padding) {
          newX = window.innerWidth - rect.width - padding;
        }
        if (newY + rect.height > window.innerHeight - padding) {
          newY = window.innerHeight - rect.height - padding;
        }
        if (newX < padding) newX = padding;
        if (newY < padding) newY = padding;

        setPosition({ x: newX, y: newY });
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [position]
  );

  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = width;

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const newWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
        setWidth(newWidth);
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [width, minWidth]
  );

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={styles.panel}
      style={{
        left: position.x,
        top: position.y,
        ...(resizable ? { width } : undefined),
      }}
      data-open={isVisible}
    >
      <div
        className={styles.header}
        onPointerDown={handleHeaderPointerDown}
      >
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M1.5 0.5L5 4L8.5 0.5L9.5 1.5L6 5L9.5 8.5L8.5 9.5L5 6L1.5 9.5L0.5 8.5L4 5L0.5 1.5L1.5 0.5Z" />
          </svg>
        </button>
      </div>
      <div className={styles.content}>{children}</div>
      {resizable && (
        <div
          className={styles.resizeHandle}
          onPointerDown={handleResizePointerDown}
        />
      )}
    </div>,
    document.body
  );
}
