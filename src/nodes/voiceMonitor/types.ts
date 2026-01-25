import type { AllocationState } from "@/audio/voiceAllocator";

export type VoiceMonitorState = Record<string, never>;

export type VoiceInfo = {
  index: number;
  noteActive: boolean;
  consumerCount: number;
};

export type VoiceMonitorRuntimeState = {
  connected: boolean;
  voices: VoiceInfo[];
  allocationState: AllocationState | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    voiceMonitor: VoiceMonitorState;
  }
}
