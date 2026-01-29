import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeId } from "@graph/types";
import { useSelection, useMidi, useMidiActiveNotes } from "@contexts";
import { MidiWaterfall } from "./MidiWaterfall";
import { channelHue } from "./helpers";
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
  /** Minimum velocity at top of key (default: 20) */
  minVelocity?: number;
  /** Maximum velocity at bottom of key (default: 127) */
  maxVelocity?: number;
  /** MIDI channel 0-15 (default: 0) */
  channel?: number;
}

export function PianoKeyboard({
  baseOctave = 2,
  octaves = 5,
  minVelocity = 20,
  maxVelocity = 127,
  channel = 0,
}: PianoKeyboardProps) {
  const { selected } = useSelection();
  const { dispatchMidiToNode } = useMidi();

  // Track locally pressed keys (by pointer) — maps note to channel
  const [pressedKeys, setPressedKeys] = useState<Map<number, number>>(
    new Map(),
  );
  const activePointers = useRef<Map<number, number>>(new Map()); // pointerId -> note
  const draggingPointers = useRef<Set<number>>(new Set()); // pointers currently held down

  const targetNodeId: NodeId | null =
    selected.type === "nodes" && selected.nodeIds.size === 1
      ? [...selected.nodeIds][0]!
      : null;

  // Subscribe to MIDI events dispatched to the target node
  const externalActiveNotes = useMidiActiveNotes(targetNodeId);

  const handleNoteOn = useCallback(
    async (note: number, pointerId: number, velocity: number) => {
      if (!targetNodeId) return;

      activePointers.current.set(pointerId, note);
      setPressedKeys((prev) => new Map(prev).set(note, channel));

      await dispatchMidiToNode(targetNodeId, {
        type: "noteOn",
        note,
        velocity,
        channel,
      });
    },
    [targetNodeId, dispatchMidiToNode, channel],
  );

  const handleNoteOff = useCallback(
    async (pointerId: number) => {
      const note = activePointers.current.get(pointerId);
      if (note === undefined) return;

      activePointers.current.delete(pointerId);
      setPressedKeys((prev) => {
        const next = new Map(prev);
        next.delete(note);
        return next;
      });

      if (!targetNodeId) return;

      await dispatchMidiToNode(targetNodeId, {
        type: "noteOff",
        note,
        channel,
      });
    },
    [targetNodeId, dispatchMidiToNode, channel],
  );

  // Calculate velocity from pointer Y position within a key element
  const calculateVelocity = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeY = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height),
      );
      return Math.round(minVelocity + relativeY * (maxVelocity - minVelocity));
    },
    [minVelocity, maxVelocity],
  );

  const handlePointerDown = useCallback(
    (note: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      draggingPointers.current.add(e.pointerId);
      void handleNoteOn(note, e.pointerId, calculateVelocity(e));
    },
    [handleNoteOn, calculateVelocity],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      draggingPointers.current.delete(e.pointerId);
      void handleNoteOff(e.pointerId);
    },
    [handleNoteOff],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      draggingPointers.current.delete(e.pointerId);
      void handleNoteOff(e.pointerId);
    },
    [handleNoteOff],
  );

  const handlePointerEnter = useCallback(
    (note: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only trigger if this pointer is currently dragging
      if (!draggingPointers.current.has(e.pointerId)) return;
      void handleNoteOn(note, e.pointerId, calculateVelocity(e));
    },
    [handleNoteOn, calculateVelocity],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only trigger if this pointer is currently dragging
      if (!draggingPointers.current.has(e.pointerId)) return;
      void handleNoteOff(e.pointerId);
    },
    [handleNoteOff],
  );

  // Global pointer up listener to handle releases outside the keyboard
  useEffect(() => {
    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (draggingPointers.current.has(e.pointerId)) {
        draggingPointers.current.delete(e.pointerId);
        void handleNoteOff(e.pointerId);
      }
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, [handleNoteOff]);

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

  /** Returns the MIDI channel for an active note, or null if inactive. */
  const getActiveChannel = (note: number): number | null => {
    if (pressedKeys.has(note)) return pressedKeys.get(note)!;
    const channels = externalActiveNotes.get(note);
    if (channels && channels.size > 0) return channels.values().next().value!;
    return null;
  };

  const keyboardInnerRef = useRef<HTMLDivElement>(null);

  const disabled = !targetNodeId;

  return (
    <>
      <div className={styles.keyboard} data-disabled={disabled}>
        <MidiWaterfall
          keyboardRef={keyboardInnerRef}
          getActiveChannel={getActiveChannel}
          height={32}
          noteMin={(baseOctave + 1) * 12}
          noteCount={octaves * 12}
        />
        <div ref={keyboardInnerRef} className={styles.keyboardInner}>
          <div className={styles.whiteKeys}>
            {whiteKeys.map(({ note, label }) => {
              const ch = getActiveChannel(note);
              const active = ch !== null;
              return (
                <button
                  key={note}
                  type="button"
                  className={styles.whiteKey}
                  data-note={note}
                  data-active={active}
                  style={
                    active
                      ? ({
                          "--key-hue": channelHue(ch),
                        } as React.CSSProperties)
                      : undefined
                  }
                  disabled={disabled}
                  onPointerDown={handlePointerDown(note)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onPointerEnter={handlePointerEnter(note)}
                  onPointerLeave={handlePointerLeave}
                >
                  {label && <span className={styles.keyLabel}>{label}</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.blackKeys}>
            {blackKeys.map(({ note, position }) => {
              const ch = getActiveChannel(note);
              const active = ch !== null;
              return (
                <button
                  key={note}
                  type="button"
                  className={styles.blackKey}
                  data-note={note}
                  style={{
                    left: `calc(${position} * (var(--white-key-width) + var(--white-key-gap)) + var(--white-key-width) * 0.65)`,
                    ...(active
                      ? ({ "--key-hue": channelHue(ch) } as React.CSSProperties)
                      : undefined),
                  }}
                  data-active={active}
                  disabled={disabled}
                  onPointerDown={handlePointerDown(note)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onPointerEnter={handlePointerEnter(note)}
                  onPointerLeave={handlePointerLeave}
                />
              );
            })}
          </div>
        </div>
      </div>
      {disabled && <div className={styles.disabledOverlay}>Select a node</div>}
    </>
  );
}
