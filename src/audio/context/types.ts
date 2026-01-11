/** Pulses per quarter note — standard MIDI resolution */
export const PPQ = 480;

/** Context values available to all nodes */
export type AudioGraphContextValues = Readonly<{
  /** A4 reference frequency in Hz (default: 440) */
  a4Hz: number;

  /** Time signature as [beats per bar, beat unit] */
  timeSignature: readonly [number, number];

  /** Tempo in BPM */
  tempo: number;

  /** Sample rate (derived from AudioContext, undefined until context is initialized) */
  sampleRate?: number;
}>;

/** Values persisted with the document */
export type PersistedContextValues = Pick<
  AudioGraphContextValues,
  "a4Hz" | "tempo" | "timeSignature"
>;

/** Default values for new documents */
export const DEFAULT_CONTEXT_VALUES: PersistedContextValues = {
  a4Hz: 440,
  tempo: 120,
  timeSignature: [4, 4],
};

/** Transient transport state (not persisted) */
export type TransportState = Readonly<{
  playing: boolean;
  /** Position in PPQ (pulses per quarter note, 480 PPQ) */
  positionPPQ: number;
  loopStartPPQ?: number;
  loopEndPPQ?: number;
}>;

/** Events emitted on the context event bus */
export type AudioGraphEvent =
  | { type: "tempoChange"; tempo: number }
  | { type: "transportStateChange"; transport: TransportState }
  | { type: "timeSignatureChange"; timeSignature: readonly [number, number] }
  | { type: "a4Change"; a4Hz: number }
  | { type: "audioToggle" }
  | { type: "reset" };
