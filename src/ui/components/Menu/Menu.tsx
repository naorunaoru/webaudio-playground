import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@ui/context";
import { MenuContext, type MenuContextValue } from "./MenuContext";
import styles from "./Menu.module.css";

export type MenuPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end"
  | "left-start"
  | "left-end";

export interface MenuOffset {
  x?: number;
  y?: number;
}

export interface MenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Called when the menu should close */
  onClose: () => void;
  /** Anchor element for positioning (for dropdowns) */
  anchorEl?: HTMLElement | null;
  /** Anchor position for positioning (for context menus) */
  anchorPosition?: { x: number; y: number };
  /** Placement relative to anchor */
  placement?: MenuPlacement;
  /** Offset from the anchor position */
  offset?: MenuOffset;
  /** Menu contents */
  children: ReactNode;
  /** Called when all menus should close (including parent menus) */
  onCloseAll?: () => void;
  /** Whether this is a submenu */
  isSubmenu?: boolean;
}

interface ItemRegistration {
  id: string;
  disabled: boolean;
  index: number;
}

export function Menu({
  open,
  onClose,
  anchorEl,
  anchorPosition,
  placement = "bottom-start",
  offset,
  children,
  onCloseAll,
  isSubmenu = false,
}: MenuProps) {
  const { chrome, theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [hasOpenSubmenu, setHasOpenSubmenu] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [isVisible, setIsVisible] = useState(false);
  const [hasCheckboxes, setHasCheckboxes] = useState(false);
  const itemsRef = useRef<Map<string, ItemRegistration>>(new Map());
  const nextIndexRef = useRef(0);

  // Reset state when menu opens/closes
  useEffect(() => {
    if (open) {
      setFocusedIndex(-1);
      setHasOpenSubmenu(false);
      setHasCheckboxes(false);
      nextIndexRef.current = 0;
      itemsRef.current.clear();
      // Delay visibility for animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // Calculate position
  useEffect(() => {
    if (!open) return;

    const calculatePosition = () => {
      const viewportPadding = 8;
      let top = 0;
      let left = 0;

      if (anchorPosition) {
        top = anchorPosition.y;
        left = anchorPosition.x;
      } else if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();

        switch (placement) {
          case "bottom-start":
            top = rect.bottom;
            left = rect.left;
            break;
          case "bottom-end":
            top = rect.bottom;
            left = rect.right;
            break;
          case "top-start":
            top = rect.top;
            left = rect.left;
            break;
          case "top-end":
            top = rect.top;
            left = rect.right;
            break;
          case "right-start":
            top = rect.top;
            left = rect.right;
            break;
          case "right-end":
            top = rect.bottom;
            left = rect.right;
            break;
          case "left-start":
            top = rect.top;
            left = rect.left;
            break;
          case "left-end":
            top = rect.bottom;
            left = rect.left;
            break;
        }
      }

      // Apply offset
      top += offset?.y ?? 0;
      left += offset?.x ?? 0;

      // Adjust for viewport boundaries
      const menuEl = menuRef.current;
      if (menuEl) {
        const menuRect = menuEl.getBoundingClientRect();

        // Right edge
        if (left + menuRect.width > window.innerWidth - viewportPadding) {
          left = window.innerWidth - menuRect.width - viewportPadding;
        }

        // Bottom edge
        if (top + menuRect.height > window.innerHeight - viewportPadding) {
          top = window.innerHeight - menuRect.height - viewportPadding;
        }

        // Left edge
        if (left < viewportPadding) {
          left = viewportPadding;
        }

        // Top edge
        if (top < viewportPadding) {
          top = viewportPadding;
        }
      }

      setPosition({ top, left });
    };

    calculatePosition();
    // Recalculate after menu renders to get accurate dimensions
    requestAnimationFrame(calculatePosition);
  }, [open, anchorEl, anchorPosition, placement, offset]);

  // Focus management
  useEffect(() => {
    if (open && menuRef.current) {
      menuRef.current.focus();
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open || isSubmenu) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Check if click is on the anchor element
        if (anchorEl && anchorEl.contains(e.target as Node)) {
          return;
        }
        onClose();
      }
    };

    // Use capture phase to handle click before other handlers
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorEl, isSubmenu]);

  const getEnabledItems = useCallback(() => {
    return Array.from(itemsRef.current.values())
      .filter((item) => !item.disabled)
      .sort((a, b) => a.index - b.index);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledItems = getEnabledItems();
      if (enabledItems.length === 0) return;

      const currentEnabledIndex = enabledItems.findIndex(
        (item) => item.index === focusedIndex
      );

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex =
            currentEnabledIndex < enabledItems.length - 1
              ? enabledItems[currentEnabledIndex + 1].index
              : enabledItems[0].index;
          setFocusedIndex(nextIndex);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex =
            currentEnabledIndex > 0
              ? enabledItems[currentEnabledIndex - 1].index
              : enabledItems[enabledItems.length - 1].index;
          setFocusedIndex(prevIndex);
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(enabledItems[0].index);
          break;
        }
        case "End": {
          e.preventDefault();
          setFocusedIndex(enabledItems[enabledItems.length - 1].index);
          break;
        }
        case "ArrowLeft": {
          if (isSubmenu) {
            e.preventDefault();
            onClose();
          }
          break;
        }
      }
    },
    [focusedIndex, getEnabledItems, isSubmenu, onClose]
  );

  const registerItem = useCallback((id: string, disabled: boolean) => {
    const existing = itemsRef.current.get(id);
    if (existing) {
      existing.disabled = disabled;
      return existing.index;
    }

    const index = nextIndexRef.current++;
    itemsRef.current.set(id, { id, disabled, index });
    return index;
  }, []);

  const unregisterItem = useCallback((id: string) => {
    itemsRef.current.delete(id);
  }, []);

  const closeMenu = useCallback(() => {
    onClose();
  }, [onClose]);

  const closeAllMenus = useCallback(() => {
    if (onCloseAll) {
      onCloseAll();
    } else {
      onClose();
    }
  }, [onClose, onCloseAll]);

  const registerCheckbox = useCallback(() => {
    setHasCheckboxes(true);
  }, []);

  const contextValue = useMemo<MenuContextValue>(
    () => ({
      focusedIndex,
      setFocusedIndex,
      registerItem,
      unregisterItem,
      closeMenu,
      closeAllMenus,
      hasOpenSubmenu,
      setHasOpenSubmenu,
      hasCheckboxes,
      registerCheckbox,
    }),
    [
      focusedIndex,
      registerItem,
      unregisterItem,
      closeMenu,
      closeAllMenus,
      hasOpenSubmenu,
      hasCheckboxes,
      registerCheckbox,
    ]
  );

  const menuStyle: CSSProperties = {
    top: position.top,
    left: position.left,
    background: `color-mix(in srgb, color-mix(in srgb, ${chrome.popover} 90%, ${theme.primary}) 40%, transparent)`,
    backdropFilter: "blur(20px)",
    border: `1px solid ${chrome.border}`,
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
    color: chrome.text,
  };

  if (!open) return null;

  return createPortal(
    <MenuContext.Provider value={contextValue}>
      <div
        ref={menuRef}
        className={styles.menu}
        style={menuStyle}
        data-open={isVisible}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </MenuContext.Provider>,
    document.body
  );
}
