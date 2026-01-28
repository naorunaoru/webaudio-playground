import { useEffect, useRef } from "react";
import { getAudioEngine } from "@audio/engine";
import type { NodeId } from "@graph/types";

export type NodeMeterProps = {
  nodeId: NodeId;
  nodeType: string;
  audioState: AudioContextState | "off";
  /** Color to use for the meter (CSS color string) */
  color: string;
};

const METER_SIZE = 10;

export function NodeMeter({
  nodeId,
  nodeType,
  audioState,
  color,
}: NodeMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stampRef = useRef<OffscreenCanvas | null>(null);

  // Pre-render the circle to an offscreen canvas whenever color changes
  useEffect(() => {
    const stamp = new OffscreenCanvas(METER_SIZE, METER_SIZE);
    const ctx = stamp.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(METER_SIZE / 2, METER_SIZE / 2, METER_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    stampRef.current = stamp;
  }, [color]);

  // Animate by stamping the pre-rendered circle with globalAlpha
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || audioState !== "running") {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, METER_SIZE, METER_SIZE);
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isOutputNode = nodeType === "audioOut";

    const draw = () => {
      const engine = getAudioEngine();
      const level = engine.getLevel(nodeId);

      const normalized = Math.max(0, Math.min(1, level / 0.12));

      const opacity = isOutputNode
        ? 0.15 + normalized * 0.8
        : normalized * 0.95;

      const visible = isOutputNode || level > 0;

      ctx.clearRect(0, 0, METER_SIZE, METER_SIZE);

      if (visible && opacity > 0.01 && stampRef.current) {
        ctx.globalAlpha = opacity;
        ctx.drawImage(stampRef.current, 0, 0);
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [nodeId, nodeType, audioState, color]);

  return (
    <canvas
      ref={canvasRef}
      width={METER_SIZE}
      height={METER_SIZE}
      style={{
        width: METER_SIZE,
        height: METER_SIZE,
        borderRadius: "50%",
      }}
    />
  );
}
