import { useMemo, useState } from "react";
import type { GraphNode } from "../../graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "../../types/graphNodeDefinition";
import { Button, Knob, NumericInput, RadioGroup } from "../../ui/components";
import { SampleLibraryPanel } from "../../ui/components/SampleLibraryPanel";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme, OptionDef } from "../../ui/types";

type SamplePlayerNode = Extract<GraphNode, { type: "samplePlayer" }>;

const samplePlayerTheme: ControlTheme = {
  primary: "#a78bfa", // Purple - sampler
  secondary: "#c4b5fd",
  tertiary: "#8b5cf6",
};

const boolOptions: OptionDef<"on" | "off">[] = [
  { value: "off", content: "Off" },
  { value: "on", content: "On" },
];

function defaultState(): SamplePlayerNode["state"] {
  return {
    sampleId: null,
    sampleName: null,
    gain: 1,
    followPitch: false,
    rootNote: 60,
    stopOnNoteOff: false,
    loop: false,
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const SamplePlayerUi: React.FC<NodeUiProps<SamplePlayerNode>> = ({
  node,
  onPatchNode,
  runtimeState,
  startBatch,
  endBatch,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(false);

  const debugError = (runtimeState as any)?.error as string | null | undefined;

  const currentLabel = useMemo(() => {
    if (!node.state.sampleId) return "(none)";
    return node.state.sampleName ?? node.state.sampleId;
  }, [node.state.sampleId, node.state.sampleName]);

  return (
    <ThemeProvider theme={samplePlayerTheme}>
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
              title="Open Sample Library"
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
            {node.state.sampleId && (
              <Button
                onClick={() =>
                  onPatchNode(node.id, { sampleId: null, sampleName: null })
                }
                style={{ padding: 0, flexShrink: 0 }}
                title="Clear Sample"
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

          {debugError && (
            <div style={{ fontSize: 12, color: "rgba(191, 97, 106, 0.95)" }}>
              {debugError}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Knob
            value={clamp(node.state.gain, 0, 2)}
            onChange={(v) => onPatchNode(node.id, { gain: v })}
            min={0}
            max={2}
            label="Gain"
            format={(v) => `${Math.round(v * 100)}%`}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <NumericInput
            value={clamp(node.state.rootNote, 0, 127)}
            onChange={(v) => onPatchNode(node.id, { rootNote: Math.round(v) })}
            min={0}
            max={127}
            step={1}
            label="Root note"
            format={(v) => Math.round(v).toString()}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <RadioGroup
            value={node.state.followPitch ? "on" : "off"}
            onChange={(v) => onPatchNode(node.id, { followPitch: v === "on" })}
            options={boolOptions}
            label="Follow pitch"
          />
          <RadioGroup
            value={node.state.loop ? "on" : "off"}
            onChange={(v) => onPatchNode(node.id, { loop: v === "on" })}
            options={boolOptions}
            label="Loop"
          />
        </div>

        <div style={{ display: "flex" }}>
          <RadioGroup
            value={node.state.stopOnNoteOff ? "on" : "off"}
            onChange={(v) =>
              onPatchNode(node.id, { stopOnNoteOff: v === "on" })
            }
            options={boolOptions}
            label="Stop on note-off"
          />
        </div>
      </div>

      <SampleLibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedId={node.state.sampleId}
        onSelect={(id, name) => {
          onPatchNode(node.id, { sampleId: id, sampleName: name });
        }}
      />
    </ThemeProvider>
  );
};

export const samplePlayerGraph: NodeDefinition<SamplePlayerNode> = {
  type: "samplePlayer",
  title: "Sample Player",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: SamplePlayerUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<SamplePlayerNode["state"]>;
    const d = defaultState();
    return {
      sampleId: typeof s.sampleId === "string" ? s.sampleId : d.sampleId,
      sampleName:
        typeof s.sampleName === "string" ? s.sampleName : d.sampleName,
      gain: typeof s.gain === "number" ? s.gain : d.gain,
      followPitch:
        typeof s.followPitch === "boolean" ? s.followPitch : d.followPitch,
      rootNote: typeof s.rootNote === "number" ? s.rootNote : d.rootNote,
      stopOnNoteOff:
        typeof s.stopOnNoteOff === "boolean"
          ? s.stopOnNoteOff
          : d.stopOnNoteOff,
      loop: typeof s.loop === "boolean" ? s.loop : d.loop,
    };
  },
};
