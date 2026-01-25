import { useRef, useState } from "react";
import type { GraphNode } from "@graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "@/types/graphNodeDefinition";
import { Button, MidiNoteInput, NumericInput } from "@ui/components";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";

const midiTheme: ControlTheme = {
  primary: "#a855f7", // Purple - MIDI/music
  secondary: "#c084fc",
  tertiary: "#9333ea",
};

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
  startBatch,
  endBatch,
}) => {
  const [isHeld, setIsHeld] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);

  return (
    <ThemeProvider theme={midiTheme}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Button
            aria-pressed={isHeld}
            onPointerDown={async (e) => {
              e.stopPropagation();
              if (activePointerIdRef.current != null) return;
              activePointerIdRef.current = e.pointerId;
              (e.currentTarget as HTMLButtonElement).setPointerCapture(
                e.pointerId
              );
              setIsHeld(true);

              await onEmitMidi?.(node.id, {
                type: "noteOn",
                note: node.state.note,
                velocity: node.state.velocity,
                channel: node.state.channel,
              });
            }}
            onPointerUp={async (e) => {
              if (activePointerIdRef.current !== e.pointerId) return;
              activePointerIdRef.current = null;
              (e.currentTarget as HTMLButtonElement).releasePointerCapture(
                e.pointerId
              );
              setIsHeld(false);

              await onEmitMidi?.(node.id, {
                type: "noteOff",
                note: node.state.note,
                channel: node.state.channel,
              });
            }}
            onPointerCancel={() => {
              if (activePointerIdRef.current == null) return;
              activePointerIdRef.current = null;
              setIsHeld(false);
              void onEmitMidi?.(node.id, {
                type: "noteOff",
                note: node.state.note,
                channel: node.state.channel,
              });
            }}
            onPointerLeave={() => {
              if (activePointerIdRef.current == null) return;
              activePointerIdRef.current = null;
              setIsHeld(false);
              void onEmitMidi?.(node.id, {
                type: "noteOff",
                note: node.state.note,
                channel: node.state.channel,
              });
            }}
          >
            Trigger
          </Button>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <MidiNoteInput
            value={node.state.note}
            onChange={(v) => onPatchNode(node.id, { note: v })}
            label="Note"
            width={48}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <NumericInput
            value={node.state.velocity}
            onChange={(v) => onPatchNode(node.id, { velocity: v })}
            min={1}
            max={127}
            step={1}
            label="Vel"
            format={(v) => Math.round(v).toString()}
            width={48}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>
      </div>
    </ThemeProvider>
  );
};

export const midiSourceGraph: NodeDefinition<MidiSourceNode> = {
  type: "midiSource",
  title: "MIDI Source",
  defaultState,
  ports: () => [
    { id: "midi_out", name: "MIDI", kind: "midi", direction: "out" },
  ],
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
