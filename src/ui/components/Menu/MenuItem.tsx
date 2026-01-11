import { useEffect, useId, useCallback, type ReactNode } from "react";
import { useTheme } from "@ui/context";
import { useMenuContext } from "./MenuContext";
import styles from "./Menu.module.css";

export interface MenuItemProps {
  /** Click handler */
  onClick?: () => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Keyboard shortcut label */
  shortcut?: string;
  /** Leading icon */
  icon?: ReactNode;
  /** Item label */
  children: ReactNode;
}

export function MenuItem({
  onClick,
  disabled = false,
  shortcut,
  icon,
  children,
}: MenuItemProps) {
  const { theme, chrome } = useTheme();
  const id = useId();
  const {
    focusedIndex,
    setFocusedIndex,
    registerItem,
    unregisterItem,
    closeAllMenus,
    hasCheckboxes,
  } = useMenuContext();

  const itemIndex = registerItem(id, disabled);

  useEffect(() => {
    return () => unregisterItem(id);
  }, [id, unregisterItem]);

  // Update registration when disabled changes
  useEffect(() => {
    registerItem(id, disabled);
  }, [id, disabled, registerItem]);

  const isFocused = focusedIndex === itemIndex;

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick?.();
    closeAllMenus();
  }, [disabled, onClick, closeAllMenus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const handlePointerEnter = useCallback(() => {
    if (!disabled) {
      setFocusedIndex(itemIndex);
    }
  }, [disabled, itemIndex, setFocusedIndex]);

  const style = {
    background: isFocused ? theme.primary : "transparent",
    color: isFocused ? "#fff" : chrome.text,
  };

  // Show leading spacer when menu has checkboxes (for alignment)
  // but not if this item has its own icon
  const showLeadingSpacer = hasCheckboxes && !icon;

  return (
    <div
      className={styles.menuItem}
      style={style}
      role="menuitem"
      tabIndex={-1}
      data-disabled={disabled}
      data-focused={isFocused}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePointerEnter}
    >
      {showLeadingSpacer && <span className={styles.checkmark} />}
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
      {shortcut && (
        <span className={styles.shortcut} style={{ color: chrome.textMuted }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
