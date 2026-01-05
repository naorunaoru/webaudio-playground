import type { GraphNode, MidiEvent } from "../../graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "../../types/graphNodeDefinition";
import { EnvelopeEditor } from "../../ui/components/EnvelopeEditor";
import { NumericInput } from "../../ui/components/NumericInput";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

const envelopeTheme: ControlTheme = {
  primary: "#ec4899", // Pink - envelope/modulation
  secondary: "#f472b6",
  tertiary: "#db2777",
};

type EnvelopeNode = Extract<GraphNode, { type: "envelope" }>;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampMs(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5000, v));
}

function clampShape(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function defaultState(): EnvelopeNode["state"] {
  return {
    env: {
      attackMs: 5,
      decayMs: 120,
      sustain: 0.6,
      releaseMs: 120,
      attackShape: 0.6,
      decayShape: 0.6,
      releaseShape: 0.6,
    },
    lastMidiNote: null,
    lastMidiAtMs: null,
    lastMidiOffAtMs: null,
  };
}

function mapCcToEnvPatch(
  node: EnvelopeNode,
  portId: string | null,
  event: MidiEvent
) {
  if (event.type !== "cc") return null;
  const v01 = clamp01(event.value / 127);
  if (portId === "cc_attack")
    return { env: { ...node.state.env, attackMs: clampMs(v01 * 2000) } };
  if (portId === "cc_decay")
    return { env: { ...node.state.env, decayMs: clampMs(v01 * 2000) } };
  if (portId === "cc_sustain")
    return { env: { ...node.state.env, sustain: v01 } };
  if (portId === "cc_release")
    return { env: { ...node.state.env, releaseMs: clampMs(v01 * 2000) } };
  return null;
}

const EnvelopeUi: React.FC<NodeUiProps<EnvelopeNode>> = ({
  node,
  onPatchNode,
  runtimeState,
  startBatch,
  endBatch,
}) => {
  const env = node.state.env;
  const dbg =
    runtimeState && typeof runtimeState === "object"
      ? (runtimeState as any)
      : null;
  const noteOnAtMs =
    typeof dbg?.lastMidiAtMs === "number" ? dbg.lastMidiAtMs : null;
  const noteOffAtMs =
    typeof dbg?.lastMidiOffAtMs === "number" ? dbg.lastMidiOffAtMs : null;

  return (
    <ThemeProvider theme={envelopeTheme}>
      <div style={{ display: "grid", gap: 16 }}>
        <EnvelopeEditor
          env={env}
          onChangeEnv={(next) => onPatchNode(node.id, { env: next })}
          noteOnAtMs={noteOnAtMs}
          noteOffAtMs={noteOffAtMs}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <NumericInput
            value={env.attackMs}
            onChange={(v) =>
              onPatchNode(node.id, { env: { ...env, attackMs: clampMs(v) } })
            }
            min={0}
            max={5000}
            step={1}
            label="A"
            format={(v) => Math.round(v).toString()}
            unit="ms"
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <NumericInput
            value={env.decayMs}
            onChange={(v) =>
              onPatchNode(node.id, { env: { ...env, decayMs: clampMs(v) } })
            }
            min={0}
            max={5000}
            step={1}
            label="D"
            format={(v) => Math.round(v).toString()}
            unit="ms"
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <NumericInput
            value={env.sustain}
            onChange={(v) =>
              onPatchNode(node.id, { env: { ...env, sustain: clamp01(v) } })
            }
            min={0}
            max={1}
            step={0.01}
            label="S"
            format={(v) => v.toFixed(2)}
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <NumericInput
            value={env.releaseMs}
            onChange={(v) =>
              onPatchNode(node.id, { env: { ...env, releaseMs: clampMs(v) } })
            }
            min={0}
            max={5000}
            step={1}
            label="R"
            format={(v) => Math.round(v).toString()}
            unit="ms"
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>
      </div>
    </ThemeProvider>
  );
};

export const envelopeGraph: NodeDefinition<EnvelopeNode> = {
  type: "envelope",
  title: "Envelope",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "cc_attack", name: "A", kind: "cc", direction: "in" },
    { id: "cc_decay", name: "D", kind: "cc", direction: "in" },
    { id: "cc_sustain", name: "S", kind: "cc", direction: "in" },
    { id: "cc_release", name: "R", kind: "cc", direction: "in" },
    { id: "env_out", name: "Env", kind: "automation", direction: "out" },
  ],
  ui: EnvelopeUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<EnvelopeNode["state"]> & { env?: any };
    const d = defaultState();
    const env = s.env ?? {};
    const curveToShape = (curve: unknown) => (curve === "exp" ? 0.6 : 0);
    return {
      env: {
        attackMs: env.attackMs ?? d.env.attackMs,
        decayMs: env.decayMs ?? d.env.decayMs,
        sustain: env.sustain ?? d.env.sustain,
        releaseMs: env.releaseMs ?? d.env.releaseMs,
        attackShape: clampShape(
          env.attackShape ?? curveToShape(env.attackCurve) ?? d.env.attackShape
        ),
        decayShape: clampShape(
          env.decayShape ?? curveToShape(env.decayCurve) ?? d.env.decayShape
        ),
        releaseShape: clampShape(
          env.releaseShape ??
            curveToShape(env.releaseCurve) ??
            d.env.releaseShape
        ),
      },
      lastMidiNote: s.lastMidiNote ?? d.lastMidiNote,
      lastMidiAtMs: s.lastMidiAtMs ?? d.lastMidiAtMs,
      lastMidiOffAtMs: s.lastMidiOffAtMs ?? d.lastMidiOffAtMs,
    };
  },
  onMidi: (node, event, portId) => {
    if (event.type === "noteOn") {
      if (portId && portId !== "midi_in") return null;
      return {
        lastMidiNote: event.note,
        lastMidiAtMs: event.atMs,
        lastMidiOffAtMs: null,
      };
    }
    if (event.type === "noteOff") {
      if (portId && portId !== "midi_in") return null;
      if (
        node.state.lastMidiNote != null &&
        node.state.lastMidiNote !== event.note
      )
        return null;
      return { lastMidiOffAtMs: event.atMs };
    }
    return mapCcToEnvPatch(node, portId, event);
  },
};
