import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

type PmOscShellNode = Extract<GraphNode, { type: "pmOscShell" }>;

const shellTheme: ControlTheme = {
  primary: "#f59e0b", // Amber - "container"
  secondary: "#fbbf24",
  tertiary: "#d97706",
};

function defaultState(): PmOscShellNode["state"] {
  return {
    pitchId: null,
    phasorId: null,
    sinId: null,
    collapsed: true,
  };
}

const PmOscShellUi: React.FC<NodeUiProps<PmOscShellNode>> = ({ node, onPatchNode }) => {
  return (
    <ThemeProvider theme={shellTheme}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => onPatchNode(node.id, { collapsed: !node.state.collapsed })}
        >
          {node.state.collapsed ? "Deconstruct" : "Collapse"}
        </button>
      </div>
    </ThemeProvider>
  );
};

export const pmOscShellGraph: NodeDefinition<PmOscShellNode> = {
  type: "pmOscShell",
  title: "PM Osc",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "phase_in", name: "PM", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: PmOscShellUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PmOscShellNode["state"]>;
    const d = defaultState();
    const bool = (v: unknown, fallback: boolean) => (v === true || v === false ? v : fallback);
    const idOrNull = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
    return {
      pitchId: idOrNull(s.pitchId),
      phasorId: idOrNull(s.phasorId),
      sinId: idOrNull(s.sinId),
      collapsed: bool(s.collapsed, d.collapsed),
    };
  },
};

