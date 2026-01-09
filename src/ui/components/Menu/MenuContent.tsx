import type { ReactNode } from "react";
import styles from "./Menu.module.css";

export interface MenuContentProps {
  children: ReactNode;
}

/**
 * Wrapper for arbitrary content inside a menu.
 * Use this to embed controls like knobs, sliders, or other custom UI.
 */
export function MenuContent({ children }: MenuContentProps) {
  return (
    <div className={styles.menuContent} role="presentation">
      {children}
    </div>
  );
}
