import { createContext, useContext } from "react";
import type { MenuOffset } from "./Menu";

export interface MenuContextValue {
  /** Currently focused item index */
  focusedIndex: number;
  /** Set focused item index */
  setFocusedIndex: (index: number) => void;
  /** Register a menu item, returns its index */
  registerItem: (id: string, disabled: boolean) => number;
  /** Unregister a menu item */
  unregisterItem: (id: string) => void;
  /** Close the menu */
  closeMenu: () => void;
  /** Close all menus (including parent menus) */
  closeAllMenus: () => void;
  /** Whether any submenu is currently open */
  hasOpenSubmenu: boolean;
  /** Set submenu open state */
  setHasOpenSubmenu: (open: boolean) => void;
  /** Whether the menu has checkboxes (for alignment) */
  hasCheckboxes: boolean;
  /** Register that this menu contains a checkbox */
  registerCheckbox: () => void;
}

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenuContext(): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("Menu components must be used within a Menu");
  }
  return context;
}

export interface MenuBarContextValue {
  /** Index of currently open menu bar item (-1 if none) */
  openIndex: number;
  /** Set the open menu bar item index */
  setOpenIndex: (index: number) => void;
  /** Whether any menu is currently open */
  isMenuOpen: boolean;
  /** Offset for dropdown menus */
  menuOffset?: MenuOffset;
}

export const MenuBarContext = createContext<MenuBarContextValue | null>(null);

export function useMenuBarContext(): MenuBarContextValue | null {
  return useContext(MenuBarContext);
}
