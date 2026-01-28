/**
 * MIDI Player AudioWorklet Processor
 *
 * Handles all MIDI event scheduling internally on the audio thread for
 * sample-accurate timing. The processor maintains playback state and
 * posts MIDI events to the main thread at precise sample times.
 *
 * This approach eliminates jitter from main thread blocking - events are
 * scheduled based on the audio clock which runs at high priority.
 */

// Flattened MIDI event for efficient processing
type FlatMidiEvent = {
  sampleTime: number; // Pre-computed sample time from song start
  type: "noteOn" | "noteOff" | "cc" | "pitchBend" | "programChange";
  note?: number;
  velocity?: number;
  channel: number;
  controller?: number;
  value?: number;
  program?: number;
};

type TempoMapEntry = {
  tick: number;
  sampleTime: number; // Sample offset from song start
};

type LoadMidiMessage = {
  type: "loadMidi";
  events: FlatMidiEvent[];
  durationSamples: number;
};

type PlayMessage = {
  type: "play";
};

type StopMessage = {
  type: "stop";
};

type SetLoopMessage = {
  type: "setLoop";
  loop: boolean;
};

type SchedulerMessage = LoadMidiMessage | PlayMessage | StopMessage | SetLoopMessage;

// Output message types
type MidiEventMessage = {
  type: "midiEvent";
  eventType: "noteOn" | "noteOff" | "cc" | "pitchBend" | "programChange";
  note?: number;
  velocity?: number;
  channel: number;
  controller?: number;
  value?: number;
  program?: number;
  scheduledSample: number;
  actualSample: number;
};

type PlaybackEndedMessage = {
  type: "playbackEnded";
};

class MidiPlayerProcessor extends AudioWorkletProcessor {
  private events: FlatMidiEvent[] = [];
  private durationSamples = 0;
  private loop = false;

  // Playback state
  private playing = false;
  private playStartSample = 0; // Global sample when playback started
  private eventIndex = 0; // Current position in events array

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<SchedulerMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "loadMidi":
          this.events = msg.events;
          this.durationSamples = msg.durationSamples;
          this.eventIndex = 0;
          this.playing = false;
          break;

        case "play":
          this.playing = true;
          // Use the worklet's own currentFrame so playback position is
          // perfectly aligned — a startSample sent from the main thread
          // can be stale by the time this message arrives, causing early
          // events (like program changes at tick 0) to be skipped.
          this.playStartSample = currentFrame;
          this.eventIndex = 0;
          break;

        case "stop":
          this.playing = false;
          // Send all-notes-off for all channels
          for (let ch = 0; ch < 16; ch++) {
            this.port.postMessage({
              type: "midiEvent",
              eventType: "cc",
              controller: 123,
              value: 0,
              channel: ch,
              scheduledSample: currentFrame,
              actualSample: currentFrame,
            } satisfies MidiEventMessage);
          }
          break;

        case "setLoop":
          this.loop = msg.loop;
          break;
      }
    };
  }

  process(): boolean {
    if (!this.playing || this.events.length === 0) {
      return true;
    }

    const quantumStart = currentFrame;
    const quantumEnd = quantumStart + 128;

    // Calculate playback position in samples from song start
    const playbackPosition = quantumStart - this.playStartSample;
    const playbackEndPosition = quantumEnd - this.playStartSample;

    // Check for song end
    if (playbackPosition >= this.durationSamples) {
      if (this.loop) {
        // Reset for loop
        this.playStartSample = quantumStart;
        this.eventIndex = 0;
      } else {
        this.playing = false;
        this.port.postMessage({ type: "playbackEnded" } satisfies PlaybackEndedMessage);
        return true;
      }
    }

    // Fire all events that fall within this render quantum
    while (this.eventIndex < this.events.length) {
      const event = this.events[this.eventIndex];
      if (event.sampleTime >= playbackEndPosition) {
        break; // Event is in the future
      }

      if (event.sampleTime >= playbackPosition) {
        // Event should fire in this quantum
        const msg: MidiEventMessage = {
          type: "midiEvent",
          eventType: event.type,
          channel: event.channel,
          scheduledSample: this.playStartSample + event.sampleTime,
          actualSample: quantumStart,
        };

        if (event.type === "noteOn" || event.type === "noteOff") {
          msg.note = event.note;
          msg.velocity = event.velocity;
        } else if (event.type === "cc") {
          msg.controller = event.controller;
          msg.value = event.value;
        } else if (event.type === "pitchBend") {
          msg.value = event.value;
        } else if (event.type === "programChange") {
          msg.program = event.program;
        }

        this.port.postMessage(msg);
      }

      this.eventIndex++;
    }

    return true;
  }
}

registerProcessor("midi-player", MidiPlayerProcessor);
