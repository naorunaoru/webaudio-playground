import { useMemo } from "react";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { HandleIndex, SegmentIndex, CanvasMetrics } from "./types";
import type { MarkerDragVisual } from "./drawing";
import type { SegmentPoints, HandlePosition, MarkerPosition } from "./geometry";
import {
  createCoordinateSystem,
  getHandlePositions,
  getEnvelopeSegmentPoints,
  getMarkerPositions,
  cumulativeTimeBeforePhase,
  HANDLE_BLEED_PX,
} from "./geometry";
import type { CoordinateSystem } from "./geometry";
import { shapedT } from "@utils/envelope";

export type InteractionLayerProps = {
  phases: EnvelopePhase[];
  metrics: CanvasMetrics | null;
  activeHandle: HandleIndex | null;
  selectedHandle: HandleIndex | null;
  hoveredSegment: SegmentIndex | null;
  markerDrag: MarkerDragVisual | null;
  revealed: boolean;
  height: number;
  onHandlePointerDown: (index: HandleIndex, e: React.PointerEvent) => void;
  onSegmentPointerDown: (index: SegmentIndex, e: React.PointerEvent) => void;
  onMarkerPointerDown: (marker: MarkerPosition, e: React.PointerEvent) => void;
  onSegmentHover: (index: SegmentIndex | null) => void;
  onBackgroundPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

// Convert an array of {x,y} points to an SVG polyline points string
function toPointsStr(pts: Array<{ x: number; y: number }>): string {
  let s = "";
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += " ";
    s += `${pts[i]!.x},${pts[i]!.y}`;
  }
  return s;
}

