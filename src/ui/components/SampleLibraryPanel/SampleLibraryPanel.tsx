import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredSample } from "../../../audio/sampleStore";
import {
  deleteSample,
  getSampleBlob,
  listSamples,
  putSampleFromFile,
} from "../../../audio/sampleStore";
import { FloatingPanel } from "../FloatingPanel/FloatingPanel";
import styles from "./SampleLibraryPanel.module.css";

export interface SampleLibraryPanelProps {
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

export function SampleLibraryPanel({
  open,
  onClose,
  selectedId,
  onSelect,
}: SampleLibraryPanelProps) {
  const [library, setLibrary] = useState<ReadonlyArray<StoredSample>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setError(null);
      setLibrary(await listSamples());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshLibrary();
    }
  }, [open, refreshLibrary]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleImport = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        setError(null);
        const meta = await putSampleFromFile(file);
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
    async (sample: StoredSample) => {
      if (!confirm(`Delete "${sample.name}"?`)) return;
      setBusy(true);
      try {
        setError(null);
        if (previewingId === sample.id) {
          audioRef.current?.pause();
          setPreviewingId(null);
        }
        await deleteSample(sample.id);
        await refreshLibrary();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshLibrary, previewingId]
  );

  const handlePreview = useCallback(async (sample: StoredSample) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (previewingId === sample.id) {
      setPreviewingId(null);
      return;
    }

    try {
      const blob = await getSampleBlob(sample.id);
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        setPreviewingId(null);
        URL.revokeObjectURL(url);
      };

      audio.onpause = () => {
        setPreviewingId(null);
        URL.revokeObjectURL(url);
      };

      audioRef.current = audio;
      setPreviewingId(sample.id);
      audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [previewingId]);

  return (
    <FloatingPanel
      title="Sample Library"
      open={open}
      onClose={onClose}
      defaultPosition={{ x: 100, y: 100 }}
    >
      <div className={styles.container}>
        <div className={styles.importRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
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
            Import Sample
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
            <span>No samples yet</span>
            <span>Import audio files to get started</span>
          </div>
        ) : (
          <div className={styles.sampleList}>
            {library.map((sample) => (
              <div
                key={sample.id}
                className={styles.sampleItem}
                data-selected={sample.id === selectedId}
                onClick={() => onSelect(sample.id, sample.name)}
              >
                <button
                  type="button"
                  className={styles.iconButton}
                  data-playing={previewingId === sample.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(sample);
                  }}
                  title={previewingId === sample.id ? "Stop" : "Preview"}
                >
                  {previewingId === sample.id ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <span className={styles.sampleName}>{sample.name}</span>
                <span className={styles.sampleSize}>{formatSize(sample.size)}</span>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.deleteButton}`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(sample);
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
