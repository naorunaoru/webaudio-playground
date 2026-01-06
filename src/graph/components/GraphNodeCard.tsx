import type React from "react";
import type {
  DragState,
  GraphNode,
  MidiEvent,
  NodeId,
  PortSpec,
} from "../types";
import { portKindColor } from "../nodeRegistry";
import { PORT_ROW_HEIGHT } from "../layout";
import { localPointFromPointerEvent, viewToWorld } from "../coordinates";
import styles from "../GraphEditor.module.css";

export type GraphNodeCardProps = {
  node: GraphNode;
  title: string;
  ports: readonly PortSpec[];
  isSelected: boolean;
  zIndex: number;
  meterVisible: boolean;
  meterColor: string;
  meterOpacity: number;
  midiVisible: boolean;
  Ui: React.ComponentType<{
    node: GraphNode;
    onPatchNode: (nodeId: NodeId, patch: Partial<any>) => void;
    onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<any>) => void;
    onEmitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
    runtimeState: unknown;
    startBatch?: () => void;
    endBatch?: () => void;
  }>;
  runtimeState: unknown;
  rootRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<{ x: number; y: number } | null>;
  onRegisterNodeEl: (nodeId: NodeId, el: HTMLElement | null) => void;
  onSelectNode: (nodeId: NodeId) => void;
  onStartDrag: (drag: DragState) => void;
  onPatchNode: (nodeId: NodeId, patch: Partial<any>) => void;
  onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<any>) => void;
  onEmitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  startBatch?: () => void;
  endBatch?: () => void;
  onOpenContextMenu?: (nodeId: NodeId, x: number, y: number) => void;
};

export function GraphNodeCard({
  node,
  title,
  ports,
  isSelected,
  zIndex,
  meterVisible,
  meterColor,
  meterOpacity,
  midiVisible,
  Ui,
  runtimeState,
  rootRef,
  scrollRef,
  onRegisterNodeEl,
  onSelectNode,
  onStartDrag,
  onPatchNode,
  onPatchNodeEphemeral,
  onEmitMidi,
  startBatch,
  endBatch,
  onOpenContextMenu,
}: GraphNodeCardProps) {
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (!rootRef.current || !scrollRef.current) return;
    e.stopPropagation();
    onSelectNode(node.id);
    const p = localPointFromPointerEvent(rootRef.current, e);
    const gp = viewToWorld(p, scrollRef.current.x, scrollRef.current.y);
    onStartDrag({
      type: "moveNode",
      nodeId: node.id,
      offsetX: gp.x - node.x,
      offsetY: gp.y - node.y,
    });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onStartDrag({ type: "none" });
  };

  const handlePortPointerDown =
    (port: PortSpec) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!rootRef.current || !scrollRef.current) return;
      if (port.direction !== "out") return;
      const p = localPointFromPointerEvent(rootRef.current, e);
      const gp = viewToWorld(p, scrollRef.current.x, scrollRef.current.y);
      onStartDrag({
        type: "connect",
        from: { nodeId: node.id, portId: port.id },
        kind: port.kind,
        toX: gp.x,
        toY: gp.y,
      });
    };

  return (
    <div
      className={`${styles.node} ${isSelected ? styles.nodeSelected : ""}`}
      data-node-id={node.id}
      ref={(el) => onRegisterNodeEl(node.id, el)}
      style={{ left: node.x, top: node.y, zIndex }}
      onContextMenu={(e) => {
        if (!onOpenContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onSelectNode(node.id);
        onOpenContextMenu(node.id, e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelectNode(node.id);
      }}
    >
      <div
        className={styles.nodeHeader}
        onPointerDown={handleHeaderPointerDown}
        onPointerUp={handleHeaderPointerUp}
      >
        <div className={styles.nodeTitle}>{title}</div>
        <div className={styles.nodeIndicators}>
          <div
            className={`${styles.indicatorDot} ${
              midiVisible ? styles.indicatorDotVisible : ""
            }`}
            style={{ background: portKindColor("midi") }}
          />
          <div
            className={`${styles.indicatorDot} ${
              meterVisible ? styles.indicatorDotVisible : ""
            }`}
            style={{
              background: meterColor,
              opacity: meterVisible ? meterOpacity : 0,
            }}
          />
        </div>
      </div>

      <div className={styles.nodeBody}>
        {ports.map((port, index) => {
          const top = index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
          const kindColor = portKindColor(port.kind);
          const dotStyle: React.CSSProperties = { borderColor: kindColor };
          const dotDataProps = {
            "data-port": "1",
            "data-node-id": node.id,
            "data-port-id": port.id,
            "data-port-direction": port.direction,
            "data-port-kind": port.kind,
          } as const;

          return (
            <div
              key={port.id}
              className={`${styles.portRow} ${
                port.direction === "in" ? styles.portIn : styles.portOut
              }`}
              style={{ top }}
            >
              <div
                {...dotDataProps}
                className={styles.portDot}
                style={dotStyle}
                onPointerDown={
                  port.direction === "out"
                    ? handlePortPointerDown(port)
                    : undefined
                }
              />
              <div className={styles.portLabel}>{port.name}</div>
            </div>
          );
        })}
        <Ui
          node={node}
          onPatchNode={onPatchNode}
          onPatchNodeEphemeral={onPatchNodeEphemeral}
          onEmitMidi={onEmitMidi}
          runtimeState={runtimeState}
          startBatch={startBatch}
          endBatch={endBatch}
        />
      </div>
    </div>
  );
}
