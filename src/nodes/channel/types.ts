export type ChannelConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type ChannelState = {
  /** Whether MIDI input is enabled (user intent to connect) */
  enabled: boolean;
  /** Persisted device ID for auto-reconnect */
  selectedDeviceId: string | null;
  /** MIDI channel filter (1-16), null means all channels */
  midiChannel: number | null;
};

/** Runtime state exposed to UI via getRuntimeState */
export type ChannelRuntimeState = {
  status: ChannelConnectionStatus;
  errorMessage: string | null;
  devices: Array<{ id: string; name: string }>;
  connectedDeviceName: string | null;
  /** Timestamp of last MIDI activity (for activity indicator) */
  lastActivityMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    channel: ChannelState;
  }
}
