import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type {
  NodeDefinition,
  NodeUiProps,
} from "@/types/graphNodeDefinition";
import { Button, Knob, NumericInput } from "@ui/components";
import { SoundfontLibraryPanel } from "@ui/components/SoundfontLibraryPanel";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types";
import { clamp } from "@utils/math";
import type { SoundfontRuntimeState, SoundfontPreset } from "./audio";

type SoundfontNode = Extract<GraphNode, { type: "soundfont" }>;

const soundfontTheme: ControlTheme = {
  primary: "#60a5fa", // Blue - synthesizer
  secondary: "#93c5fd",
  tertiary: "#3b82f6",
};

function defaultState(): SoundfontNode["state"] {
  return {
    soundfontId: null,
    soundfontName: null,
    gain: 1,
    bank: 0,
    program: 0,
    channel: 0,
  };
}

const selectStyle: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 11,
  background: "rgba(0,0,0,0.3)",
  color: "#e5e5e5",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  cursor: "pointer",
  flex: 1,
  minWidth: 0,
};

const SoundfontUi: React.FC<NodeUiProps<SoundfontNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<SoundfontPreset[]>([]);
  const getRuntimeState = useRuntimeStateGetter<SoundfontRuntimeState>(node.id);

  useEffect(() => {
    const interval = setInterval(() => {
      const state = getRuntimeState();
      setError(state?.error ?? null);
      setPresets(state?.presets ?? []);
    }, 200);
    return () => clearInterval(interval);
  }, [getRuntimeState]);

  const currentLabel = useMemo(() => {
    if (!node.state.soundfontId) return "(none)";
    return node.state.soundfontName ?? node.state.soundfontId;
  }, [node.state.soundfontId, node.state.soundfontName]);

  const currentPresetKey = `${node.state.bank}:${node.state.program}`;

  const handlePresetChange = (value: string) => {
    const [bank, program] = value.split(":").map(Number);
    if (!isNaN(bank) && !isNaN(program)) {
      onPatchNode(node.id, { bank, program });
    }
  };

  return (
    <ThemeProvider theme={soundfontTheme}>
      <div style={{ display: "grid", gap: 10 }}>
        {/* Soundfont selection row */}
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
              title="Open SoundFont Library"
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
            {node.state.soundfontId && (
              <Button
                onClick={() =>
                  onPatchNode(node.id, {
                    soundfontId: null,
                    soundfontName: null,
                    bank: 0,
                    program: 0,
                  })
                }
                style={{ padding: 0, flexShrink: 0 }}
                title="Clear SoundFont"
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

          {error && (
            <div style={{ fontSize: 12, color: "rgba(191, 97, 106, 0.95)" }}>
              {error}
            </div>
          )}
        </div>

        {/* Preset selector - only show when soundfont is loaded */}
        {node.state.soundfontId && presets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              style={{
                fontSize: 10,
                color: "rgba(200, 200, 200, 0.7)",
                textTransform: "uppercase",
              }}
            >
              Preset
            </label>
            <select
              value={currentPresetKey}
              onChange={(e) => handlePresetChange(e.target.value)}
              style={selectStyle}
            >
              {presets.map((p) => (
                <option key={`${p.bank}:${p.program}`} value={`${p.bank}:${p.program}`}>
                  {p.bank}:{p.program} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Gain and Channel */}
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
            value={node.state.channel}
            onChange={(v) => onPatchNode(node.id, { channel: v })}
            min={0}
            max={16}
            step={1}
            label="Channel"
            format={(v) => (v === 0 ? "All" : Math.round(v).toString())}
            width={48}
          />
        </div>
      </div>

      <SoundfontLibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedId={node.state.soundfontId}
        onSelect={(id, name) => {
          onPatchNode(node.id, {
            soundfontId: id,
            soundfontName: name,
            bank: 0,
            program: 0,
          });
        }}
      />
    </ThemeProvider>
  );
};

export const soundfontGraph: NodeDefinition<SoundfontNode> = {
  type: "soundfont",
  title: "SoundFont",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: SoundfontUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<SoundfontNode["state"]>;
    const d = defaultState();
    return {
      soundfontId:
        typeof s.soundfontId === "string" ? s.soundfontId : d.soundfontId,
      soundfontName:
        typeof s.soundfontName === "string" ? s.soundfontName : d.soundfontName,
      gain: typeof s.gain === "number" ? s.gain : d.gain,
      bank: typeof s.bank === "number" ? s.bank : d.bank,
      program: typeof s.program === "number" ? s.program : d.program,
      channel: typeof s.channel === "number" ? s.channel : d.channel,
    };
  },
};
