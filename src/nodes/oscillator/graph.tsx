import type { GraphNode } from "@graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "@/types/graphNodeDefinition";
import { RadioGroup } from "@ui/components/RadioGroup";
import { WaveformIcon } from "@ui/icons";
import type { OptionDef } from "@ui/types";
import type { WaveformType } from "@ui/icons/WaveformIcon";

type OscillatorNode = Extract<GraphNode, { type: "oscillator" }>;

function defaultState(): OscillatorNode["state"] {
  return {
    source: "wave",
    waveform: "sawtooth",
  };
}

const oscillatorModeOptions: OptionDef<WaveformType>[] = [
  { value: "sine", content: <WaveformIcon type="sine" />, ariaLabel: "Sine" },
  {
    value: "triangle",
    content: <WaveformIcon type="triangle" />,
    ariaLabel: "Triangle",
  },
  {
    value: "square",
    content: <WaveformIcon type="square" />,
    ariaLabel: "Square",
  },
  {
    value: "sawtooth",
    content: <WaveformIcon type="sawtooth" />,
    ariaLabel: "Sawtooth",
  },
  {
    value: "noise",
    content: <WaveformIcon type="noise" />,
    ariaLabel: "Noise",
  },
];

function isWaveformType(
  value: unknown
): value is Exclude<WaveformType, "noise"> {
  return (
    value === "sine" ||
    value === "triangle" ||
    value === "square" ||
    value === "sawtooth"
  );
}

const OscillatorUi: React.FC<NodeUiProps<OscillatorNode>> = ({
  node,
  onPatchNode,
}) => {
  const selected: WaveformType =
    node.state.source === "noise"
      ? "noise"
      : isWaveformType(node.state.waveform)
      ? node.state.waveform
      : "sawtooth";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <RadioGroup
        value={selected}
        onChange={(mode) => {
          if (mode === "noise") {
            onPatchNode(node.id, { source: "noise" });
            return;
          }
          onPatchNode(node.id, {
            source: "wave",
            waveform: mode as OscillatorType,
          });
        }}
        options={oscillatorModeOptions}
        label="Shape"
      />
    </div>
  );
};

export const oscillatorGraph: NodeDefinition<OscillatorNode> = {
  type: "oscillator",
  title: "Oscillator",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: OscillatorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<OscillatorNode["state"]> & { env?: any };
    const d = defaultState();
    return {
      source: (s.source ?? d.source) as OscillatorNode["state"]["source"],
      waveform: (s.waveform ?? d.waveform) as OscillatorType,
    };
  },
};
