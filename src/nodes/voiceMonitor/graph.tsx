import { useEffect, useState } from "react";
import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import type { VoiceMonitorRuntimeState, VoiceInfo } from "./types";

type VoiceMonitorNode = Extract<GraphNode, { type: "voiceMonitor" }>;

function defaultState(): VoiceMonitorNode["state"] {
  return {};
}

const VoiceIndicator: React.FC<{ voice: VoiceInfo }> = ({ voice }) => {
  // Determine state and color
  // - inactive (free): gray
  // - active (note held): green
  // - held by consumer (release phase): yellow/orange
  let bgColor = "#374151"; // gray - inactive
  let label = "free";

  if (voice.noteActive) {
    bgColor = "#22c55e"; // green - active
    label = "active";
  } else if (voice.consumerCount > 0) {
    bgColor = "#f59e0b"; // amber - held
    label = "held";
  }

  return (
    <tr>
      <td
        style={{
          padding: "2px 8px",
          textAlign: "center",
          fontWeight: 500,
        }}
      >
        {voice.index}
      </td>
      <td style={{ padding: "2px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: bgColor,
              boxShadow: voice.noteActive
                ? "0 0 6px #22c55e"
                : voice.consumerCount > 0
                  ? "0 0 6px #f59e0b"
                  : "none",
            }}
          />
          <span
            style={{
              color:
                voice.noteActive
                  ? "#4ade80"
                  : voice.consumerCount > 0
                    ? "#fbbf24"
                    : "#9ca3af",
              fontSize: 10,
            }}
          >
            {label}
          </span>
        </div>
      </td>
      <td
        style={{
          padding: "2px 8px",
          textAlign: "center",
          color: voice.consumerCount > 0 ? "#fbbf24" : "#6b7280",
          fontSize: 10,
        }}
      >
        {voice.consumerCount}
      </td>
    </tr>
  );
};

const VoiceMonitorUi: React.FC<NodeUiProps<VoiceMonitorNode>> = ({
  node,
  audioState,
}) => {
  const getRuntimeState = useRuntimeStateGetter<VoiceMonitorRuntimeState>(
    node.id
  );
  const [state, setState] = useState<VoiceMonitorRuntimeState>({
    connected: false,
    voices: [],
    allocationState: null,
  });

  useEffect(() => {
    if (audioState !== "running") return;

    let raf = 0;
    const tick = () => {
      const runtimeState = getRuntimeState();
      if (runtimeState) {
        setState(runtimeState);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  const allocationInfo =
    state.allocationState?.type === "shrinking"
      ? `shrinking ${state.allocationState.currentCount} → ${state.allocationState.targetCount}`
      : null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          background: "rgba(0,0,0,0.4)",
          borderRadius: 4,
          padding: 8,
          minHeight: 80,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {!state.connected ? (
          <div style={{ opacity: 0.5, fontStyle: "italic" }}>
            Not connected to voice allocator
          </div>
        ) : state.voices.length === 0 ? (
          <div style={{ opacity: 0.5, fontStyle: "italic" }}>No voices</div>
        ) : (
          <>
            {allocationInfo && (
              <div
                style={{
                  marginBottom: 8,
                  padding: "4px 8px",
                  background: "rgba(245, 158, 11, 0.2)",
                  borderRadius: 4,
                  color: "#fbbf24",
                  fontSize: 10,
                }}
              >
                {allocationInfo}
              </div>
            )}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th
                    style={{
                      padding: "2px 8px",
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "#9ca3af",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      padding: "2px 8px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "#9ca3af",
                    }}
                  >
                    State
                  </th>
                  <th
                    style={{
                      padding: "2px 8px",
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "#9ca3af",
                    }}
                  >
                    Held
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.voices.map((voice) => (
                  <VoiceIndicator key={voice.index} voice={voice} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};

export const voiceMonitorGraph: NodeDefinition<VoiceMonitorNode> = {
  type: "voiceMonitor",
  title: "Voice Monitor",
  defaultState,
  ports: () => [
    { id: "gate_in", name: "Gate", kind: "gate", direction: "in" },
    { id: "gate_out", name: "Gate", kind: "gate", direction: "out" },
  ],
  ui: VoiceMonitorUi,
  normalizeState: () => ({}),
};
