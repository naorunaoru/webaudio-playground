import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { getMidiManager } from "@audio/midiManager";
import type { ParsedMidi } from "@audio/midiParser";
import schedulerProcessorUrl from "./processor.ts?worklet";

type MidiPlayerGraphNode = Extract<GraphNode, { type: "midiPlayer" }>;

export type MidiPlayerRuntimeState = {
  midiId: string | null;
  playing: boolean;
  currentTick: number;
  durationTicks: number;
};

// Set to true to enable MIDI debug instrumentation (jitter + event stats)
const MIDI_DEBUG = false;

// Worklet registration per AudioContext
const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureSchedulerWorkletLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(schedulerProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

// Jitter measurement
const jitterStats = {
  samples: [] as number[],
  maxSamples: 200,
  add(jitterMs: number) {
    if (!MIDI_DEBUG) return;
    this.samples.push(jitterMs);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  },
  getStats() {
    if (this.samples.length === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const max = sorted[sorted.length - 1];
    return { avg, p50, p95, p99, max, count: sorted.length };
  },
  clear() {
    this.samples = [];
  },
  print() {
    const stats = this.getStats();
    if (!stats) {
      console.log("No jitter data collected yet");
      return;
    }
    console.log(
      `MIDI Jitter (ms): avg=${stats.avg.toFixed(2)}, p50=${stats.p50.toFixed(2)}, ` +
        `p95=${stats.p95.toFixed(2)}, p99=${stats.p99.toFixed(2)}, max=${stats.max.toFixed(2)} (n=${stats.count})`,
    );
  },
};

// Event tracking stats
const eventStats = {
  scheduled: { noteOn: 0, noteOff: 0, cc: 0, pitchBend: 0, programChange: 0 },
  dispatched: { noteOn: 0, noteOff: 0, cc: 0, pitchBend: 0, programChange: 0 },
  schedule(type: "noteOn" | "noteOff" | "cc" | "pitchBend" | "programChange") {
    if (!MIDI_DEBUG) return;
    this.scheduled[type]++;
  },
  dispatch(type: "noteOn" | "noteOff" | "cc" | "pitchBend" | "programChange") {
    if (!MIDI_DEBUG) return;
    this.dispatched[type]++;
  },
  clear() {
    this.scheduled = { noteOn: 0, noteOff: 0, cc: 0, pitchBend: 0, programChange: 0 };
    this.dispatched = { noteOn: 0, noteOff: 0, cc: 0, pitchBend: 0, programChange: 0 };
  },
  print() {
    const types = ["noteOn", "noteOff", "cc", "pitchBend", "programChange"] as const;
    console.log("MIDI Event Stats:");
    for (const type of types) {
      const sched = this.scheduled[type];
      const disp = this.dispatched[type];
      if (sched > 0) {
        console.log(`  ${type}: scheduled=${sched}, dispatched=${disp}`);
      }
    }
    const totalSched = types.reduce((sum, t) => sum + this.scheduled[t], 0);
    const totalDisp = types.reduce((sum, t) => sum + this.dispatched[t], 0);
    console.log(`  TOTAL: scheduled=${totalSched}, dispatched=${totalDisp}`);
  },
};

// Expose to window for debugging
(globalThis as any).__midiJitterStats = jitterStats;
(globalThis as any).__midiEventStats = eventStats;

// Flattened MIDI event type (must match processor.ts)
type FlatMidiEvent = {
  sampleTime: number;
  type: "noteOn" | "noteOff" | "cc" | "pitchBend" | "programChange";
  note?: number;
  velocity?: number;
  channel: number;
  controller?: number;
  value?: number;
  program?: number;
};

/**
 * Convert parsed MIDI to flat event list with pre-computed sample times.
 * This is sent to the worklet for playback.
 */
function flattenMidiToEvents(
  parsedMidi: ParsedMidi,
  sampleRate: number,
  tempoMultiplier: number,
): { events: FlatMidiEvent[]; durationSamples: number } {
  const events: FlatMidiEvent[] = [];
  const ticksPerBeat = parsedMidi.ticksPerBeat;
  const tempoChanges = parsedMidi.tempoChanges;

  // Build tempo map: tick -> cumulative sample time
  const tempoMap: Array<{
    tick: number;
    sampleTime: number;
    samplesPerTick: number;
  }> = [];
  let cumulativeSamples = 0;
  let lastTick = 0;
  let lastBpm = tempoChanges[0]?.bpm ?? 120;

  tempoMap.push({
    tick: 0,
    sampleTime: 0,
    samplesPerTick:
      (60 / (lastBpm * tempoMultiplier) / ticksPerBeat) * sampleRate,
  });

  for (const tc of tempoChanges) {
    if (tc.tick > lastTick) {
      const tickDelta = tc.tick - lastTick;
      const effectiveBpm = lastBpm * tempoMultiplier;
      const secondsPerTick = 60 / effectiveBpm / ticksPerBeat;
      cumulativeSamples += tickDelta * secondsPerTick * sampleRate;
    }
    const effectiveBpm = tc.bpm * tempoMultiplier;
    tempoMap.push({
      tick: tc.tick,
      sampleTime: cumulativeSamples,
      samplesPerTick: (60 / effectiveBpm / ticksPerBeat) * sampleRate,
    });
    lastTick = tc.tick;
    lastBpm = tc.bpm;
  }

  // Helper to convert tick to sample time
  function tickToSample(tick: number): number {
    // Binary search for tempo segment
    let lo = 0;
    let hi = tempoMap.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (tempoMap[mid].tick <= tick) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const segment = tempoMap[lo];
    const tickDelta = tick - segment.tick;
    return Math.floor(segment.sampleTime + tickDelta * segment.samplesPerTick);
  }

  // Flatten all tracks into single event list
  for (const track of parsedMidi.tracks) {
    // Notes -> noteOn and noteOff events
    for (const note of track.notes) {
      events.push({
        sampleTime: tickToSample(note.tick),
        type: "noteOn",
        note: note.note,
        velocity: note.velocity,
        channel: note.channel,
      });
      events.push({
        sampleTime: tickToSample(note.tick + note.duration),
        type: "noteOff",
        note: note.note,
        velocity: 0,
        channel: note.channel,
      });
    }

    // Control changes
    for (const cc of track.controlChanges) {
      events.push({
        sampleTime: tickToSample(cc.tick),
        type: "cc",
        controller: cc.controller,
        value: cc.value,
        channel: cc.channel,
      });
    }

    // Pitch bends
    for (const pb of track.pitchBends) {
      events.push({
        sampleTime: tickToSample(pb.tick),
        type: "pitchBend",
        value: pb.value,
        channel: pb.channel,
      });
    }

    // Program changes
    for (const pc of track.programChanges) {
      events.push({
        sampleTime: tickToSample(pc.tick),
        type: "programChange",
        program: pc.program,
        channel: pc.channel,
      });
    }
  }

  // Sort by sample time
  events.sort((a, b) => a.sampleTime - b.sampleTime);

  // Count events for stats
  for (const event of events) {
    eventStats.schedule(event.type);
  }

  const durationSamples = tickToSample(parsedMidi.durationTicks);

  return { events, durationSamples };
}

function createMidiPlayerRuntime(
  ctx: AudioContext,
  nodeId: NodeId,
  services: AudioNodeServices,
): AudioNodeInstance<MidiPlayerGraphNode> {
  let graphRef: GraphState | null = null;
  let currentState: MidiPlayerGraphNode["state"] | null = null;
  let parsedMidi: ParsedMidi | null = null;
  let loadedMidiId: string | null = null;

  // Runtime-only playing state
  let isPlaying = false;

  // Worklet node
  let workletNode: AudioWorkletNode | null = null;
  let workletReady = false;

  // For tracking playback position (updated from worklet messages)
  let playStartSample = 0;

  function dispatchMidiEvent(event: MidiEvent): void {
    if (!graphRef) return;
    services.dispatchMidi(graphRef, nodeId, event);
  }

  async function initWorklet(): Promise<void> {
    if (workletNode) return;

    try {
      await ensureSchedulerWorkletLoaded(ctx);

      workletNode = new AudioWorkletNode(ctx, "midi-player", {
        numberOfInputs: 0,
        numberOfOutputs: 1, // Need at least one output for worklet to be valid
        outputChannelCount: [1],
      });

      workletNode.port.onmessage = (event) => {
        const msg = event.data;

        if (msg.type === "midiEvent") {
          // Calculate jitter: difference between scheduled and actual sample time
          // This measures the quantization to render quantum boundaries (128 samples)
          const sampleJitter = msg.actualSample - msg.scheduledSample;
          const jitterMs = (sampleJitter / ctx.sampleRate) * 1000;
          jitterStats.add(jitterMs);

          eventStats.dispatch(msg.eventType);

          // Convert to MidiEvent and dispatch
          if (msg.eventType === "noteOn") {
            dispatchMidiEvent({
              type: "noteOn",
              note: msg.note,
              velocity: msg.velocity,
              channel: msg.channel,
            });
          } else if (msg.eventType === "noteOff") {
            dispatchMidiEvent({
              type: "noteOff",
              note: msg.note,
              channel: msg.channel,
            });
          } else if (msg.eventType === "cc") {
            dispatchMidiEvent({
              type: "cc",
              controller: msg.controller,
              value: msg.value,
              channel: msg.channel,
            });
          } else if (msg.eventType === "pitchBend") {
            dispatchMidiEvent({
              type: "pitchBend",
              value: msg.value,
              channel: msg.channel,
            });
          } else if (msg.eventType === "programChange") {
            dispatchMidiEvent({
              type: "programChange",
              program: msg.program ?? 0,
              channel: msg.channel,
            });
          }
        } else if (msg.type === "playbackEnded") {
          isPlaying = false;
          if (MIDI_DEBUG) {
            jitterStats.print();
            eventStats.print();
          }
        }
      };

      workletReady = true;
    } catch (e) {
      console.error("Failed to initialize MIDI player worklet:", e);
    }
  }

  function sendMidiToWorklet(): void {
    if (!workletNode || !parsedMidi || !workletReady) return;

    const tempoMultiplier = currentState?.tempoMultiplier ?? 1;
    const { events, durationSamples } = flattenMidiToEvents(
      parsedMidi,
      ctx.sampleRate,
      tempoMultiplier,
    );

    workletNode.port.postMessage({
      type: "loadMidi",
      events,
      durationSamples,
    });
  }

  function play(): void {
    if (isPlaying || !parsedMidi || !workletNode || !workletReady) return;

    isPlaying = true;
    jitterStats.clear();
    eventStats.clear();

    // Re-send MIDI data in case tempo changed
    sendMidiToWorklet();

    // Get current sample frame for precise start time
    // Note: We need to account for the message delay to worklet
    // Using a slightly future time helps ensure accurate start
    const startSample = Math.floor(ctx.currentTime * ctx.sampleRate);
    playStartSample = startSample;

    workletNode.port.postMessage({
      type: "play",
      startSample,
    });

    // Update loop state
    workletNode.port.postMessage({
      type: "setLoop",
      loop: currentState?.loop ?? false,
    });
  }

  function stop(): void {
    if (!isPlaying) return;
    isPlaying = false;

    workletNode?.port.postMessage({ type: "stop" });

    if (MIDI_DEBUG) {
      jitterStats.print();
      eventStats.print();
    }
  }

  async function loadMidi(midiId: string): Promise<void> {
    if (loadedMidiId === midiId) return;

    try {
      parsedMidi = await getMidiManager().getParsedMidi(midiId);
      loadedMidiId = midiId;

      // Initialize worklet if needed and send MIDI data
      await initWorklet();
      sendMidiToWorklet();
    } catch (e) {
      console.error("Failed to load MIDI:", e);
      parsedMidi = null;
      loadedMidiId = null;
    }
  }

  return {
    type: "midiPlayer",

    updateState: async (state) => {
      const midiChanged = state.midiId !== currentState?.midiId;
      const tempoChanged =
        state.tempoMultiplier !== currentState?.tempoMultiplier;
      const loopChanged = state.loop !== currentState?.loop;
      currentState = state;

      // Load MIDI if changed
      if (state.midiId && midiChanged) {
        stop();
        await loadMidi(state.midiId);
      }

      // Re-send MIDI data if tempo changed (sample times need recalculation)
      if (tempoChanged && parsedMidi && workletReady) {
        const wasPlaying = isPlaying;
        if (wasPlaying) stop();
        sendMidiToWorklet();
        if (wasPlaying) play();
      }

      // Update loop state
      if (loopChanged && workletNode) {
        workletNode.port.postMessage({
          type: "setLoop",
          loop: state.loop,
        });
      }

      if (!state.midiId) {
        stop();
        parsedMidi = null;
        loadedMidiId = null;
      }
    },

    setGraphRef: (graph) => {
      graphRef = graph;
    },

    onRemove: () => {
      stop();
      if (workletNode) {
        workletNode.port.close();
        workletNode.disconnect();
        workletNode = null;
      }
    },

    handleCommand: (command: string) => {
      if (command === "play") {
        play();
      } else if (command === "stop") {
        stop();
      } else if (command === "toggle") {
        if (isPlaying) {
          stop();
        } else {
          play();
        }
      }
    },

    getRuntimeState: (): MidiPlayerRuntimeState => {
      let currentTick = 0;
      if (parsedMidi && isPlaying) {
        // Estimate current tick from elapsed samples
        const currentSample = Math.floor(ctx.currentTime * ctx.sampleRate);
        const elapsedSamples = currentSample - playStartSample;
        // Rough estimate using average tempo (could be more precise with tempo map)
        const tempoMultiplier = currentState?.tempoMultiplier ?? 1;
        const bpm = (parsedMidi.tempoChanges[0]?.bpm ?? 120) * tempoMultiplier;
        const samplesPerTick =
          (60 / bpm / parsedMidi.ticksPerBeat) * ctx.sampleRate;
        currentTick = Math.floor(elapsedSamples / samplesPerTick);
      }
      return {
        midiId: currentState?.midiId ?? null,
        playing: isPlaying,
        currentTick,
        durationTicks: parsedMidi?.durationTicks ?? 0,
      };
    },
  };
}

export function midiPlayerAudioFactory(
  services: AudioNodeServices,
): AudioNodeFactory<MidiPlayerGraphNode> {
  return {
    type: "midiPlayer",
    create: (ctx, nodeId) => createMidiPlayerRuntime(ctx, nodeId, services),
  };
}
