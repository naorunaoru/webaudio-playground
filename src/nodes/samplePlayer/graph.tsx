import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "../../graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "../../types/graphNodeDefinition";
import type { StoredSample } from "../../audio/sampleStore";
import {
  deleteSample,
  listSamples,
  putSampleFromFile,
} from "../../audio/sampleStore";
import { Knob, NumericInput, RadioGroup } from "../../ui/components";
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
  const [library, setLibrary] = useState<ReadonlyArray<StoredSample>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debugError = (runtimeState as any)?.error as string | null | undefined;

  const currentLabel = useMemo(() => {
    if (!node.state.sampleId) return "(none)";
    return node.state.sampleName ?? node.state.sampleId;
  }, [node.state.sampleId, node.state.sampleName]);

  async function refreshLibrary() {
    try {
      setError(null);
      setLibrary(await listSamples());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refreshLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeProvider theme={samplePlayerTheme}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>Sample</span>
            <button
              type="button"
              onClick={() => refreshLibrary()}
              style={{ padding: "2px 8px" }}
            >
              Refresh
            </button>
          </div>

          <select
            value={node.state.sampleId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              if (!id) {
                onPatchNode(node.id, { sampleId: null, sampleName: null });
                return;
              }
              const meta = library.find((s) => s.id === id);
              onPatchNode(node.id, {
                sampleId: id,
                sampleName: meta?.name ?? node.state.sampleName ?? null,
              });
            }}
          >
            <option value="">(none)</option>
            {library.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Import (stores in IndexedDB)
            </span>
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  setError(null);
                  const meta = await putSampleFromFile(file);
                  await refreshLibrary();
                  onPatchNode(node.id, {
                    sampleId: meta.id,
                    sampleName: meta.name,
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                fontSize: 12,
                opacity: 0.75,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentLabel}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              disabled={!node.state.sampleId}
              onClick={() =>
                onPatchNode(node.id, { sampleId: null, sampleName: null })
              }
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!node.state.sampleId || busy}
              onClick={async () => {
                const id = node.state.sampleId;
                if (!id) return;
                const label = node.state.sampleName ?? id;
                if (!confirm(`Delete stored sample "${label}" from IndexedDB?`))
                  return;
                setBusy(true);
                try {
                  await deleteSample(id);
                  await refreshLibrary();
                  onPatchNode(node.id, { sampleId: null, sampleName: null });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </button>
          </div>

          {(error || debugError) && (
            <div style={{ fontSize: 12, color: "rgba(191, 97, 106, 0.95)" }}>
              {debugError ?? error}
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
