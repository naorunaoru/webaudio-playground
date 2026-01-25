import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Button } from "@ui/components";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import type { ChannelConnectionStatus, ChannelRuntimeState } from "./types";

const channelTheme: ControlTheme = {
  primary: "#22c55e", // Green for connected/active
  secondary: "#4ade80",
  tertiary: "#16a34a",
};

type ChannelNode = Extract<GraphNode, { type: "channel" }>;

function defaultState(): ChannelNode["state"] {
  return {
    enabled: false,
    selectedDeviceId: null,
    midiChannel: null,
  };
}

const STATUS_COLORS: Record<ChannelConnectionStatus, [number, number, number]> = {
  connected: [34, 197, 94],    // green
  connecting: [234, 179, 8],   // yellow
  error: [239, 68, 68],        // red
  disconnected: [107, 114, 128], // gray
};

const ACTIVITY_DECAY_MS = 150;

function drawActivityIndicator(
  ctx: CanvasRenderingContext2D,
  status: ChannelConnectionStatus,
  lastActivityMs: number | null
) {
  const size = ctx.canvas.width;
  const dpr = window.devicePixelRatio || 1;
  const center = size / 2;
  const radius = (size / 2 - 2 * dpr) / dpr;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(dpr, dpr);

  const [r, g, b] = STATUS_COLORS[status];

  // Calculate activity brightness (0 = dim, 1 = bright)
  let activity = 0;
  if (status === "connected" && lastActivityMs !== null) {
    const elapsed = performance.now() - lastActivityMs;
    if (elapsed < ACTIVITY_DECAY_MS) {
      activity = 1 - elapsed / ACTIVITY_DECAY_MS;
    }
  }

  // Base brightness depends on status
  const baseBrightness = status === "connected" ? 0.6 : 0.4;
  const brightness = baseBrightness + activity * (1 - baseBrightness);

  // Draw glow when active
  if (activity > 0.1) {
    const glowRadius = radius * (1 + activity * 0.5);
    const gradient = ctx.createRadialGradient(
      center / dpr,
      center / dpr,
      radius * 0.5,
      center / dpr,
      center / dpr,
      glowRadius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${activity * 0.6})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center / dpr, center / dpr, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw main circle
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${brightness})`;
  ctx.beginPath();
  ctx.arc(center / dpr, center / dpr, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const ChannelUi: React.FC<NodeUiProps<ChannelNode>> = ({
  node,
  onPatchNode,
  audioState,
}) => {
  const getRuntimeState = useRuntimeStateGetter<ChannelRuntimeState>(node.id);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Only store UI-relevant state (not activity which updates too fast)
  const [uiState, setUiState] = useState<{
    status: ChannelConnectionStatus;
    errorMessage: string | null;
    devices: Array<{ id: string; name: string }>;
    connectedDeviceName: string | null;
  }>({
    status: "disconnected",
    errorMessage: null,
    devices: [],
    connectedDeviceName: null,
  });

  // Combined rAF loop: update UI state (throttled) and draw canvas
  useEffect(() => {
    if (audioState !== "running") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up canvas for high DPI
    const dpr = window.devicePixelRatio || 1;
    const size = 16;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    let lastUiUpdate = 0;
    const UI_UPDATE_INTERVAL = 100; // Update React state at 10fps max

    let raf = 0;
    const tick = () => {
      const state = getRuntimeState();
      const now = performance.now();

      if (state) {
        // Always draw canvas (cheap)
        drawActivityIndicator(ctx, state.status, state.lastActivityMs);

        // Throttle React state updates
        if (now - lastUiUpdate > UI_UPDATE_INTERVAL) {
          lastUiUpdate = now;
          setUiState((prev) => {
            // Only update if something changed
            if (
              prev.status !== state.status ||
              prev.errorMessage !== state.errorMessage ||
              prev.connectedDeviceName !== state.connectedDeviceName ||
              prev.devices.length !== state.devices.length
            ) {
              return {
                status: state.status,
                errorMessage: state.errorMessage,
                devices: state.devices,
                connectedDeviceName: state.connectedDeviceName,
              };
            }
            return prev;
          });
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  const { status, errorMessage, devices, connectedDeviceName } = uiState;

  const handleToggle = () => {
    onPatchNode(node.id, { enabled: !node.state.enabled });
  };

  const handleDeviceChange = (deviceId: string) => {
    onPatchNode(node.id, { selectedDeviceId: deviceId });
  };

  const statusText =
    status === "connected"
      ? connectedDeviceName ?? "Connected"
      : status === "connecting"
        ? "Connecting..."
        : status === "error"
          ? errorMessage ?? "Error"
          : "Disconnected";

  return (
    <ThemeProvider theme={channelTheme}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            background: "rgba(0,0,0,0.2)",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span
            style={{
              color: "#e5e5e5",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 120,
            }}
          >
            {statusText}
          </span>
        </div>

        {status === "connected" && devices.length > 1 && (
          <select
            value={node.state.selectedDeviceId ?? ""}
            onChange={(e) => handleDeviceChange(e.target.value)}
            style={{
              padding: "4px 6px",
              fontSize: 11,
              background: "rgba(0,0,0,0.3)",
              color: "#e5e5e5",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        )}

        <Button
          variant={node.state.enabled ? "default" : "primary"}
          onClick={handleToggle}
        >
          {node.state.enabled ? "Disconnect" : "Connect"}
        </Button>
      </div>
    </ThemeProvider>
  );
};

export const channelGraph: NodeDefinition<ChannelNode> = {
  type: "channel",
  title: "Channel",
  defaultState,
  ports: () => [
    { id: "midi_out", name: "MIDI", kind: "midi", direction: "out" },
  ],
  ui: ChannelUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<ChannelNode["state"]>;
    const d = defaultState();
    return {
      enabled: s.enabled ?? d.enabled,
      selectedDeviceId: s.selectedDeviceId ?? d.selectedDeviceId,
      midiChannel: s.midiChannel ?? d.midiChannel,
    };
  },
};
