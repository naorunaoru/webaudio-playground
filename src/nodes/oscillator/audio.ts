import type { AudioGraphContext } from "@audio/context";
import { midiToFreqHz } from "@audio/context";
import type { GraphNode, MidiEvent, NodeId } from "@graph/types";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";

type OscillatorGraphNode = Extract<GraphNode, { type: "oscillator" }>;

function createOscillatorRuntime(
  ctx: AudioContext,
  _nodeId: NodeId,
  graphContext: AudioGraphContext
): AudioNodeInstance<OscillatorGraphNode> {
  const output = ctx.createGain();
  output.gain.value = 1;

  const waveSelect = ctx.createGain();
  waveSelect.gain.value = 1;

  const noiseSelect = ctx.createGain();
  noiseSelect.gain.value = 0;

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(
    meter.fftSize
  ) as Float32Array<ArrayBufferLike>;

  // Noise buffer is reusable
  const noiseBuffer = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * 1.0)),
    ctx.sampleRate
  );
  const noise = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

  waveSelect.connect(output);
  noiseSelect.connect(output);
  output.connect(meter);

  // Track active sources - created/destroyed based on connection state
  let osc: OscillatorNode | null = null;
  let noiseSource: AudioBufferSourceNode | null = null;
  let isConnected = false;

  // Current state for recreating sources
  let currentWaveform: OscillatorType = "sine";
  let currentA4 = graphContext.getValues().a4Hz;
  let currentFrequency = currentA4;

  // Subscribe to A4 changes
  const unsubscribeA4 = graphContext.subscribe("a4Hz", (a4Hz) => {
    const prevA4 = currentA4;
    currentA4 = a4Hz;

    // Retune currently playing notes if A4 changed
    if (osc && activeNotes.size > 0 && prevA4 !== a4Hz) {
      const lastNote = Array.from(activeNotes).pop()!;
      const hz = midiToFreqHz(lastNote, currentA4);
      currentFrequency = hz;
      osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
    }
  });

  const startSources = () => {
    if (osc || noiseSource) return; // Already running

    osc = ctx.createOscillator();
    osc.type = currentWaveform;
    osc.frequency.value = currentFrequency;
    osc.connect(waveSelect);
    osc.start();

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseSource.connect(noiseSelect);
    noiseSource.start();
  };

  const stopSources = () => {
    if (osc) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
      osc = null;
    }
    if (noiseSource) {
      try {
        noiseSource.stop();
        noiseSource.disconnect();
      } catch {
        // ignore
      }
      noiseSource = null;
    }
  };

  // Track active notes for control surface display
  const activeNotes = new Set<number>();

  // Stable runtime state - replace reference only when values change
  let runtimeState: { activeNotes: number[] } = { activeNotes: [] };

  return {
    type: "oscillator",
    updateState: (state) => {
      const now = ctx.currentTime;
      currentWaveform = state.waveform;
      if (osc) {
        osc.type = state.waveform;
      }
      const targetWave = state.source === "wave" ? 1 : 0;
      const targetNoise = state.source === "noise" ? 1 : 0;
      waveSelect.gain.setTargetAtTime(targetWave, now, 0.01);
      noiseSelect.gain.setTargetAtTime(targetNoise, now, 0.01);
    },
    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return [meter];
      return [];
    },
    handleMidi: (event, portId) => {
      if (portId && portId !== "midi_in") return;
      const now = ctx.currentTime;

      if (event.type === "noteOn") {
        const hz = midiToFreqHz(event.note, currentA4);
        currentFrequency = hz;
        if (osc) {
          osc.frequency.setValueAtTime(hz, now);
        }
        activeNotes.add(event.note);
        runtimeState = { activeNotes: Array.from(activeNotes) };
      }
      if (event.type === "noteOff") {
        activeNotes.delete(event.note);
        runtimeState = { activeNotes: Array.from(activeNotes) };
      }
    },
    getRuntimeState: () => runtimeState,
    onRemove: () => {
      unsubscribeA4();
      stopSources();
      meter.disconnect();
      output.disconnect();
      noiseSelect.disconnect();
      waveSelect.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    onConnectionsChanged: ({ outputs }) => {
      const connected = outputs.has("audio_out");
      if (connected && !isConnected) {
        startSources();
      } else if (!connected && isConnected) {
        stopSources();
      }
      isConnected = connected;
    },
  };
}

export function oscillatorAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<OscillatorGraphNode> {
  return {
    type: "oscillator",
    create: (ctx, nodeId) =>
      createOscillatorRuntime(ctx, nodeId, services.graphContext),
  };
}
