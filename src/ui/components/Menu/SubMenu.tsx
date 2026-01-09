import {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../context";
import { useMenuContext, MenuContext, type MenuContextValue } from "./MenuContext";
import styles from "./Menu.module.css";

export interface SubMenuProps {
  /** Submenu label */
  label: string;
  /** Leading icon */
  icon?: ReactNode;
  /** Whether the submenu is disabled */
  disabled?: boolean;
  /** Submenu contents */
  children: ReactNode;
}

function ChevronRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2.5L8 6L4.5 9.5" />
    </svg>
  );
}

export function SubMenu({
  label,
  icon,
  disabled = false,
  children,
}: SubMenuProps) {
  const { theme, chrome } = useTheme();
  const id = useId();
  const parentContext = useMenuContext();
  const {
    focusedIndex,
    setFocusedIndex,
    registerItem,
    unregisterItem,
    closeAllMenus,
    setHasOpenSubmenu,
    hasCheckboxes: parentHasCheckboxes,
  } = parentContext;

  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  // Submenu item state
  const [submenuFocusedIndex, setSubmenuFocusedIndex] = useState(-1);
  const [submenuHasOpenSubmenu, setSubmenuHasOpenSubmenu] = useState(false);
  const [submenuHasCheckboxes, setSubmenuHasCheckboxes] = useState(false);
  const submenuItemsRef = useRef<Map<string, { id: string; disabled: boolean; index: number }>>(new Map());
  const submenuNextIndexRef = useRef(0);

  const itemIndex = registerItem(id, disabled);

  useEffect(() => {
    return () => unregisterItem(id);
  }, [id, unregisterItem]);

  useEffect(() => {
    registerItem(id, disabled);
  }, [id, disabled, registerItem]);

  const isFocused = focusedIndex === itemIndex;

  // Calculate submenu position
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const calculatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const viewportPadding = 8;

      let top = rect.top - 4;
      let left = rect.right + 2;

      // Check if submenu would overflow right edge
      if (menuRef.current) {
        const menuWidth = menuRef.current.offsetWidth || 180;
        if (left + menuWidth > window.innerWidth - viewportPadding) {
          left = rect.left - menuWidth - 2;
        }

        // Check vertical overflow
        const menuHeight = menuRef.current.offsetHeight || 200;
        if (top + menuHeight > window.innerHeight - viewportPadding) {
          top = window.innerHeight - menuHeight - viewportPadding;
        }
      }

      setPosition({ top, left });
    };

    calculatePosition();
    requestAnimationFrame(calculatePosition);
  }, [isOpen]);

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Notify parent when submenu opens/closes
  useEffect(() => {
    setHasOpenSubmenu(isOpen);
  }, [isOpen, setHasOpenSubmenu]);

  // Reset submenu state when it opens
  useEffect(() => {
    if (isOpen) {
      setSubmenuFocusedIndex(-1);
      setSubmenuHasOpenSubmenu(false);
      setSubmenuHasCheckboxes(false);
      submenuNextIndexRef.current = 0;
      submenuItemsRef.current.clear();
    }
  }, [isOpen]);

  const openSubmenu = useCallback(() => {
    if (disabled) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, [disabled]);

  const closeSubmenu = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handlePointerEnter = useCallback(() => {
    if (disabled) return;
    setFocusedIndex(itemIndex);

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    openTimeoutRef.current = window.setTimeout(() => {
      openSubmenu();
    }, 200);
  }, [disabled, itemIndex, setFocusedIndex, openSubmenu]);

  const handlePointerLeave = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      if (!submenuHasOpenSubmenu) {
        closeSubmenu();
      }
    }, 300);
  }, [closeSubmenu, submenuHasOpenSubmenu]);

  const handleSubmenuPointerEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleSubmenuPointerLeave = useCallback(() => {
    closeTimeoutRef.current = window.setTimeout(() => {
      if (!submenuHasOpenSubmenu) {
        closeSubmenu();
      }
    }, 300);
  }, [closeSubmenu, submenuHasOpenSubmenu]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        openSubmenu();
      }
    },
    [openSubmenu]
  );

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const registerSubmenuItem = useCallback((itemId: string, itemDisabled: boolean) => {
    const existing = submenuItemsRef.current.get(itemId);
    if (existing) {
      existing.disabled = itemDisabled;
      return existing.index;
    }
    const index = submenuNextIndexRef.current++;
    submenuItemsRef.current.set(itemId, { id: itemId, disabled: itemDisabled, index });
    return index;
  }, []);

  const unregisterSubmenuItem = useCallback((itemId: string) => {
    submenuItemsRef.current.delete(itemId);
  }, []);

  const registerSubmenuCheckbox = useCallback(() => {
    setSubmenuHasCheckboxes(true);
  }, []);

  const submenuContextValue: MenuContextValue = {
    focusedIndex: submenuFocusedIndex,
    setFocusedIndex: setSubmenuFocusedIndex,
    registerItem: registerSubmenuItem,
    unregisterItem: unregisterSubmenuItem,
    closeMenu: closeSubmenu,
    closeAllMenus,
    hasOpenSubmenu: submenuHasOpenSubmenu,
    setHasOpenSubmenu: setSubmenuHasOpenSubmenu,
    hasCheckboxes: submenuHasCheckboxes,
    registerCheckbox: registerSubmenuCheckbox,
  };

  const triggerStyle = {
    background: isFocused ? theme.primary : "transparent",
    color: isFocused ? "#fff" : chrome.text,
  };

  const submenuStyle = {
    position: "fixed" as const,
    top: position.top,
    left: position.left,
    minWidth: 180,
    padding: "4px 0",
    borderRadius: 8,
    zIndex: 1001,
    background: chrome.popover,
    border: `1px solid ${chrome.border}`,
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
    color: chrome.text,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "scale(1)" : "scale(0.95)",
    transformOrigin: "top left",
    transition: "opacity 150ms ease-out, transform 150ms ease-out",
  };

  // Show leading spacer when parent menu has checkboxes (for alignment)
  // but not if this submenu has its own icon
  const showLeadingSpacer = parentHasCheckboxes && !icon;

  return (
    <>
      <div
        ref={triggerRef}
        className={styles.menuItem}
        style={triggerStyle}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        tabIndex={-1}
        data-disabled={disabled}
        data-focused={isFocused}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
      >
        {showLeadingSpacer && <span className={styles.checkmark} />}
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.label}>{label}</span>
        <span className={styles.submenuArrow}>
          <ChevronRightIcon />
        </span>
      </div>

      {isOpen &&
        createPortal(
          <MenuContext.Provider value={submenuContextValue}>
            <div
              ref={menuRef}
              style={submenuStyle}
              role="menu"
              onPointerEnter={handleSubmenuPointerEnter}
              onPointerLeave={handleSubmenuPointerLeave}
            >
              {children}
            </div>
          </MenuContext.Provider>,
          document.body
        )}
    </>
  );
}
