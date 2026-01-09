import { useEffect, useId, useCallback, type ReactNode } from "react";
import { useTheme } from "../../context";
import { useMenuContext } from "./MenuContext";
import styles from "./Menu.module.css";

export interface MenuItemCheckboxProps {
  /** Whether the checkbox is checked */
  checked: boolean;
  /** Called when the checkbox state changes */
  onChange: (checked: boolean) => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Keyboard shortcut label */
  shortcut?: string;
  /** Item label */
  children: ReactNode;
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
    </svg>
  );
}

export function MenuItemCheckbox({
  checked,
  onChange,
  disabled = false,
  shortcut,
  children,
}: MenuItemCheckboxProps) {
  const { theme, chrome } = useTheme();
  const id = useId();
  const {
    focusedIndex,
    setFocusedIndex,
    registerItem,
    unregisterItem,
    registerCheckbox,
  } = useMenuContext();

  const itemIndex = registerItem(id, disabled);

  useEffect(() => {
    registerCheckbox();
    return () => unregisterItem(id);
  }, [id, unregisterItem, registerCheckbox]);

  useEffect(() => {
    registerItem(id, disabled);
  }, [id, disabled, registerItem]);

  const isFocused = focusedIndex === itemIndex;

  const handleClick = useCallback(() => {
    if (disabled) return;
    onChange(!checked);
  }, [disabled, onChange, checked]);

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

  return (
    <div
      className={styles.menuItem}
      style={style}
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      data-disabled={disabled}
      data-focused={isFocused}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePointerEnter}
    >
      <span className={styles.checkmark}>
        {checked && <CheckIcon />}
      </span>
      <span className={styles.label}>{children}</span>
      {shortcut && (
        <span className={styles.shortcut} style={{ color: chrome.textMuted }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
