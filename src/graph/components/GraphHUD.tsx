import styles from "@graph/GraphEditor.module.css";

export type GraphHUDProps = {
  status: string | null;
};

export function GraphHUD({ status }: GraphHUDProps) {
  return (
    <div className={styles.hud}>
      <div className={styles.hint}>
        Drag nodes. Drag from an output port to an input port to connect. Click
        a wire (or node header) and press Delete to remove.
      </div>
      {status ? <div className={styles.hint}>{status}</div> : null}
    </div>
  );
}
