import { useEffect, useRef, useState } from "react";
import type { GraphNode, MidiEvent } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type OscillatorNode = Extract<GraphNode, { type: "oscillator" }>;
type HandleKey = "a" | "d" | "s" | "r";
type Curve = OscillatorNode["state"]["env"]["attackCurve"];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampMs(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5000, v));
}

function defaultState(): OscillatorNode["state"] {
  return {
    waveform: "sawtooth",
    detuneCents: 0,
    env: {
      attackMs: 5,
      decayMs: 120,
      sustain: 0.6,
      releaseMs: 120,
      attackCurve: "exp",
      decayCurve: "exp",
      releaseCurve: "exp",
    },
    lastMidiNote: null,
    lastMidiAtMs: null,
  };
}

function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  env: OscillatorNode["state"]["env"],
  activeHandle: HandleKey | null,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, width, height);

  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const x = pad + (w * i) / 4;
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + h);
  }
  for (let i = 0; i <= 2; i++) {
    const y = pad + (h * i) / 2;
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + w, y);
  }
  ctx.stroke();

  const holdMs = 240;
  const totalMs = Math.max(1, env.attackMs + env.decayMs + holdMs + env.releaseMs);
  const xOfMs = (ms: number) => pad + (ms / totalMs) * w;
  const yOfLevel = (level: number) => pad + (1 - clamp01(level)) * h;

  const x0 = xOfMs(0);
  const y0 = yOfLevel(0);
  const xa = xOfMs(env.attackMs);
  const ya = yOfLevel(1);
  const xd = xOfMs(env.attackMs + env.decayMs);
  const yd = yOfLevel(env.sustain);
  const xs = xOfMs(env.attackMs + env.decayMs + holdMs);
  const ys = yd;
  const xr = xOfMs(env.attackMs + env.decayMs + holdMs + env.releaseMs);
  const yr = yOfLevel(0);

  ctx.strokeStyle = "rgba(236,239,244,0.9)";
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(xa, ya);
  ctx.lineTo(xd, yd);
  ctx.lineTo(xs, ys);
  ctx.lineTo(xr, yr);
  ctx.stroke();

  const handle = (x: number, y: number, key: HandleKey) => {
    const isActive = activeHandle === key;
    ctx.fillStyle = isActive ? "rgba(255,255,255,0.95)" : "rgba(236,239,244,0.75)";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, isActive ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  handle(xa, ya, "a");
  handle(xd, yd, "d");
  handle(xs, ys, "s");
  handle(xr, yr, "r");
}

function mapCcToEnvPatch(node: OscillatorNode, portId: string | null, event: MidiEvent) {
  if (event.type !== "cc") return null;
  const v01 = clamp01(event.value / 127);
  if (portId === "cc_attack") return { env: { ...node.state.env, attackMs: clampMs(v01 * 2000) } };
  if (portId === "cc_decay") return { env: { ...node.state.env, decayMs: clampMs(v01 * 2000) } };
  if (portId === "cc_sustain") return { env: { ...node.state.env, sustain: v01 } };
  if (portId === "cc_release") return { env: { ...node.state.env, releaseMs: clampMs(v01 * 2000) } };
  return null;
}

