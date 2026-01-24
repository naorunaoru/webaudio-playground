import { useEffect, useState } from "react";
import { useRuntimeStateGetter } from "@graph/hooks/useNodeRuntimeState";
import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob, RadioGroup } from "@ui/components";
import { ThemeProvider } from "@ui/context";
import { FilterTypeIcon } from "@ui/icons";
import type { ControlTheme, OptionDef } from "@ui/types";
import { clamp, clampPositive } from "@utils/math";
import type { FilterRuntimeState } from "./audio";
import type { FilterType } from "./types";

type FilterNodeGraph = Extract<GraphNode, { type: "filter" }>;

const filterTheme: ControlTheme = {
  primary: "#60a5fa", // Blue - filter/cutoff
  secondary: "#93c5fd",
  tertiary: "#3b82f6",
};

function defaultState(): FilterNodeGraph["state"] {
  return {
    type: "lowpass",
    frequencyHz: 1200,
    q: 0.7,
    envAmountHz: 0,
  };
}

const typeOptions: OptionDef<FilterType>[] = [
  { value: "lowpass", content: <FilterTypeIcon type="lowpass" />, ariaLabel: "Lowpass" },
  { value: "highpass", content: <FilterTypeIcon type="highpass" />, ariaLabel: "Highpass" },
];

const FilterUi: React.FC<NodeUiProps<FilterNodeGraph>> = ({ node, onPatchNode, startBatch, endBatch, audioState }) => {
  const getRuntimeState = useRuntimeStateGetter<FilterRuntimeState>(node.id);
  const [modulatedFreq, setModulatedFreq] = useState<number | undefined>(undefined);

  // Poll runtime state for modulation display when audio is running
  useEffect(() => {
    if (audioState !== "running") {
      setModulatedFreq(undefined);
      return;
    }

    let raf = 0;
    const tick = () => {
      const state = getRuntimeState();
      if (state) {
        setModulatedFreq(state.modulatedFrequency);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  const nyquist = 22050; // UI clamp only; audio runtime clamps to actual nyquist.
  const freqHz = clamp(node.state.frequencyHz, 20, nyquist);
  const q = clamp(node.state.q, 0.0001, 30);
  const envAmountHz = clamp(node.state.envAmountHz, 0, nyquist);

  return (
    <ThemeProvider theme={filterTheme}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <RadioGroup value={node.state.type} onChange={(t) => onPatchNode(node.id, { type: t })} options={typeOptions} label="Type" />
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Knob
            value={freqHz}
            onChange={(v) => onPatchNode(node.id, { frequencyHz: v })}
            min={20}
            max={20000}
            label="Freq"
            format={(v) => Math.round(v).toString()}
            unit="Hz"
            onDragStart={startBatch}
            onDragEnd={endBatch}
            modulationValue={modulatedFreq}
          />
          <Knob
            value={q}
            onChange={(v) => onPatchNode(node.id, { q: v })}
            min={0.0001}
            max={30}
            label="Q"
            format={(v) => v.toFixed(2)}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={envAmountHz}
            onChange={(v) => onPatchNode(node.id, { envAmountHz: v })}
            min={0}
            max={20000}
            label="Env"
            format={(v) => Math.round(v).toString()}
            unit="Hz"
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>
      </div>
    </ThemeProvider>
  );
};

export const filterGraph: NodeDefinition<FilterNodeGraph> = {
  type: "filter",
  title: "Filter",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "freq_in", name: "Freq", kind: "cv", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: FilterUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<FilterNodeGraph["state"]>;
    const d = defaultState();
    const type: FilterType = (s.type ?? d.type) === "highpass" ? "highpass" : "lowpass";
    return {
      type,
      frequencyHz: clamp(clampPositive(s.frequencyHz ?? d.frequencyHz, d.frequencyHz), 20, 20000),
      q: clamp(clampPositive(s.q ?? d.q, d.q), 0.0001, 30),
      envAmountHz: clamp(s.envAmountHz ?? d.envAmountHz, 0, 20000),
    };
  },
};