export function EnvelopeInteractionLayer({
  phases,
  metrics,
  activeHandle,
  selectedHandle,
  hoveredSegment,
  markerDrag,
  revealed,
  height,
  onHandlePointerDown,
  onSegmentPointerDown,
  onMarkerPointerDown,
  onSegmentHover,
  onBackgroundPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
}: InteractionLayerProps) {
  if (!metrics || phases.length === 0) {
    return (
      <svg
        style={{
          ...layerStyle(height),
          touchAction: "none",
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      />
    );
  }

  const { width, height: canvasH, dpr } = metrics;

  const geo = useMemo(() => {
    const coords = createCoordinateSystem(width, canvasH, dpr, phases);
    const handles = getHandlePositions(phases, coords);
    const segments = getEnvelopeSegmentPoints(phases, coords, 40);
    const markers = getMarkerPositions(phases, coords);
    return { coords, handles, segments, markers };
  }, [phases, width, canvasH, dpr]);

  const { coords, handles, segments, markers } = geo;
  const { pad, h } = coords;
  const topY = pad;
  const bottomY = pad + h;

  // Reveal animation values
  const revealT = revealed ? 1 : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${canvasH}`}
      style={{
        ...layerStyle(height),
        touchAction: "none",
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* Background rect to capture clicks on empty area */}
      <rect
        x={0}
        y={0}
        width={width}
        height={canvasH}
        fill="none"
        pointerEvents="all"
        onPointerDown={onBackgroundPointerDown}
      />

      {/* Marker dashed lines */}
      <MarkerLines
        phases={phases}
        segments={segments}
        pad={pad}
        h={h}
        dpr={dpr}
        markerDrag={markerDrag}
      />

      {/* Segment hit areas (invisible wide strokes for hit testing) */}
      {segments.map((seg) => (
        <polyline
          key={`seg-hit-${seg.phaseIndex}`}
          points={toPointsStr(seg.points)}
          fill="none"
          stroke="transparent"
          strokeWidth={14 * dpr}
          style={{ cursor: "ns-resize" }}
          pointerEvents="stroke"
          onPointerDown={(e) => {
            e.stopPropagation();
            onSegmentPointerDown(seg.phaseIndex, e);
          }}
          onPointerEnter={() => onSegmentHover(seg.phaseIndex)}
          onPointerLeave={() => onSegmentHover(null)}
        />
      ))}

      {/* Hover indicator: midpoint circle on hovered segment */}
      {hoveredSegment !== null && hoveredSegment < segments.length && (
        <HoverIndicator
          phases={phases}
          phaseIndex={hoveredSegment}
          coords={coords}
          dpr={dpr}
        />
      )}

      {/* Marker handles: loopStart at top, hold at bottom */}
      {markers.map((marker) => {
        // Don't render the static marker if it's being dragged
        if (markerDrag?.markerType === marker.type) return null;
        return (
          <circle
            key={`marker-${marker.type}-${marker.phaseIndex}`}
            cx={marker.x}
            cy={marker.y}
            r={markerRadius(revealT, dpr)}
            fill={
              marker.type === "loopStart"
                ? "rgba(129,140,248,0.9)"
                : "rgba(236,72,153,0.9)"
            }
            opacity={0.35 + 0.65 * revealT}
            style={{
              cursor: "grab",
              transition: "r 150ms ease-out, opacity 150ms ease-out",
            }}
            pointerEvents="all"
            onPointerDown={(e) => {
              e.stopPropagation();
              onMarkerPointerDown(marker, e);
            }}
          />
        );
      })}

      {/* Dragged marker handle at current drag position */}
      {markerDrag && (
        <circle
          cx={markerDrag.currentX}
          cy={markerDrag.markerType === "loopStart" ? topY : bottomY}
          r={markerRadius(revealT, dpr)}
          fill={
            markerDrag.markerType === "loopStart"
              ? "rgba(129,140,248,0.9)"
              : "rgba(236,72,153,0.9)"
          }
          opacity={0.35 + 0.65 * revealT}
          pointerEvents="none"
        />
      )}

      {/* Phase endpoint handles */}
      {handles.map((handle, i) => {
        const isActive = activeHandle === i;
        const isSelected = selectedHandle === i;
        return (
          <HandleCircle
            key={`handle-${i}`}
            handle={handle}
            index={i}
            isActive={isActive}
            isSelected={isSelected}
            dpr={dpr}
            revealT={revealT}
            onPointerDown={onHandlePointerDown}
          />
        );
      })}
    </svg>
  );
}

// --- Sub-components ---

function MarkerLines({
  phases,
  segments,
  pad,
  h,
  dpr,
  markerDrag,
}: {
  phases: EnvelopePhase[];
  segments: SegmentPoints[];
  pad: number;
  h: number;
  dpr: number;
  markerDrag: MarkerDragVisual | null;
}) {
  const lines: React.ReactNode[] = [];
  const dash = `${3 * dpr} ${3 * dpr}`;

  for (let i = 0; i < segments.length && i < phases.length - 1; i++) {
    const phase = phases[i]!;
    const seg = segments[i]!;
    const lastPt = seg.points[seg.points.length - 1]!;
    const x = lastPt.x;

    if (phase.loopStart && markerDrag?.markerType !== "loopStart") {
      lines.push(
        <line
          key={`ml-ls-${i}`}
          x1={x}
          y1={pad}
          x2={x}
          y2={pad + h}
          stroke="rgba(129,140,248,0.5)"
          strokeWidth={1.5 * dpr}
          strokeDasharray={dash}
          pointerEvents="none"
        />,
      );
    }
    if (phase.hold && markerDrag?.markerType !== "hold") {
      lines.push(
        <line
          key={`ml-h-${i}`}
          x1={x}
          y1={pad}
          x2={x}
          y2={pad + h}
          stroke="rgba(236,72,153,0.5)"
          strokeWidth={1.5 * dpr}
          strokeDasharray={dash}
          pointerEvents="none"
        />,
      );
    }
  }

  // Dragged marker line
  if (markerDrag) {
    const color =
      markerDrag.markerType === "loopStart"
        ? "rgba(129,140,248,0.5)"
        : "rgba(236,72,153,0.5)";
    lines.push(
      <line
        key="ml-drag"
        x1={markerDrag.currentX}
        y1={pad}
        x2={markerDrag.currentX}
        y2={pad + h}
        stroke={color}
        strokeWidth={1.5 * dpr}
        strokeDasharray={dash}
        pointerEvents="none"
      />,
    );
  }

  return <>{lines}</>;
}

function HoverIndicator({
  phases,
  phaseIndex,
  coords,
  dpr,
}: {
  phases: EnvelopePhase[];
  phaseIndex: number;
  coords: CoordinateSystem;
  dpr: number;
}) {
  const phase = phases[phaseIndex]!;
  const prevLevel = phaseIndex > 0 ? phases[phaseIndex - 1]!.targetLevel : 0;
  const startMs = cumulativeTimeBeforePhase(phases, phaseIndex);
  const span = Math.max(0, phase.durationMs);

  // Anchor at the horizontal midpoint of the segment (t = 0.5 in time),
  // then find the corresponding level via the shaped curve
  const midMs = startMs + span * 0.5;
  const u = shapedT(0.5, phase.shape);
  const level = prevLevel + (phase.targetLevel - prevLevel) * u;

  const cx = coords.xOfMs(midMs);
  const cy = coords.yOfLevel(level);

  return (
    <circle
      cx={cx}
      cy={cy}
      r={2.5 * dpr}
      fill="none"
      stroke="rgba(236,239,244,0.55)"
      strokeWidth={1.25 * dpr}
      pointerEvents="none"
    />
  );
}

function HandleCircle({
  handle,
  index,
  isActive,
  isSelected,
  dpr,
  revealT,
  onPointerDown,
}: {
  handle: HandlePosition;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  dpr: number;
  revealT: number;
  onPointerDown: (index: HandleIndex, e: React.PointerEvent) => void;
}) {
  const minR = isSelected ? 3 : 2;
  const maxR = isActive || isSelected ? 4 : 3;
  const r = (minR + (maxR - minR) * revealT) * dpr;
  const alpha = 1;

  let fill: string;
  if (isSelected) {
    fill = "rgba(236,72,153,0.95)";
  } else if (isActive) {
    fill = "rgba(255,255,255,0.95)";
  } else {
    fill = "rgba(236,239,244,0.75)";
  }

  return (
    <>
      {/* Invisible larger hit area */}
      <circle
        cx={handle.x}
        cy={handle.y}
        r={8 * dpr}
        fill="transparent"
        style={{ cursor: "grab" }}
        pointerEvents="all"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(index, e);
        }}
      />
      {/* Visible handle */}
      <circle
        cx={handle.x}
        cy={handle.y}
        r={r}
        fill={fill}
        opacity={alpha}
        pointerEvents="none"
        style={{ transition: "r 150ms ease-out" }}
      />
    </>
  );
}

function markerRadius(revealT: number, dpr: number): number {
  const minR = 1.5;
  const maxR = 3;
  return (minR + (maxR - minR) * revealT) * dpr;
}

const layerStyle = (height: number): React.CSSProperties => ({
  position: "absolute",
  left: -HANDLE_BLEED_PX,
  top: -HANDLE_BLEED_PX,
  width: `calc(100% + ${HANDLE_BLEED_PX * 2}px)`,
  height: height + HANDLE_BLEED_PX * 2,
});
