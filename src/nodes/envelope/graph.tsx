import { useState } from "react";
import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Button } from "@ui/components/Button";
import { EnvelopeEditor } from "@ui/components/EnvelopeEditor";
import { Label } from "@ui/components/Label";
import { NumericInput } from "@ui/components/NumericInput";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import type { EnvelopeRuntimeState } from "./audio";
import type { EnvelopePhase, EnvelopeState } from "./types";

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

function defaultPhases(): EnvelopePhase[] {
  return [
    { id: "a", targetLevel: 1.0, durationMs: 5, shape: 0.6, hold: false },
    { id: "d", targetLevel: 0.6, durationMs: 120, shape: 0.6, hold: true },
    { id: "r", targetLevel: 0.0, durationMs: 120, shape: 0.6, hold: false },
  ];
}

function defaultState(): EnvelopeState {
  return {
    phases: defaultPhases(),
    retrigger: true,
  };
}

const EnvelopeUi: React.FC<NodeUiProps<EnvelopeNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const getRuntimeState = useRuntimeStateGetter<EnvelopeRuntimeState>(node.id);
  const { phases, retrigger } = node.state;
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);

  const selectedPhaseData =
    selectedPhase !== null ? phases[selectedPhase] : null;

  const updatePhases = (next: EnvelopePhase[]) => {
    // Deep clone to strip any Automerge proxy references
    const plainPhases = JSON.parse(JSON.stringify(next));
    onPatchNode(node.id, { phases: plainPhases });
  };

  const updateSelectedPhase = (updates: Partial<EnvelopePhase>) => {
    if (selectedPhase === null) return;
    const newPhases = phases.map((p, i) =>
      i === selectedPhase ? { ...p, ...updates } : p,
    );
    updatePhases(newPhases);
  };

  return (
    <ThemeProvider theme={envelopeTheme}>
      <div style={{ display: "grid", gap: 16, width: "350px" }}>
        <EnvelopeEditor
          phases={phases}
          onChangePhases={updatePhases}
          getRuntimeState={getRuntimeState}
          onDragStart={startBatch}
          onDragEnd={endBatch}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
        />

        {/* Phase parameter inputs - always visible, disabled when no phase selected */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <NumericInput
            value={selectedPhaseData?.durationMs ?? 0}
            onChange={(v) => updateSelectedPhase({ durationMs: clampMs(v) })}
            min={0}
            max={5000}
            step={1}
            label="Time"
            format={(v) => (selectedPhaseData ? `${Math.round(v)} ms` : "—")}
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
            disabled={!selectedPhaseData}
          />
          <NumericInput
            value={selectedPhaseData?.targetLevel ?? 0}
            onChange={(v) => updateSelectedPhase({ targetLevel: clamp01(v) })}
            min={0}
            max={1}
            step={0.01}
            label="Level"
            format={(v) => (selectedPhaseData ? v.toFixed(2) : "—")}
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
            disabled={!selectedPhaseData}
          />
          <NumericInput
            value={selectedPhaseData?.shape ?? 0}
            onChange={(v) => updateSelectedPhase({ shape: clampShape(v) })}
            min={-1}
            max={1}
            step={0.01}
            label="Curve"
            format={(v) => (selectedPhaseData ? v.toFixed(2) : "—")}
            width={56}
            onDragStart={startBatch}
            onDragEnd={endBatch}
            disabled={!selectedPhaseData}
          />
        </div>

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
              aria-pressed={retrigger}
              onClick={() => onPatchNode(node.id, { retrigger: !retrigger })}
            >
              {retrigger ? "On" : "Off"}
            </Button>
            <Label text="Retrig" />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

function isValidPhase(p: unknown): p is EnvelopePhase {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.targetLevel === "number" &&
    typeof obj.durationMs === "number" &&
    typeof obj.shape === "number" &&
    typeof obj.hold === "boolean"
  );
}

function isValidPhasesArray(arr: unknown): arr is EnvelopePhase[] {
  if (!Array.isArray(arr)) return false;
  return arr.length > 0 && arr.every(isValidPhase);
}

export const envelopeGraph: NodeDefinition<EnvelopeNode> = {
  type: "envelope",
  title: "Envelope",
  defaultState,
  ports: () => [
    { id: "gate_in", name: "Gate", kind: "gate", direction: "in" },
    { id: "env_out", name: "Env", kind: "cv", direction: "out" },
  ],
  ui: EnvelopeUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<EnvelopeState>;

    // If valid phases array exists, use it
    if (isValidPhasesArray(s.phases)) {
      return {
        phases: s.phases,
        retrigger: typeof s.retrigger === "boolean" ? s.retrigger : true,
      };
    }

    // Otherwise return default state (no migration from old format)
    return defaultState();
  },
};
