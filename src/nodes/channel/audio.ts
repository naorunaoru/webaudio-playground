import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices, DispatchMidiFn } from "@/types/nodeModule";
import type {
  ChannelConnectionStatus,
  ChannelRuntimeState,
  ChannelState,
} from "./types";

type ChannelGraphNode = Extract<GraphNode, { type: "channel" }>;

type MidiDeviceInfo = {
  id: string;
  name: string;
};

function parseMidiMessage(
  data: Uint8Array,
  midiChannel: number | null
): MidiEvent | null {
  if (!data || data.length < 1) return null;

  const statusByte = data[0];
  const channel = (statusByte & 0x0f) + 1; // MIDI channels are 1-16
  const messageType = statusByte & 0xf0;

  // Filter by channel if set
  if (midiChannel !== null && channel !== midiChannel) {
    return null;
  }

  switch (messageType) {
    case 0x90: // Note On
      if (data.length >= 3) {
        const velocity = data[2];
        if (velocity > 0) {
          return { type: "noteOn", note: data[1], velocity, channel };
        } else {
          // Note On with velocity 0 is Note Off
          return { type: "noteOff", note: data[1], channel };
        }
      }
      break;
    case 0x80: // Note Off
      if (data.length >= 3) {
        return {
          type: "noteOff",
          note: data[1],
          releaseVelocity: data[2],
          channel,
        };
      }
      break;
    case 0xb0: // Control Change
      if (data.length >= 3) {
        return {
          type: "cc",
          controller: data[1],
          value: data[2],
          channel,
        };
      }
      break;
    case 0xe0: // Pitch Bend
      if (data.length >= 3) {
        // 14-bit value: LSB (data[1]) + MSB (data[2])
        // Center is 8192, range is 0-16383, we convert to -8192..8191
        const raw = data[1] | (data[2] << 7);
        return { type: "pitchBend", value: raw - 8192, channel };
      }
      break;
    case 0xd0: // Channel Pressure (Aftertouch)
      if (data.length >= 2) {
        return { type: "aftertouch", value: data[1], channel };
      }
      break;
    case 0xa0: // Polyphonic Key Pressure
      if (data.length >= 3) {
        return {
          type: "polyAftertouch",
          note: data[1],
          value: data[2],
          channel,
        };
      }
      break;
  }

  return null;
}

function createChannelRuntime(
  _ctx: AudioContext,
  nodeId: NodeId,
  dispatchMidi: DispatchMidiFn
): AudioNodeInstance<ChannelGraphNode> {
  let graphRef: GraphState | null = null;
  let currentState: ChannelState = {
    enabled: false,
    selectedDeviceId: null,
    midiChannel: null,
  };

  // Runtime state
  let status: ChannelConnectionStatus = "disconnected";
  let errorMessage: string | null = null;
  let devices: MidiDeviceInfo[] = [];
  let connectedDeviceName: string | null = null;
  let lastActivityMs: number | null = null;

  // WebMIDI refs
  let midiAccess: MIDIAccess | null = null;
  let activeInput: MIDIInput | null = null;

  const handleMidiMessage = (event: MIDIMessageEvent) => {
    if (!graphRef) return;
    const data = event.data;
    if (!data) return;

    const midiEvent = parseMidiMessage(data, currentState.midiChannel);
    if (midiEvent) {
      lastActivityMs = performance.now();
      dispatchMidi(graphRef, nodeId, midiEvent);
    }
  };

  const disconnectDevice = () => {
    if (activeInput) {
      activeInput.onmidimessage = null;
      activeInput = null;
    }
    status = "disconnected";
    connectedDeviceName = null;
  };

  const connectToDevice = (deviceId: string): boolean => {
    if (!midiAccess) return false;

    const input = midiAccess.inputs.get(deviceId);
    if (!input) return false;

    // Disconnect existing
    if (activeInput) {
      activeInput.onmidimessage = null;
    }

    input.onmidimessage = handleMidiMessage;
    activeInput = input;
    connectedDeviceName = input.name ?? "Unknown Device";
    status = "connected";
    return true;
  };

  const connect = async () => {
    status = "connecting";
    errorMessage = null;

    try {
      midiAccess = await navigator.requestMIDIAccess();

      // Build device list
      const deviceList: MidiDeviceInfo[] = [];
      midiAccess.inputs.forEach((input) => {
        deviceList.push({
          id: input.id,
          name: input.name ?? "Unknown Device",
        });
      });
      devices = deviceList;

      if (deviceList.length === 0) {
        status = "error";
        errorMessage = "No MIDI devices found";
        return;
      }

      // Try to reconnect to previously selected device
      if (currentState.selectedDeviceId) {
        if (connectToDevice(currentState.selectedDeviceId)) {
          return;
        }
      }

      // Auto-connect to first device
      connectToDevice(deviceList[0].id);
    } catch (err) {
      status = "error";
      errorMessage =
        err instanceof Error ? err.message : "Failed to access MIDI";
    }
  };

  const updateConnection = (state: ChannelState) => {
    const wasEnabled = currentState.enabled;
    const wasDeviceId = currentState.selectedDeviceId;
    currentState = state;

    if (state.enabled && !wasEnabled) {
      // User wants to connect
      void connect();
    } else if (!state.enabled && wasEnabled) {
      // User wants to disconnect
      disconnectDevice();
    } else if (
      state.enabled &&
      state.selectedDeviceId !== wasDeviceId &&
      state.selectedDeviceId
    ) {
      // Device changed while connected
      connectToDevice(state.selectedDeviceId);
    }
  };

  return {
    type: "channel",
    updateState: (state) => {
      updateConnection(state);
    },
    setGraphRef: (graph) => {
      graphRef = graph;
    },
    onRemove: () => {
      disconnectDevice();
      midiAccess = null;
    },
    getRuntimeState: (): ChannelRuntimeState => ({
      status,
      errorMessage,
      devices,
      connectedDeviceName,
      lastActivityMs,
    }),
  };
}

export function channelAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<ChannelGraphNode> {
  return {
    type: "channel",
    create: (ctx, nodeId) =>
      createChannelRuntime(ctx, nodeId, services.dispatchMidi),
  };
}
