import { useEffect, useState } from "react";
import { useRuntimeStateGetter } from "@graph/hooks/useNodeRuntimeState";
import type { GraphNode } from "@graph/types";
import type { GainRuntimeState } from "./audio";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@ui/components/Knob";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import { clamp } from "@utils/math";

const gainTheme: ControlTheme = {
  primary: "#22c55e", // Green - level/volume
  secondary: "#4ade80",
  tertiary: "#16a34a",
};

type GainNodeGraph = Extract<GraphNode, { type: "gain" }>;

function defaultState(): GainNodeGraph["state"] {
  return { depth: 1 };
}

const GainUi: React.FC<NodeUiProps<GainNodeGraph>> = ({ node, onPatchNode, startBatch, endBatch, audioState }) => {
  const getRuntimeState = useRuntimeStateGetter<GainRuntimeState>(node.id);
  const [modulatedGain, setModulatedGain] = useState<number | undefined>(undefined);

  // Poll runtime state for modulation display when audio is running
  useEffect(() => {
    if (audioState !== "running") {
      setModulatedGain(undefined);
      return;
    }

    let raf = 0;
    const tick = () => {
      const state = getRuntimeState();
      if (state) {
        setModulatedGain(state.modulatedGain);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  return (
    <ThemeProvider theme={gainTheme}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Knob
          value={node.state.depth}
          onChange={(v) => onPatchNode(node.id, { depth: v })}
          min={0}
          max={2}
          label="Gain"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
          modulationValue={modulatedGain}
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
    { id: "gain_in", name: "Gain", kind: "automation", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: GainUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<GainNodeGraph["state"]>;
    const d = defaultState();
    return { depth: clamp(s.depth ?? d.depth, 0, 2) };
  },
};

