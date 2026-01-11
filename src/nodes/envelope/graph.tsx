import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type {
  NodeDefinition,
  NodeUiProps,
} from "@/types/graphNodeDefinition";
import { Button } from "@ui/components/Button";
import { EnvelopeEditor } from "@ui/components/EnvelopeEditor";
import { Label } from "@ui/components/Label";
import { NumericInput } from "@ui/components/NumericInput";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import type { EnvelopeRuntimeState } from "./audio";

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
      retrigger: true,
    },
  };
}


const EnvelopeUi: React.FC<NodeUiProps<EnvelopeNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const getRuntimeState = useRuntimeStateGetter<EnvelopeRuntimeState>(node.id);
  const env = node.state.env;

  return (
    <ThemeProvider theme={envelopeTheme}>
      <div style={{ display: "grid", gap: 16 }}>
        <EnvelopeEditor
          env={env}
          onChangeEnv={(next) => onPatchNode(node.id, { env: next })}
          getRuntimeState={getRuntimeState}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Button
              aria-pressed={env.retrigger}
              onClick={() =>
                onPatchNode(node.id, {
                  env: { ...env, retrigger: !env.retrigger },
                })
              }
            >
              {env.retrigger ? "On" : "Off"}
            </Button>
            <Label text="Retrig" />
          </div>
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
        retrigger: env.retrigger ?? d.env.retrigger,
      },
    };
  },
};
