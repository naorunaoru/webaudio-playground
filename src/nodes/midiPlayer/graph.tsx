import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type {
  NodeDefinition,
  NodeUiProps,
} from "@/types/graphNodeDefinition";
import { getAudioEngine } from "@audio/engine";
import { Button, Knob, RadioGroup } from "@ui/components";
import { MidiLibraryPanel } from "@ui/components/MidiLibraryPanel";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme, OptionDef } from "@ui/types";
import { percent } from "@ui/units";
import { clamp } from "@utils/math";
import type { MidiPlayerRuntimeState } from "./audio";

type MidiPlayerNode = Extract<GraphNode, { type: "midiPlayer" }>;

const midiPlayerTheme: ControlTheme = {
  primary: "#4ade80", // Green - MIDI
  secondary: "#86efac",
  tertiary: "#22c55e",
};

const boolOptions: OptionDef<"on" | "off">[] = [
  { value: "off", content: "Off" },
  { value: "on", content: "On" },
];

function defaultState(): MidiPlayerNode["state"] {
  return {
    midiId: null,
    midiName: null,
    loop: false,
    tempoMultiplier: 1.0,
  };
}

const MidiPlayerUi: React.FC<NodeUiProps<MidiPlayerNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const getRuntimeState = useRuntimeStateGetter<MidiPlayerRuntimeState>(node.id);

  // Poll runtime state for playing status
  useEffect(() => {
    const interval = setInterval(() => {
      const state = getRuntimeState();
      setIsPlaying(state?.playing ?? false);
    }, 100);
    return () => clearInterval(interval);
  }, [getRuntimeState]);

  const currentLabel = useMemo(() => {
    if (!node.state.midiId) return "(none)";
    return node.state.midiName ?? node.state.midiId;
  }, [node.state.midiId, node.state.midiName]);

  const handlePlayStop = () => {
    getAudioEngine().sendCommand(node.id, "toggle");
  };

  return (
    <ThemeProvider theme={midiPlayerTheme}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "rgba(231, 231, 231, 0.9)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {currentLabel}
            </span>
            <Button
              onClick={() => setLibraryOpen(true)}
              style={{ padding: 0, flexShrink: 0 }}
              title="Open MIDI Library"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </Button>
            {node.state.midiId && (
              <Button
                onClick={() =>
                  onPatchNode(node.id, { midiId: null, midiName: null })
                }
                style={{ padding: 0, flexShrink: 0 }}
                title="Clear MIDI"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Button
            onClick={handlePlayStop}
            disabled={!node.state.midiId}
            style={{ padding: "4px 8px" }}
            title={isPlaying ? "Stop" : "Play"}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </Button>
          <Knob
            value={clamp(node.state.tempoMultiplier, 0.5, 2)}
            onChange={(v) => onPatchNode(node.id, { tempoMultiplier: v })}
            min={0.5}
            max={2}
            label="Speed"
            unit={percent}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>

        <div style={{ display: "flex" }}>
          <RadioGroup
            value={node.state.loop ? "on" : "off"}
            onChange={(v) => onPatchNode(node.id, { loop: v === "on" })}
            options={boolOptions}
            label="Loop"
          />
        </div>
      </div>

      <MidiLibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedId={node.state.midiId}
        onSelect={(id, name) => {
          onPatchNode(node.id, { midiId: id, midiName: name });
        }}
      />
    </ThemeProvider>
  );
};

export const midiPlayerGraph: NodeDefinition<MidiPlayerNode> = {
  type: "midiPlayer",
  title: "MIDI Player",
  defaultState,
  ports: () => [
    { id: "midi_out", name: "MIDI", kind: "midi", direction: "out" },
  ],
  ui: MidiPlayerUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiPlayerNode["state"]>;
    const d = defaultState();
    return {
      midiId: typeof s.midiId === "string" ? s.midiId : d.midiId,
      midiName: typeof s.midiName === "string" ? s.midiName : d.midiName,
      loop: typeof s.loop === "boolean" ? s.loop : d.loop,
      tempoMultiplier:
        typeof s.tempoMultiplier === "number" ? s.tempoMultiplier : d.tempoMultiplier,
    };
  },
};
