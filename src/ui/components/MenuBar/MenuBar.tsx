import { useState, useMemo, type ReactNode, type CSSProperties } from "react";
import { MenuBarContext, type MenuBarContextValue } from "../Menu/MenuContext";
import type { MenuOffset } from "../Menu/Menu";
import styles from "./MenuBar.module.css";

export interface MenuBarProps {
  children: ReactNode;
  /** Optional className for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: CSSProperties;
  /** Offset for dropdown menus (e.g., { y: 4 } for a 4px gap) */
  menuOffset?: MenuOffset;
}

export function MenuBar({ children, className, style, menuOffset }: MenuBarProps) {
  const [openIndex, setOpenIndex] = useState(-1);

  const contextValue = useMemo<MenuBarContextValue>(
    () => ({
      openIndex,
      setOpenIndex,
      isMenuOpen: openIndex >= 0,
      menuOffset,
    }),
    [openIndex, menuOffset]
  );

  const combinedClassName = className
    ? `${styles.menuBar} ${className}`
    : styles.menuBar;

  return (
    <MenuBarContext.Provider value={contextValue}>
      <div className={combinedClassName} style={style} role="menubar">
        {children}
      </div>
    </MenuBarContext.Provider>
  );
}
