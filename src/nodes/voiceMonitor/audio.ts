import type { GraphNode, GraphState, NodeId, VoiceEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import type { VoiceMonitorRuntimeState, VoiceInfo } from "./types";
import { findAllocator } from "@/audio/allocatorDiscovery";
import type { VoiceAllocator } from "@/audio/voiceAllocator";

type VoiceMonitorNode = Extract<GraphNode, { type: "voiceMonitor" }>;

function createVoiceMonitorRuntime(
  nodeId: NodeId,
  getAudioNode: AudioNodeServices["getAudioNode"]
): AudioNodeInstance<VoiceMonitorNode> {
  let allocator: VoiceAllocator | null = null;
  let graphRef: GraphState | null = null;

  const refreshAllocator = () => {
    if (!graphRef) {
      allocator = null;
      return;
    }

    const result = findAllocator(graphRef, nodeId, "gate_in", getAudioNode);
    allocator = result?.allocator ?? null;
  };

  return {
    type: "voiceMonitor",

    updateState: () => {
      // No state to update
    },

    setGraphRef: (graph) => {
      graphRef = graph;
    },

    onConnectionsChanged: () => {
      refreshAllocator();
    },

    handleEvent: (_portId: string, _event: VoiceEvent) => {
      // Refresh allocator reference on events in case it wasn't set
      if (!allocator) {
        refreshAllocator();
      }
      // Pass through - don't consume
      return {};
    },

    getRuntimeState: (): VoiceMonitorRuntimeState => {
      if (!allocator) {
        refreshAllocator();
      }

      if (!allocator) {
        return {
          connected: false,
          voices: [],
          allocationState: null,
        };
      }

      const voiceCount = allocator.getVoiceCount();
      const voices: VoiceInfo[] = [];

      for (let i = 0; i < voiceCount; i++) {
        const state = allocator.getVoiceState(i);
        if (state) {
          voices.push({
            index: state.index,
            noteActive: state.noteActive,
            consumerCount: state.consumers.size,
          });
        }
      }

      return {
        connected: true,
        voices,
        allocationState: allocator.getAllocationState(),
      };
    },

    onRemove: () => {
      allocator = null;
    },
  };
}

export function voiceMonitorAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<VoiceMonitorNode> {
  return {
    type: "voiceMonitor",
    create: (_ctx, nodeId) => createVoiceMonitorRuntime(nodeId, services.getAudioNode),
  };
}
