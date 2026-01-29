import { useEffect, useRef, type RefObject } from "react";
import styles from "./PianoKeyboard.module.css";
import { channelHue } from "./helpers";

export interface MidiWaterfallProps {
  /** Ref to the keyboard inner container (used to measure width) */
  keyboardRef: RefObject<HTMLDivElement | null>;
  /** Getter that returns the active MIDI channel for a note, or null */
  getActiveChannel: (note: number) => number | null;
  /** Height in CSS pixels */
  height: number;
  /** First MIDI note number in the keyboard range */
  noteMin: number;
  /** Total number of semitones (notes) in the keyboard range */
  noteCount: number;
}

export function MidiWaterfall({
  keyboardRef,
  getActiveChannel,
  height,
  noteMin,
  noteCount,
}: MidiWaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getActiveChannelRef = useRef(getActiveChannel);
  getActiveChannelRef.current = getActiveChannel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const inner = keyboardRef.current;
    if (!canvas || !inner) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let lastTime = 0;
    const scrollSpeed = 60; // pixels per second
    const barWidth = 4; // uniform bar width in CSS pixels

    const syncCanvasSize = () => {
      const scrollW = inner.scrollWidth;
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(scrollW * dpr);
      const pxH = Math.round(height * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      canvas.style.width = `${scrollW}px`;
    };

    syncCanvasSize();

    const draw = (time: number) => {
      rafId = requestAnimationFrame(draw);
      if (!lastTime) {
        lastTime = time;
        return;
      }
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      const scrollPx = Math.max(1, Math.round(scrollSpeed * dt * dpr));

      // Scroll existing content up
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(
        canvas,
        0,
        scrollPx,
        w,
        h - scrollPx,
        0,
        0,
        w,
        h - scrollPx,
      );
      ctx.globalCompositeOperation = "source-over";

      // Clear the bottom row
      ctx.clearRect(0, h - scrollPx, w, scrollPx);

      // Paint active notes — divide canvas into equal bins per semitone
      const getChannel = getActiveChannelRef.current;
      const binW = w / noteCount;
      const bw = barWidth * dpr;

      for (let i = 0; i < noteCount; i++) {
        const channel = getChannel(noteMin + i);
        if (channel !== null) {
          const cx = (i + 0.5) * binW;
          const hue = channelHue(channel);
          ctx.fillStyle = `hsl(${hue}, 75%, 55%)`;
          ctx.fillRect(
            Math.round(cx - bw / 2),
            h - scrollPx,
            Math.round(bw),
            scrollPx,
          );
        }
      }
    };

    rafId = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(inner);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [keyboardRef, height, noteMin, noteCount]);

  return (
    <div className={styles.waterfall} style={{ height }}>
      <canvas ref={canvasRef} className={styles.waterfallCanvas} />
    </div>
  );
}
