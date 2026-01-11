import {
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "@ui/context";
import { useMenuBarContext } from "@ui/components/Menu/MenuContext";
import { Menu } from "@ui/components/Menu/Menu";
import styles from "./MenuBar.module.css";

export interface MenuBarItemProps {
  /** Label displayed in the menu bar */
  label: string;
  /** Menu contents */
  children: ReactNode;
  /** Index of this item in the menu bar (automatically set) */
  index?: number;
}

export function MenuBarItem({ label, children, index = 0 }: MenuBarItemProps) {
  const { theme, chrome } = useTheme();
  const menuBarContext = useMenuBarContext();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [localOpen, setLocalOpen] = useState(false);

  // Use menu bar context if available, otherwise use local state
  const isOpen = menuBarContext ? menuBarContext.openIndex === index : localOpen;
  const isAnyMenuOpen = menuBarContext?.isMenuOpen ?? false;
  // Get offset from menu bar context
  const menuOffset = menuBarContext?.menuOffset;

  const open = useCallback(() => {
    if (menuBarContext) {
      menuBarContext.setOpenIndex(index);
    } else {
      setLocalOpen(true);
    }
  }, [menuBarContext, index]);

  const close = useCallback(() => {
    if (menuBarContext) {
      menuBarContext.setOpenIndex(-1);
    } else {
      setLocalOpen(false);
    }
  }, [menuBarContext]);

  const handleClick = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  const handlePointerEnter = useCallback(() => {
    // Only switch on hover if another menu is already open (macOS behavior)
    if (isAnyMenuOpen && !isOpen) {
      open();
    }
  }, [isAnyMenuOpen, isOpen, open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
        case " ":
        case "ArrowDown":
          e.preventDefault();
          open();
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [open, close]
  );

  const style = {
    background: isOpen ? theme.primary : "transparent",
    color: isOpen ? "#fff" : chrome.text,
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.menuBarItem}
        style={style}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onKeyDown={handleKeyDown}
      >
        {label}
      </button>
      <Menu
        open={isOpen}
        onClose={close}
        anchorEl={triggerRef.current}
        placement="bottom-start"
        offset={menuOffset}
        onCloseAll={close}
      >
        {children}
      </Menu>
    </>
  );
}
