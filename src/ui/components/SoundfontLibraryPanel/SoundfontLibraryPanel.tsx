import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredSoundfont } from "@audio/soundfontStore";
import {
  deleteSoundfont,
  listSoundfonts,
  putSoundfontFromFile,
} from "@audio/soundfontStore";
import { FloatingPanel } from "@ui/components/FloatingPanel/FloatingPanel";
import styles from "./SoundfontLibraryPanel.module.css";

export interface SoundfontLibraryPanelProps {
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

export function SoundfontLibraryPanel({
  open,
  onClose,
  selectedId,
  onSelect,
}: SoundfontLibraryPanelProps) {
  const [library, setLibrary] = useState<ReadonlyArray<StoredSoundfont>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setError(null);
      setLibrary(await listSoundfonts());
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
        const meta = await putSoundfontFromFile(file);
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
    async (soundfont: StoredSoundfont) => {
      if (!confirm(`Delete "${soundfont.name}"?`)) return;
      setBusy(true);
      try {
        setError(null);
        await deleteSoundfont(soundfont.id);
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
      title="SoundFont Library"
      open={open}
      onClose={onClose}
      defaultPosition={{ x: 100, y: 100 }}
    >
      <div className={styles.container}>
        <div className={styles.importRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sf2,.sf3"
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Import SoundFont
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
            <span>No SoundFonts yet</span>
            <span>Import .sf2 files to get started</span>
          </div>
        ) : (
          <div className={styles.soundfontList}>
            {library.map((soundfont) => (
              <div
                key={soundfont.id}
                className={styles.soundfontItem}
                data-selected={soundfont.id === selectedId}
                onClick={() => onSelect(soundfont.id, soundfont.name)}
              >
                <svg
                  className={styles.soundfontIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <span className={styles.soundfontName}>{soundfont.name}</span>
                <span className={styles.soundfontSize}>
                  {formatSize(soundfont.size)}
                </span>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.deleteButton}`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(soundfont);
                  }}
                  title="Delete"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
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
