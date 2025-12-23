import { useRef, useState } from "react";
import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type MidiSourceNode = Extract<GraphNode, { type: "midiSource" }>;

function defaultState(): MidiSourceNode["state"] {
  return {
    note: 60,
    velocity: 100,
    channel: 1,
    isEmitting: false,
    lastTriggeredAtMs: null,
  };
}

const MidiSourceUi: React.FC<NodeUiProps<MidiSourceNode>> = ({
  node,
  onPatchNode,
  onEmitMidi,
}) => {
  const [isHeld, setIsHeld] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          aria-pressed={isHeld}
          style={{
            background: isHeld ? "rgba(180, 142, 173, 0.18)" : undefined,
            borderColor: isHeld ? "rgba(180, 142, 173, 0.55)" : undefined,
          }}
          onPointerDown={(e) => {
            if (activePointerIdRef.current != null) return;
            activePointerIdRef.current = e.pointerId;
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
            setIsHeld(true);

            const atMs = performance.now();
            onPatchNode(node.id, { isEmitting: true, lastTriggeredAtMs: atMs });
            onEmitMidi?.(node.id, {
              type: "noteOn",
              note: node.state.note,
              velocity: node.state.velocity,
              channel: node.state.channel,
              atMs,
            });
          }}
          onPointerUp={(e) => {
            if (activePointerIdRef.current !== e.pointerId) return;
            activePointerIdRef.current = null;
            (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
            setIsHeld(false);

            const atMs = performance.now();
            onPatchNode(node.id, { isEmitting: false });
            onEmitMidi?.(node.id, {
              type: "noteOff",
              note: node.state.note,
              channel: node.state.channel,
              atMs,
            });
          }}
          onPointerCancel={() => {
            if (activePointerIdRef.current == null) return;
            activePointerIdRef.current = null;
            setIsHeld(false);
            const atMs = performance.now();
            onPatchNode(node.id, { isEmitting: false });
            onEmitMidi?.(node.id, {
              type: "noteOff",
              note: node.state.note,
              channel: node.state.channel,
              atMs,
            });
          }}
          onPointerLeave={() => {
            if (activePointerIdRef.current == null) return;
            activePointerIdRef.current = null;
            setIsHeld(false);
            const atMs = performance.now();
            onPatchNode(node.id, { isEmitting: false });
            onEmitMidi?.(node.id, {
              type: "noteOff",
              note: node.state.note,
              channel: node.state.channel,
              atMs,
            });
          }}
        >
          Trigger
        </button>
        <span style={{ opacity: 0.75, fontSize: 12 }}>note {node.state.note}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Note</span>
          <input
            type="number"
            min={0}
            max={127}
            value={node.state.note}
            onChange={(e) => onPatchNode(node.id, { note: Number(e.target.value) })}
            style={{ width: 64 }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Vel</span>
          <input
            type="number"
            min={1}
            max={127}
            value={node.state.velocity}
            onChange={(e) => onPatchNode(node.id, { velocity: Number(e.target.value) })}
            style={{ width: 64 }}
          />
        </label>
      </div>
    </div>
  );
};

export const midiSourceGraph: NodeDefinition<MidiSourceNode> = {
  type: "midiSource",
  title: "MIDI Source",
  defaultState,
  ports: () => [{ id: "midi_out", name: "MIDI", kind: "midi", direction: "out" }],
  ui: MidiSourceUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiSourceNode["state"]>;
    const d = defaultState();
    return {
      note: s.note ?? d.note,
      velocity: s.velocity ?? d.velocity,
      channel: s.channel ?? d.channel,
      isEmitting: s.isEmitting ?? d.isEmitting,
      lastTriggeredAtMs: s.lastTriggeredAtMs ?? d.lastTriggeredAtMs,
    };
  },
};
