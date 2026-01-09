import { useCallback, useRef, useState } from "react";
import type { NodeId } from "../../../graph/types";
import { useSelection, useMidi } from "../../../contexts";
import styles from "./PianoKeyboard.module.css";

// MIDI note numbers for one octave (C = 0 relative to octave start)
const WHITE_KEY_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
const BLACK_KEY_SEMITONES = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
const BLACK_KEY_POSITIONS = [0, 1, 3, 4, 5]; // Which white key index each black key is after

export interface PianoKeyboardProps {
  /** Base octave (default: 3, meaning C3 = MIDI note 48) */
  baseOctave?: number;
  /** Number of octaves to show (default: 2) */
  octaves?: number;
  /** Fixed velocity (default: 100) */
  velocity?: number;
  /** MIDI channel (default: 1) */
  channel?: number;
  /** Active notes to highlight (from external sources) */
  activeNotes?: Set<number>;
}

export function PianoKeyboard({
  baseOctave = 3,
  octaves = 2,
  velocity = 100,
  channel = 1,
  activeNotes,
}: PianoKeyboardProps) {
  const { selected } = useSelection();
  const { emitMidi } = useMidi();

  // Track locally pressed keys (by pointer)
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());
  const activePointers = useRef<Map<number, number>>(new Map()); // pointerId -> note

  const targetNodeId: NodeId | null =
    selected.type === "node" ? selected.nodeId : null;

  const handleNoteOn = useCallback(
    async (note: number, pointerId: number) => {
      if (!targetNodeId) return;

      activePointers.current.set(pointerId, note);
      setPressedKeys((prev) => new Set(prev).add(note));

      await emitMidi(targetNodeId, {
        type: "noteOn",
        note,
        velocity,
        channel,
        atMs: performance.now(),
      });
    },
    [targetNodeId, emitMidi, velocity, channel]
  );

  const handleNoteOff = useCallback(
    async (pointerId: number) => {
      const note = activePointers.current.get(pointerId);
      if (note === undefined) return;

      activePointers.current.delete(pointerId);
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });

      if (!targetNodeId) return;

      await emitMidi(targetNodeId, {
        type: "noteOff",
        note,
        channel,
        atMs: performance.now(),
      });
    },
    [targetNodeId, emitMidi, channel]
  );

  const handlePointerDown = useCallback(
    (note: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      void handleNoteOn(note, e.pointerId);
    },
    [handleNoteOn]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      void handleNoteOff(e.pointerId);
    },
    [handleNoteOff]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      void handleNoteOff(e.pointerId);
    },
    [handleNoteOff]
  );

  // Build keys for all octaves
  const whiteKeys: { note: number; label: string }[] = [];
  const blackKeys: { note: number; position: number }[] = [];

  const noteNames = ["C", "D", "E", "F", "G", "A", "B"];

  for (let octave = 0; octave < octaves; octave++) {
    const octaveNumber = baseOctave + octave;
    const octaveStartNote = (octaveNumber + 1) * 12; // MIDI note number

    // White keys
    for (let i = 0; i < 7; i++) {
      const note = octaveStartNote + WHITE_KEY_SEMITONES[i];
      const label = i === 0 ? `${noteNames[i]}${octaveNumber}` : "";
      whiteKeys.push({ note, label });
    }

    // Black keys
    for (let i = 0; i < 5; i++) {
      const note = octaveStartNote + BLACK_KEY_SEMITONES[i];
      const position = octave * 7 + BLACK_KEY_POSITIONS[i];
      blackKeys.push({ note, position });
    }
  }

  const isKeyActive = (note: number) =>
    pressedKeys.has(note) || activeNotes?.has(note);

  const disabled = !targetNodeId;

  return (
    <div className={styles.keyboard} data-disabled={disabled}>
      <div className={styles.whiteKeys}>
        {whiteKeys.map(({ note, label }) => (
          <button
            key={note}
            type="button"
            className={styles.whiteKey}
            data-active={isKeyActive(note)}
            disabled={disabled}
            onPointerDown={handlePointerDown(note)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {label && <span className={styles.keyLabel}>{label}</span>}
          </button>
        ))}
      </div>
      <div className={styles.blackKeys}>
        {blackKeys.map(({ note, position }) => (
          <button
            key={note}
            type="button"
            className={styles.blackKey}
            style={{ left: `calc(${position} * (var(--white-key-width) + var(--white-key-gap)) + var(--white-key-width) * 0.65)` }}
            data-active={isKeyActive(note)}
            disabled={disabled}
            onPointerDown={handlePointerDown(note)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
        ))}
      </div>
      {disabled && (
        <div className={styles.disabledOverlay}>
          Select a node
        </div>
      )}
    </div>
  );
}
