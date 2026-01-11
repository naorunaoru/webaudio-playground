import { useTheme } from "@ui/context";
import styles from "./Menu.module.css";

export function MenuSeparator() {
  const { chrome } = useTheme();

  return (
    <div
      className={styles.separator}
      style={{ background: chrome.border }}
      role="separator"
    />
  );
}
