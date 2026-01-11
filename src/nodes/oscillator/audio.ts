import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type OscillatorGraphNode = Extract<GraphNode, { type: "oscillator" }>;

const A4_HZ = 440;

function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}

function rmsFromAnalyser(
  analyser: AnalyserNode,
  buffer: Float32Array<ArrayBufferLike>
): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

function createOscillatorRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<OscillatorGraphNode> {
  const output = ctx.createGain();
  output.gain.value = 1;

  const osc = ctx.createOscillator();
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

  const noiseBuffer = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * 1.0)),
    ctx.sampleRate
  );
  const noise = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  osc.connect(waveSelect);
  waveSelect.connect(output);

  noiseSource.connect(noiseSelect);
  noiseSelect.connect(output);

  output.connect(meter);

  osc.start();
  noiseSource.start();

  // Track active notes for control surface display
  const activeNotes = new Set<number>();

  // Stable runtime state - replace reference only when values change
  let runtimeState: { activeNotes: number[] } = { activeNotes: [] };

  return {
    type: "oscillator",
    updateState: (state) => {
      const now = ctx.currentTime;
      osc.type = state.waveform;
      const targetWave = state.source === "wave" ? 1 : 0;
      const targetNoise = state.source === "noise" ? 1 : 0;
      waveSelect.gain.setTargetAtTime(targetWave, now, 0.01);
      noiseSelect.gain.setTargetAtTime(targetNoise, now, 0.01);
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      const now = ctx.currentTime;

      if (event.type === "noteOn") {
        const hz = midiToFreqHz(event.note, A4_HZ);
        osc.frequency.setValueAtTime(hz, now);
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
      meter.disconnect();
      output.disconnect();
      noiseSelect.disconnect();
      waveSelect.disconnect();
      noiseSource.disconnect();
      osc.disconnect();
      try {
        osc.stop();
      } catch {
        // ignore
      }
      try {
        noiseSource.stop();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function oscillatorAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<OscillatorGraphNode> {
  return {
    type: "oscillator",
    create: (ctx, nodeId) => createOscillatorRuntime(ctx, nodeId),
  };
}
