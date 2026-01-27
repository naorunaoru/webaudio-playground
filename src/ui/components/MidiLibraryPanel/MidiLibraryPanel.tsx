import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredMidi } from "@audio/midiStore";
import { deleteMidi, listMidi, putMidiFromFile } from "@audio/midiStore";
import { parseMidiFile } from "@audio/midiParser";
import { getMidiManager } from "@audio/midiManager";
import { FloatingPanel } from "@ui/components/FloatingPanel/FloatingPanel";
import styles from "./MidiLibraryPanel.module.css";

export interface MidiLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ticks: number, ticksPerBeat: number, bpm: number = 120): string {
  const beats = ticks / ticksPerBeat;
  const seconds = (beats / bpm) * 60;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function MidiLibraryPanel({
  open,
  onClose,
  selectedId,
  onSelect,
}: MidiLibraryPanelProps) {
  const [library, setLibrary] = useState<ReadonlyArray<StoredMidi>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setError(null);
      setLibrary(await listMidi());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshLibrary();
    }
  }, [open, refreshLibrary]);

  const handleImport = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        setError(null);

        // Parse the MIDI file to extract metadata
        const buffer = await file.arrayBuffer();
        const parsed = await parseMidiFile(buffer);

        // Store in OPFS with metadata
        const meta = await putMidiFromFile(file, {
          durationTicks: parsed.durationTicks,
          ticksPerBeat: parsed.ticksPerBeat,
          trackCount: parsed.trackCount,
        });

        await refreshLibrary();
        onSelect(meta.id, meta.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshLibrary, onSelect]
  );

  const handleDelete = useCallback(
    async (midi: StoredMidi) => {
      if (!confirm(`Delete "${midi.name}"?`)) return;
      setBusy(true);
      try {
        setError(null);
        await deleteMidi(midi.id);
        getMidiManager().invalidate(midi.id);
        await refreshLibrary();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshLibrary]
  );

  return (
    <FloatingPanel
      title="MIDI Library"
      open={open}
      onClose={onClose}
      defaultPosition={{ x: 100, y: 100 }}
    >
      <div className={styles.container}>
        <div className={styles.importRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={styles.importButton}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Import MIDI
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {library.length === 0 ? (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span>No MIDI files yet</span>
            <span>Import .mid files to get started</span>
          </div>
        ) : (
          <div className={styles.midiList}>
            {library.map((midi) => (
              <div
                key={midi.id}
                className={styles.midiItem}
                data-selected={midi.id === selectedId}
                onClick={() => onSelect(midi.id, midi.name)}
              >
                <div className={styles.midiInfo}>
                  <span className={styles.midiName}>{midi.name}</span>
                  <span className={styles.midiMeta}>
                    {midi.trackCount} tracks &middot; {formatDuration(midi.durationTicks, midi.ticksPerBeat)} &middot; {formatSize(midi.size)}
                  </span>
                </div>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.deleteButton}`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(midi);
                  }}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
