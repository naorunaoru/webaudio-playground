import { useEffect, useRef } from "react";
import { getAudioEngine } from "../../audio/engine";
import type { GraphNode } from "../../graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "../../types/graphNodeDefinition";

type AudioOutNode = Extract<GraphNode, { type: "audioOut" }>;

function defaultState(): AudioOutNode["state"] {
  return {};
}

const AudioOutUi: React.FC<NodeUiProps<AudioOutNode>> = ({ node }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 1;
    let height = 1;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(canvas);
    updateSize();

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const midY = height * 0.5;
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      for (let i = 1; i < 4; i++) {
        const x = (width * i) / 4;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      const wf = getAudioEngine().getOutputWaveform(256);
      if (wf && wf.length > 1) {
        ctx.strokeStyle = "rgba(236,239,244,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < wf.length; i++) {
          const x = (i / (wf.length - 1)) * width;
          const y = midY - wf[i] * (height * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(236,239,244,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [node.id]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: 72,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.18)",
          }}
        />
      </div>
    </div>
  );
};

export const audioOutGraph: NodeDefinition<AudioOutNode> = {
  type: "audioOut",
  title: "Output",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "Audio", kind: "audio", direction: "in" },
  ],
  ui: AudioOutUi,
  normalizeState: () => ({}),
};
