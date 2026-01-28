import styles from "./GraphHUD.module.css";

export type GraphHUDProps = {
  status: string | null;
};

export function GraphHUD({ status }: GraphHUDProps) {
  return status ? (
    <div className={styles.hud}>
      <div className={styles.hint}>{status}</div>
    </div>
  ) : null;
}
