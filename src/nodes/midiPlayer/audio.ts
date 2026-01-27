import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { getMidiManager } from "@audio/midiManager";
import type { ParsedMidi } from "@audio/midiParser";

type MidiPlayerGraphNode = Extract<GraphNode, { type: "midiPlayer" }>;

export type MidiPlayerRuntimeState = {
  midiId: string | null;
  playing: boolean;
  currentTick: number;
  durationTicks: number;
};

const LOOKAHEAD_MS = 100;
const SCHEDULE_INTERVAL_MS = 25;

function createMidiPlayerRuntime(
  ctx: AudioContext,
  nodeId: NodeId,
  services: AudioNodeServices
): AudioNodeInstance<MidiPlayerGraphNode> {
  let graphRef: GraphState | null = null;
  let currentState: MidiPlayerGraphNode["state"] | null = null;
  let parsedMidi: ParsedMidi | null = null;
  let loadedMidiId: string | null = null;

  // Runtime-only playing state (not persisted in Automerge)
  let isPlaying = false;

  // Scheduling state
  let schedulerInterval: number | null = null;
  let lastScheduledTick = 0;
  let playStartTime = 0;
  let playStartTick = 0;

  // Track scheduled events to avoid duplicates
  const scheduledEvents = new Set<string>();

  // Precomputed tempo map: array of { tick, timeSeconds } for fast lookup
  let tempoMap: Array<{ tick: number; time: number }> = [];

  function buildTempoMap(): void {
    if (!parsedMidi) {
      tempoMap = [];
      return;
    }

    const multiplier = currentState?.tempoMultiplier ?? 1;
    const ticksPerBeat = parsedMidi.ticksPerBeat;
    const tempoChanges = parsedMidi.tempoChanges;

    tempoMap = [];
    let currentTime = 0;
    let lastTick = 0;
    let lastBpm = tempoChanges[0]?.bpm ?? 120;

    // Add starting point
    tempoMap.push({ tick: 0, time: 0 });

    for (const tc of tempoChanges) {
      if (tc.tick > lastTick) {
        // Calculate time elapsed from lastTick to tc.tick at lastBpm
        const tickDelta = tc.tick - lastTick;
        const effectiveBpm = lastBpm * multiplier;
        const secondsPerBeat = 60 / effectiveBpm;
        const secondsPerTick = secondsPerBeat / ticksPerBeat;
        currentTime += tickDelta * secondsPerTick;
      }
      tempoMap.push({ tick: tc.tick, time: currentTime });
      lastTick = tc.tick;
      lastBpm = tc.bpm;
    }

    // Add endpoint for duration
    if (parsedMidi.durationTicks > lastTick) {
      const tickDelta = parsedMidi.durationTicks - lastTick;
      const effectiveBpm = lastBpm * multiplier;
      const secondsPerBeat = 60 / effectiveBpm;
      const secondsPerTick = secondsPerBeat / ticksPerBeat;
      currentTime += tickDelta * secondsPerTick;
      tempoMap.push({ tick: parsedMidi.durationTicks, time: currentTime });
    }

  }

  function tickToSeconds(tick: number): number {
    if (!parsedMidi || tempoMap.length === 0) return 0;

    const multiplier = currentState?.tempoMultiplier ?? 1;
    const ticksPerBeat = parsedMidi.ticksPerBeat;
    const tempoChanges = parsedMidi.tempoChanges;

    // Binary search for the tempo segment containing this tick
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

    // Find the BPM at this segment
    let bpm = tempoChanges[0]?.bpm ?? 120;
    for (const tc of tempoChanges) {
      if (tc.tick <= segment.tick) {
        bpm = tc.bpm;
      } else {
        break;
      }
    }

    const effectiveBpm = bpm * multiplier;
    const secondsPerBeat = 60 / effectiveBpm;
    const secondsPerTick = secondsPerBeat / ticksPerBeat;

    return segment.time + tickDelta * secondsPerTick;
  }

  function secondsToTick(seconds: number): number {
    if (!parsedMidi || tempoMap.length === 0) return 0;

    const multiplier = currentState?.tempoMultiplier ?? 1;
    const ticksPerBeat = parsedMidi.ticksPerBeat;
    const tempoChanges = parsedMidi.tempoChanges;

    // Binary search for the tempo segment containing this time
    let lo = 0;
    let hi = tempoMap.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (tempoMap[mid].time <= seconds) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    const segment = tempoMap[lo];
    const timeDelta = seconds - segment.time;

    // Find the BPM at this segment
    let bpm = tempoChanges[0]?.bpm ?? 120;
    for (const tc of tempoChanges) {
      if (tc.tick <= segment.tick) {
        bpm = tc.bpm;
      } else {
        break;
      }
    }

    const effectiveBpm = bpm * multiplier;
    const secondsPerBeat = 60 / effectiveBpm;
    const secondsPerTick = secondsPerBeat / ticksPerBeat;

    return segment.tick + timeDelta / secondsPerTick;
  }

  function dispatchMidiEvent(event: MidiEvent): void {
    if (!graphRef) return;
    services.dispatchMidi(graphRef, nodeId, event);
  }

  function scheduleNoteOn(
    note: number,
    velocity: number,
    channel: number,
    timeFromNow: number
  ): void {
    if (timeFromNow <= 0) {
      dispatchMidiEvent({ type: "noteOn", note, velocity, channel });
    } else {
      setTimeout(() => {
        if (isPlaying) {
          dispatchMidiEvent({ type: "noteOn", note, velocity, channel });
        }
      }, timeFromNow * 1000);
    }
  }

  function scheduleNoteOff(note: number, channel: number, timeFromNow: number): void {
    if (timeFromNow <= 0) {
      dispatchMidiEvent({ type: "noteOff", note, channel });
    } else {
      setTimeout(() => {
        // Always send note-off even if stopped (to release held notes)
        dispatchMidiEvent({ type: "noteOff", note, channel });
      }, timeFromNow * 1000);
    }
  }

  function scheduleEvents(fromTick: number, toTick: number): void {
    if (!parsedMidi || !graphRef) return;

    const currentTime = ctx.currentTime;

    for (const track of parsedMidi.tracks) {
      for (const note of track.notes) {
        // Schedule note-on
        if (note.tick >= fromTick && note.tick < toTick) {
          const eventKey = `on-${note.tick}-${note.channel}-${note.note}`;
          if (!scheduledEvents.has(eventKey)) {
            scheduledEvents.add(eventKey);
            const ticksFromStart = note.tick - playStartTick;
            const secondsFromStart = tickToSeconds(ticksFromStart);
            const noteOnTime = playStartTime + secondsFromStart;
            const timeFromNow = noteOnTime - currentTime;
            scheduleNoteOn(note.note, note.velocity, note.channel, timeFromNow);
          }
        }

        // Schedule note-off
        const noteOffTick = note.tick + note.duration;
        if (noteOffTick >= fromTick && noteOffTick < toTick) {
          const eventKey = `off-${noteOffTick}-${note.channel}-${note.note}`;
          if (!scheduledEvents.has(eventKey)) {
            scheduledEvents.add(eventKey);
            const ticksFromStart = noteOffTick - playStartTick;
            const secondsFromStart = tickToSeconds(ticksFromStart);
            const noteOffTime = playStartTime + secondsFromStart;
            const timeFromNow = noteOffTime - currentTime;
            scheduleNoteOff(note.note, note.channel, timeFromNow);
          }
        }
      }

      // Schedule CC events
      for (const cc of track.controlChanges) {
        if (cc.tick >= fromTick && cc.tick < toTick) {
          const eventKey = `cc-${cc.tick}-${cc.channel}-${cc.controller}`;
          if (!scheduledEvents.has(eventKey)) {
            scheduledEvents.add(eventKey);
            const ccTime = playStartTime + tickToSeconds(cc.tick - playStartTick);
            const timeFromNow = ccTime - currentTime;
            if (timeFromNow <= 0) {
              dispatchMidiEvent({
                type: "cc",
                controller: cc.controller,
                value: cc.value,
                channel: cc.channel,
              });
            } else {
              setTimeout(() => {
                if (isPlaying) {
                  dispatchMidiEvent({
                    type: "cc",
                    controller: cc.controller,
                    value: cc.value,
                    channel: cc.channel,
                  });
                }
              }, timeFromNow * 1000);
            }
          }
        }
      }

      // Schedule pitch bends
      for (const pb of track.pitchBends) {
        if (pb.tick >= fromTick && pb.tick < toTick) {
          const eventKey = `pb-${pb.tick}-${pb.channel}`;
          if (!scheduledEvents.has(eventKey)) {
            scheduledEvents.add(eventKey);
            const pbTime = playStartTime + tickToSeconds(pb.tick - playStartTick);
            const timeFromNow = pbTime - currentTime;
            if (timeFromNow <= 0) {
              dispatchMidiEvent({
                type: "pitchBend",
                value: pb.value,
                channel: pb.channel,
              });
            } else {
              setTimeout(() => {
                if (isPlaying) {
                  dispatchMidiEvent({
                    type: "pitchBend",
                    value: pb.value,
                    channel: pb.channel,
                  });
                }
              }, timeFromNow * 1000);
            }
          }
        }
      }
    }
  }

  function startScheduler(): void {
    if (schedulerInterval !== null) return;
    if (!parsedMidi) return;

    playStartTime = ctx.currentTime;
    playStartTick = 0;
    lastScheduledTick = 0;
    scheduledEvents.clear();

    schedulerInterval = window.setInterval(() => {
      if (!parsedMidi || !isPlaying) return;

      const elapsed = ctx.currentTime - playStartTime;
      const elapsedTicks = secondsToTick(elapsed);
      const currentTick = playStartTick + elapsedTicks;
      const lookaheadSeconds = LOOKAHEAD_MS / 1000;
      const lookaheadTicks = secondsToTick(elapsed + lookaheadSeconds) - elapsedTicks;
      const targetTick = currentTick + lookaheadTicks;

      if (currentTick >= parsedMidi.durationTicks) {
        if (currentState?.loop) {
          // Reset for loop
          playStartTime = ctx.currentTime;
          playStartTick = 0;
          lastScheduledTick = 0;
          scheduledEvents.clear();
        } else {
          // Song ended - stop playback
          stop();
          return;
        }
      }

      scheduleEvents(lastScheduledTick, targetTick);
      lastScheduledTick = targetTick;
    }, SCHEDULE_INTERVAL_MS);
  }

  function stopScheduler(): void {
    if (schedulerInterval !== null) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
    scheduledEvents.clear();

    // Send All Notes Off (CC 123) for all channels (MIDI uses 0-15)
    for (let channel = 0; channel < 16; channel++) {
      dispatchMidiEvent({ type: "cc", controller: 123, value: 0, channel });
    }
  }

  function play(): void {
    if (isPlaying || !parsedMidi) return;
    isPlaying = true;
    startScheduler();
  }

  function stop(): void {
    if (!isPlaying) return;
    isPlaying = false;
    stopScheduler();
  }

  async function loadMidi(midiId: string): Promise<void> {
    if (loadedMidiId === midiId) return;

    try {
      parsedMidi = await getMidiManager().getParsedMidi(midiId);
      loadedMidiId = midiId;
      buildTempoMap();
    } catch (e) {
      console.error("Failed to load MIDI:", e);
      parsedMidi = null;
      loadedMidiId = null;
      tempoMap = [];
    }
  }

  return {
    type: "midiPlayer",
    updateState: async (state) => {
      const midiChanged = state.midiId !== currentState?.midiId;
      const tempoChanged = state.tempoMultiplier !== currentState?.tempoMultiplier;
      currentState = state;

      // Load MIDI if changed
      if (state.midiId && midiChanged) {
        stop(); // Stop playback when MIDI changes
        await loadMidi(state.midiId);
      }

      // Rebuild tempo map if tempo multiplier changed
      if (tempoChanged && parsedMidi) {
        buildTempoMap();
      }

      if (!state.midiId) {
        stop();
        parsedMidi = null;
        loadedMidiId = null;
        tempoMap = [];
      }
    },
    setGraphRef: (graph) => {
      graphRef = graph;
    },
    onRemove: () => {
      stop();
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
      if (parsedMidi && isPlaying && schedulerInterval !== null) {
        const elapsed = ctx.currentTime - playStartTime;
        currentTick = playStartTick + secondsToTick(elapsed);
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
  services: AudioNodeServices
): AudioNodeFactory<MidiPlayerGraphNode> {
  return {
    type: "midiPlayer",
    create: (ctx, nodeId) => createMidiPlayerRuntime(ctx, nodeId, services),
  };
}
