import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { RadioGroup } from "@ui/components/RadioGroup";
import { Knob } from "@ui/components/Knob";
import { Button } from "@ui/components/Button";
import { WaveformIcon } from "@ui/icons";
import type { OptionDef } from "@ui/types";
import type { Unit } from "@ui/units";
import type { LfoWaveform } from "./types";

const lfoHz: Unit = {
  format: (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} Hz`,
  parse: (s) => parseFloat(s),
};

type LfoNode = Extract<GraphNode, { type: "lfo" }>;

/** LFO output range limits */
const RANGE_MIN = -10;
const RANGE_MAX = 10;

function defaultState(): LfoNode["state"] {
  return {
    waveform: "sine",
    frequencyHz: 1,
    rangeMin: RANGE_MIN,
    rangeMax: RANGE_MAX,
    oneShot: false,
  };
}

const waveformOptions: OptionDef<LfoWaveform>[] = [
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
    ariaLabel: "Sawtooth Up",
  },
  {
    value: "sawtoothDown",
    content: <WaveformIcon type="sawtoothDown" />,
    ariaLabel: "Sawtooth Down",
  },
];

const LfoUi: React.FC<NodeUiProps<LfoNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const state = node.state;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Waveform Selection */}
      <RadioGroup
        value={state.waveform}
        onChange={(waveform) => onPatchNode(node.id, { waveform })}
        options={waveformOptions}
        label="Shape"
      />

      {/* Frequency Control */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Knob
          value={state.frequencyHz}
          onChange={(v) => onPatchNode(node.id, { frequencyHz: v })}
          min={0.01}
          max={50}
          label="Rate"
          unit={lfoHz}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>

      {/* Range Controls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        <Knob
          value={state.rangeMin}
          onChange={(v) => onPatchNode(node.id, { rangeMin: v })}
          min={RANGE_MIN}
          max={RANGE_MAX}
          step={0.1}
          label="Min"
          format={(v) => v.toFixed(1)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={state.rangeMax}
          onChange={(v) => onPatchNode(node.id, { rangeMax: v })}
          min={RANGE_MIN}
          max={RANGE_MAX}
          step={0.1}
          label="Max"
          format={(v) => v.toFixed(1)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>

      {/* One-Shot Toggle */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Button
          aria-pressed={state.oneShot}
          onClick={() => onPatchNode(node.id, { oneShot: !state.oneShot })}
        >
          {state.oneShot ? "One-Shot" : "Loop"}
        </Button>
      </div>
    </div>
  );
};

export const lfoGraph: NodeDefinition<LfoNode> = {
  type: "lfo",
  title: "LFO",
  defaultState,
  ports: () => [
    { id: "trigger_in", name: "Trig", kind: "trigger", direction: "in" },
    { id: "lfo_out", name: "Out", kind: "cv", direction: "out" },
  ],
  ui: LfoUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<LfoNode["state"]>;
    const d = defaultState();
    return {
      waveform: s.waveform ?? d.waveform,
      frequencyHz: Math.max(0.01, Math.min(50, s.frequencyHz ?? d.frequencyHz)),
      rangeMin: Math.max(
        RANGE_MIN,
        Math.min(RANGE_MAX, s.rangeMin ?? d.rangeMin)
      ),
      rangeMax: Math.max(
        RANGE_MIN,
        Math.min(RANGE_MAX, s.rangeMax ?? d.rangeMax)
      ),
      oneShot: s.oneShot ?? d.oneShot,
    };
  },
};