const OscillatorUi: React.FC<NodeUiProps<OscillatorNode>> = ({ node, onPatchNode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const env = node.state.env;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawEnvelope(ctx, width, height, env, activeHandle);
  }, [env, activeHandle]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Waveform</span>
        <select
          value={node.state.waveform}
          onChange={(e) => onPatchNode(node.id, { waveform: e.target.value as OscillatorType })}
        >
          <option value="sine">sine</option>
          <option value="triangle">triangle</option>
          <option value="square">square</option>
          <option value="sawtooth">sawtooth</option>
        </select>
      </label>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>ADSR</span>
          <span style={{ fontSize: 11, opacity: 0.55 }}>drag points</span>
        </div>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: 86,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.18)",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            if (activePointerIdRef.current != null) return;
            activePointerIdRef.current = e.pointerId;
            canvas.setPointerCapture(e.pointerId);

            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const px = (e.clientX - rect.left) * dpr;
            const py = (e.clientY - rect.top) * dpr;

            const pad = 8 * dpr;
            const w = canvas.width - pad * 2;
            const h = canvas.height - pad * 2;
            const holdMs = 240;
            const totalMs = Math.max(1, env.attackMs + env.decayMs + holdMs + env.releaseMs);
            const xOfMs = (ms: number) => pad + (ms / totalMs) * w;
            const yOfLevel = (level: number) => pad + (1 - clamp01(level)) * h;

            const xa = xOfMs(env.attackMs);
            const ya = yOfLevel(1);
            const xd = xOfMs(env.attackMs + env.decayMs);
            const yd = yOfLevel(env.sustain);
            const xs = xOfMs(env.attackMs + env.decayMs + holdMs);
            const ys = yd;
            const xr = xOfMs(env.attackMs + env.decayMs + holdMs + env.releaseMs);
            const yr = yOfLevel(0);

            const dist2 = (x1: number, y1: number) => (x1 - px) ** 2 + (y1 - py) ** 2;
            const hitR = (8 * dpr) ** 2;
            const candidates: Array<{ key: HandleKey; d2: number }> = [
              { key: "a", d2: dist2(xa, ya) },
              { key: "d", d2: dist2(xd, yd) },
              { key: "s", d2: dist2(xs, ys) },
              { key: "r", d2: dist2(xr, yr) },
            ];
            const hits = candidates.filter((h) => h.d2 <= hitR);

            if (hits.length === 0) {
              setActiveHandle(null);
              activePointerIdRef.current = null;
              canvas.releasePointerCapture(e.pointerId);
              return;
            }

            hits.sort((a, b) => a.d2 - b.d2);
            setActiveHandle(hits[0]!.key);
          }}
          onPointerMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            if (activePointerIdRef.current !== e.pointerId) return;
            if (!activeHandle) return;

            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const px = (e.clientX - rect.left) * dpr;
            const py = (e.clientY - rect.top) * dpr;

            const pad = 8 * dpr;
            const w = canvas.width - pad * 2;
            const h = canvas.height - pad * 2;
            const holdMs = 240;
            const totalMs = Math.max(1, env.attackMs + env.decayMs + holdMs + env.releaseMs);
            const msOfX = (x: number) => ((x - pad) / w) * totalMs;
            const levelOfY = (y: number) => clamp01(1 - (y - pad) / h);

            const nextMs = clampMs(msOfX(px));
            const nextSustain = clamp01(levelOfY(py));

            if (activeHandle === "a") {
              const a = Math.min(nextMs, env.attackMs + env.decayMs);
              onPatchNode(node.id, { env: { ...env, attackMs: a } });
            } else if (activeHandle === "d") {
              const d = Math.max(0, nextMs - env.attackMs);
              onPatchNode(node.id, { env: { ...env, decayMs: d, sustain: nextSustain } });
            } else if (activeHandle === "s") {
              onPatchNode(node.id, { env: { ...env, sustain: nextSustain } });
            } else if (activeHandle === "r") {
              const releaseStart = env.attackMs + env.decayMs + holdMs;
              const r = Math.max(0, nextMs - releaseStart);
              onPatchNode(node.id, { env: { ...env, releaseMs: r } });
            }
          }}
          onPointerUp={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            if (activePointerIdRef.current !== e.pointerId) return;
            activePointerIdRef.current = null;
            setActiveHandle(null);
            canvas.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            if (activePointerIdRef.current !== e.pointerId) return;
            activePointerIdRef.current = null;
            setActiveHandle(null);
            canvas.releasePointerCapture(e.pointerId);
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>A (ms)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={env.attackMs}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, attackMs: clampMs(Number(e.target.value)) } })
              }
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>D (ms)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={env.decayMs}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, decayMs: clampMs(Number(e.target.value)) } })
              }
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>S</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={env.sustain}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, sustain: clamp01(Number(e.target.value)) } })
              }
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>R (ms)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={env.releaseMs}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, releaseMs: clampMs(Number(e.target.value)) } })
              }
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>Attack</span>
            <select
              value={env.attackCurve}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, attackCurve: e.target.value as Curve } })
              }
            >
              <option value="linear">linear</option>
              <option value="exp">exp</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>Decay</span>
            <select
              value={env.decayCurve}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, decayCurve: e.target.value as Curve } })
              }
            >
              <option value="linear">linear</option>
              <option value="exp">exp</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>Release</span>
            <select
              value={env.releaseCurve}
              onChange={(e) =>
                onPatchNode(node.id, { env: { ...env, releaseCurve: e.target.value as Curve } })
              }
            >
              <option value="linear">linear</option>
              <option value="exp">exp</option>
            </select>
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Last MIDI note: {node.state.lastMidiNote ?? "—"}
      </div>
    </div>
  );
};

export const oscillatorGraph: NodeDefinition<OscillatorNode> = {
  type: "oscillator",
  title: "Oscillator",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "cc_attack", name: "A", kind: "cc", direction: "in" },
    { id: "cc_decay", name: "D", kind: "cc", direction: "in" },
    { id: "cc_sustain", name: "S", kind: "cc", direction: "in" },
    { id: "cc_release", name: "R", kind: "cc", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: OscillatorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<OscillatorNode["state"]> & { env?: any };
    const d = defaultState();
    const env = s.env ?? {};
    return {
      waveform: (s.waveform ?? d.waveform) as OscillatorType,
      detuneCents: s.detuneCents ?? d.detuneCents,
      env: {
        attackMs: env.attackMs ?? d.env.attackMs,
        decayMs: env.decayMs ?? d.env.decayMs,
        sustain: env.sustain ?? d.env.sustain,
        releaseMs: env.releaseMs ?? d.env.releaseMs,
        attackCurve: (env.attackCurve ?? d.env.attackCurve) as Curve,
        decayCurve: (env.decayCurve ?? d.env.decayCurve) as Curve,
        releaseCurve: (env.releaseCurve ?? d.env.releaseCurve) as Curve,
      },
      lastMidiNote: s.lastMidiNote ?? d.lastMidiNote,
      lastMidiAtMs: s.lastMidiAtMs ?? d.lastMidiAtMs,
    };
  },
  onMidi: (node, event, portId) => {
    if (event.type === "noteOn") {
      if (portId && portId !== "midi_in") return null;
      return { lastMidiNote: event.note, lastMidiAtMs: event.atMs };
    }
    return mapCcToEnvPatch(node, portId, event);
  },
};
