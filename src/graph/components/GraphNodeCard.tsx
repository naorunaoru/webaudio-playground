import type React from "react";
import type {
  ConnectionEndpoint,
  GraphNode,
  MidiEvent,
  NodeId,
  PortKind,
  PortSpec,
} from "@graph/types";
import { portKindColor } from "@graph/nodeRegistry";
import { PORT_ROW_HEIGHT } from "@graph/layout";
import { localPointFromPointerEvent, viewToWorld } from "@graph/coordinates";
import styles from "@graph/GraphEditor.module.css";
import { NodeMeter } from "./NodeMeter";

export type GraphNodeCardProps = {
  node: GraphNode;
  title: string;
  ports: readonly PortSpec[];
  isSelected: boolean;
  zIndex: number;
  audioState: AudioContextState | "off";
  midiVisible: boolean;
  connectedPorts?: ReadonlySet<string>;
  Ui: React.ComponentType<{
    node: GraphNode;
    onPatchNode: (nodeId: NodeId, patch: Partial<any>) => void;
    onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<any>) => void;
    onEmitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
    audioState?: AudioContextState | "off";
    connectedPorts?: ReadonlySet<string>;
    startBatch?: () => void;
    endBatch?: () => void;
  }>;
  rootRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<{ x: number; y: number } | null>;
  onRegisterNodeEl: (nodeId: NodeId, el: HTMLElement | null) => void;
  onSelectNode: (nodeId: NodeId) => void;
  onStartNodeDrag: (nodeId: NodeId, pointerX: number, pointerY: number) => void;
  onStartConnectionDrag: (from: ConnectionEndpoint, kind: PortKind, x: number, y: number) => void;
  onEndDrag: () => void;
  onPatchNode: (nodeId: NodeId, patch: Partial<any>) => void;
  onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<any>) => void;
  onEmitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  startBatch?: () => void;
  endBatch?: () => void;
};

export function GraphNodeCard({
  node,
  title,
  ports,
  isSelected,
  zIndex,
  audioState,
  midiVisible,
  connectedPorts,
  Ui,
  rootRef,
  scrollRef,
  onRegisterNodeEl,
  onSelectNode,
  onStartNodeDrag,
  onStartConnectionDrag,
  onEndDrag,
  onPatchNode,
  onPatchNodeEphemeral,
  onEmitMidi,
  startBatch,
  endBatch,
}: GraphNodeCardProps) {
  // Determine meter color based on node type
  const meterColor =
    node.type === "audioOut"
      ? "rgba(236, 239, 244, 1)"
      : portKindColor("audio");
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (!rootRef.current || !scrollRef.current) return;
    e.stopPropagation();
    onSelectNode(node.id);
    const p = localPointFromPointerEvent(rootRef.current, e);
    const gp = viewToWorld(p, scrollRef.current.x, scrollRef.current.y);
    onStartNodeDrag(node.id, gp.x, gp.y);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onEndDrag();
  };

  const handlePortPointerDown =
    (port: PortSpec) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!rootRef.current || !scrollRef.current) return;
      if (port.direction !== "out") return;
      const p = localPointFromPointerEvent(rootRef.current, e);
      const gp = viewToWorld(p, scrollRef.current.x, scrollRef.current.y);
      onStartConnectionDrag(
        { nodeId: node.id, portId: port.id },
        port.kind,
        gp.x,
        gp.y
      );
    };

  return (
    <div
      className={`${styles.node} ${isSelected ? styles.nodeSelected : ""}`}
      data-node-id={node.id}
      ref={(el) => onRegisterNodeEl(node.id, el)}
      style={{ left: node.x, top: node.y, zIndex }}
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
          <NodeMeter
            nodeId={node.id}
            nodeType={node.type}
            audioState={audioState}
            color={meterColor}
          />
        </div>
      </div>

      {(() => {
        const inputPorts = ports.filter((p) => p.direction === "in");
        const outputPorts = ports.filter((p) => p.direction === "out");
        const portsMinHeight = Math.max(inputPorts.length, outputPorts.length) * PORT_ROW_HEIGHT;

        const renderPort = (port: PortSpec, indexInColumn: number) => {
          const top = indexInColumn * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
          const kindColor = portKindColor(port.kind);
          const isConnected = connectedPorts?.has(port.id) ?? false;
          const dotStyle: React.CSSProperties = isConnected
            ? { background: kindColor }
            : { borderColor: kindColor };
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
                className={`${styles.portDot} ${!isConnected ? styles.portDotDisconnected : ""}`}
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
        };

        return (
          <div className={styles.nodeBody} style={{ minHeight: portsMinHeight }}>
            {inputPorts.map((port, idx) => renderPort(port, idx))}
            {outputPorts.map((port, idx) => renderPort(port, idx))}
            <Ui
              node={node}
              onPatchNode={onPatchNode}
              onPatchNodeEphemeral={onPatchNodeEphemeral}
              onEmitMidi={onEmitMidi}
              audioState={audioState}
              connectedPorts={connectedPorts}
              startBatch={startBatch}
              endBatch={endBatch}
            />
          </div>
        );
      })()}
    </div>
  );
}
