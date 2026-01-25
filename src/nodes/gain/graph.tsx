import { useEffect, useState } from "react";
import { useRuntimeStateGetter } from "@graph/hooks/useNodeRuntimeState";
import type { GraphNode } from "@graph/types";
import type { GainRuntimeState } from "./audio";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@/ui/components/Knob";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme } from "@/ui/types/theme";
import { clamp } from "@/utils/math";

const gainTheme: ControlTheme = {
  primary: "#22c55e", // Green - level/volume
  secondary: "#4ade80",
  tertiary: "#16a34a",
};

type GainNodeGraph = Extract<GraphNode, { type: "gain" }>;

function defaultState(): GainNodeGraph["state"] {
  return { base: 0, depth: 1 };
}

const GainUi: React.FC<NodeUiProps<GainNodeGraph>> = ({ node, onPatchNode, startBatch, endBatch, audioState }) => {
  const getRuntimeState = useRuntimeStateGetter<GainRuntimeState>(node.id);
  const [modulatedCv, setModulatedCv] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (audioState !== "running") {
      setModulatedCv(undefined);
      return;
    }

    let raf = 0;
    const tick = () => {
      const state = getRuntimeState();
      if (state) {
        setModulatedCv(state.modulatedCv);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  return (
    <ThemeProvider theme={gainTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={node.state.base}
          onChange={(v) => onPatchNode(node.id, { base: v })}
          min={0}
          max={2}
          label="Base"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={node.state.depth}
          onChange={(v) => onPatchNode(node.id, { depth: v })}
          min={0}
          max={2}
          label="CV"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
          modulationValue={modulatedCv}
        />
      </div>
    </ThemeProvider>
  );
};

export const gainGraph: NodeDefinition<GainNodeGraph> = {
  type: "gain",
  title: "Gain",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "gain_in", name: "Gain", kind: "cv", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: GainUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<GainNodeGraph["state"]> & { gain?: unknown };
    const d = defaultState();
    return {
      base: clamp(s.base ?? d.base, 0, 2),
      depth: clamp(s.depth ?? d.depth, 0, 2),
    };
  },
};
