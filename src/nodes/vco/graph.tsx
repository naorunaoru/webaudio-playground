import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { RadioGroup } from "@ui/components/RadioGroup";
import { WaveformIcon } from "@ui/icons";
import type { OptionDef } from "@ui/types";
import type { VcoWaveform } from "./types";

type VcoNode = Extract<GraphNode, { type: "vco" }>;

function defaultState(): VcoNode["state"] {
  return { waveform: "sawtooth" };
}

const waveformOptions: OptionDef<VcoWaveform>[] = [
  { value: "sine", content: <WaveformIcon type="sine" />, ariaLabel: "Sine" },
  { value: "triangle", content: <WaveformIcon type="triangle" />, ariaLabel: "Triangle" },
  { value: "square", content: <WaveformIcon type="square" />, ariaLabel: "Square" },
  { value: "sawtooth", content: <WaveformIcon type="sawtooth" />, ariaLabel: "Sawtooth" },
];

const VcoUi: React.FC<NodeUiProps<VcoNode>> = ({ node, onPatchNode }) => {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <RadioGroup
        value={node.state.waveform}
        onChange={(waveform) => onPatchNode(node.id, { waveform })}
        options={waveformOptions}
        label="Shape"
      />
    </div>
  );
};

export const vcoGraph: NodeDefinition<VcoNode> = {
  type: "vco",
  title: "VCO",
  defaultState,
  ports: () => [
    { id: "pitch_in", name: "V/oct", kind: "pitch", direction: "in" },
    { id: "phase_mod_in", name: "Phase", kind: "cv", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: VcoUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<VcoNode["state"]>;
    const d = defaultState();
    return {
      waveform: s.waveform ?? d.waveform,
    };
  },
};
