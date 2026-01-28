import { useEffect, useRef, useState } from "react";
import type { EnvelopeEditorProps, HandleIndex, SegmentIndex, CurveDragState } from "./types";
import {
  HANDLE_BLEED_PX,
  getCanvasMetrics,
  createCoordinateSystem,
  getHandlePositions,
  findClosestHandleByX,
} from "./geometry";
import type { MarkerPosition } from "./geometry";
import { applyHandleDrag, applyShapeDrag, addPhaseAfter, removePhase, togglePhaseHold, toggleLoopStart, moveLoopStart, moveHold } from "./handles";
import type { MarkerDragVisual } from "./drawing";
import { useShapeCanvas } from "./useShapeCanvas";
import { usePlayheadCanvas } from "./usePlayheadCanvas";
import { EnvelopeInteractionLayer } from "./EnvelopeInteractionLayer";
import type { CanvasMetrics } from "./types";

export type { EnvelopeEditorProps } from "./types";

const canvasStyle = (height: number): React.CSSProperties => ({
  position: "absolute",
  left: -HANDLE_BLEED_PX,
  top: -HANDLE_BLEED_PX,
  width: `calc(100% + ${HANDLE_BLEED_PX * 2}px)`,
  height: height + HANDLE_BLEED_PX * 2,
});

export function EnvelopeEditor({
  phases,
  onChangePhases,
  getRuntimeState,
  height = 86,
  onDragStart,
  onDragEnd,
  selectedPhase: controlledSelectedPhase,
  onSelectPhase,
}: EnvelopeEditorProps) {
  const [activeHandle, setActiveHandle] = useState<HandleIndex | null>(null);
  const [internalSelectedHandle, setInternalSelectedHandle] = useState<HandleIndex | null>(null);
  const [activeSegment, setActiveSegment] = useState<SegmentIndex | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentIndex | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [markerDragState, setMarkerDragState] = useState<MarkerDragVisual | null>(null);
  const [metrics, setMetrics] = useState<CanvasMetrics | null>(null);

  const activePointerIdRef = useRef<number | null>(null);
  const curveDragRef = useRef<CurveDragState | null>(null);
  const markerDragRef = useRef<MarkerDragVisual | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const metricsRef = useRef<CanvasMetrics | null>(null);

  const phasesRef = useRef(phases);
  if (phasesRef.current !== phases && activePointerIdRef.current == null) {
    markerDragRef.current = null;
  }
  phasesRef.current = phases;

  // Support both controlled and uncontrolled selection
  const isControlled = controlledSelectedPhase !== undefined;
  const selectedHandle = isControlled ? controlledSelectedPhase : internalSelectedHandle;
  const setSelectedHandle = (index: HandleIndex | null) => {
    if (isControlled) {
      onSelectPhase?.(index);
    } else {
      setInternalSelectedHandle(index);
    }
  };

  // --- Canvas hooks (shape + playhead only) ---
  const { canvasRef: shapeCanvasRef, redraw: redrawShape } = useShapeCanvas(phases, metricsRef);
  const { canvasRef: playheadCanvasRef } = usePlayheadCanvas(phasesRef, metricsRef, getRuntimeState);

  // Metrics management
  const updateMetrics = () => {
    const canvas = shapeCanvasRef.current;
    if (!canvas) return;
    const m = getCanvasMetrics(canvas);
    metricsRef.current = m;
    setMetrics(m);
  };

  useEffect(() => {
    const canvas = shapeCanvasRef.current;
    if (!canvas) return;

    updateMetrics();

    const ro = new ResizeObserver(() => {
      updateMetrics();
      redrawShape();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // --- Pointer event handlers ---

  const handlePointerEnter = () => {
    setRevealed(true);
  };

  const handlePointerLeave = () => {
    setRevealed(false);
    setHoveredSegment(null);
  };

  const handleHandlePointerDown = (index: HandleIndex, e: React.PointerEvent) => {
    if (activePointerIdRef.current != null) return;
    activePointerIdRef.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);

    setActiveHandle(index);
    setSelectedHandle(index);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    setMarkerDragState(null);
    onDragStart?.();
  };

  const handleSegmentPointerDown = (index: SegmentIndex, e: React.PointerEvent) => {
    if (activePointerIdRef.current != null) return;
    activePointerIdRef.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);

    const m = metricsRef.current;
    if (!m) return;

    const py = e.nativeEvent.offsetY * m.dpr;

    setActiveHandle(null);
    setSelectedHandle(index);
    setActiveSegment(index);
    const startShape = phases[index]?.shape ?? 0;
    curveDragRef.current = { segmentIndex: index, startY: py, startShape };
    markerDragRef.current = null;
    setMarkerDragState(null);
    onDragStart?.();
  };

  const handleMarkerPointerDown = (marker: MarkerPosition, e: React.PointerEvent) => {
    if (activePointerIdRef.current != null) return;
    activePointerIdRef.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);

    const drag: MarkerDragVisual = {
      markerType: marker.type,
      originalPhaseIndex: marker.phaseIndex,
      currentX: marker.x,
    };
    markerDragRef.current = drag;
    setMarkerDragState(drag);
    setActiveHandle(null);
    setSelectedHandle(marker.phaseIndex);
    setActiveSegment(null);
    curveDragRef.current = null;
    onDragStart?.();
  };

  const handleBackgroundPointerDown = (_e: React.PointerEvent) => {
    // Clicked empty area — deselect
    setActiveHandle(null);
    setSelectedHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    setMarkerDragState(null);
  };

  const handleSegmentHover = (index: SegmentIndex | null) => {
    if (activePointerIdRef.current != null) return; // don't change hover during drag
    setHoveredSegment(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointerIdRef.current == null) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const m = metricsRef.current;
    if (!m) return;
    const { dpr } = m;

    const px = e.nativeEvent.offsetX * dpr;
    const py = e.nativeEvent.offsetY * dpr;

    // Marker drag
    if (markerDragRef.current) {
      const coords = createCoordinateSystem(m.width, m.height, dpr, phases);
      const handles = getHandlePositions(phases, coords);
      const closestHandle = findClosestHandleByX(px, handles, true);

      if (closestHandle !== null && closestHandle !== markerDragRef.current.originalPhaseIndex) {
        const markerType = markerDragRef.current.markerType;
        if (markerType === "loopStart") {
          onChangePhases(moveLoopStart(phases, closestHandle));
        } else {
          onChangePhases(moveHold(phases, closestHandle));
        }
        markerDragRef.current = {
          ...markerDragRef.current,
          originalPhaseIndex: closestHandle,
          currentX: px,
        };
      } else {
        markerDragRef.current = {
          ...markerDragRef.current,
          currentX: px,
        };
      }
      setMarkerDragState({ ...markerDragRef.current });
      return;
    }

    // Handle drag
    if (activeHandle !== null) {
      const coords = createCoordinateSystem(m.width, m.height, dpr, phases);
      const nextMs = coords.msOfX(px);
      const nextLevel = coords.levelOfY(py);
      onChangePhases(applyHandleDrag(phases, activeHandle, nextMs, nextLevel));
      return;
    }

    // Curve shape drag
    const drag = curveDragRef.current;
    if (drag && activeSegment !== null) {
      const deltaY = py - drag.startY;
      onChangePhases(applyShapeDrag(phases, activeSegment, drag.startShape, deltaY, dpr));
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const wasDragging = activeHandle != null || activeSegment != null || markerDragRef.current != null;

    const markerDrag = markerDragRef.current;
    if (markerDrag) {
      const m = metricsRef.current;
      if (!m) return;
      const { dpr } = m;
      const px = e.nativeEvent.offsetX * dpr;

      const coords = createCoordinateSystem(m.width, m.height, dpr, phases);
      const handles = getHandlePositions(phases, coords);
      const snapTarget = findClosestHandleByX(px, handles, true);
      const snapX = snapTarget !== null ? handles[snapTarget]!.x : px;

      const startX = px;
      const duration = 120;
      const startTime = performance.now();
      const markerType = markerDrag.markerType;
      const currentPhaseIndex = markerDrag.originalPhaseIndex;

      if (snapAnimRef.current != null) cancelAnimationFrame(snapAnimRef.current);

      const animateSnap = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const currentX = startX + (snapX - startX) * eased;

        markerDragRef.current = { markerType, originalPhaseIndex: currentPhaseIndex, currentX };
        setMarkerDragState({ ...markerDragRef.current });

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(animateSnap);
        } else {
          snapAnimRef.current = null;
          markerDragRef.current = null;
          setMarkerDragState(null);
          if (snapTarget !== null) setSelectedHandle(snapTarget);
          if (wasDragging) onDragEnd?.();
        }
      };

      activePointerIdRef.current = null;
      setActiveHandle(null);
      setActiveSegment(null);
      curveDragRef.current = null;
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ok */ }
      snapAnimRef.current = requestAnimationFrame(animateSnap);
      return;
    }

    activePointerIdRef.current = null;
    setActiveHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    setMarkerDragState(null);
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ok */ }
    if (wasDragging) onDragEnd?.();
  };

  const handleAddPhase = () => {
    const afterIndex = selectedHandle ?? phases.length - 1;
    const newPhases = addPhaseAfter(phases, afterIndex);
    onChangePhases(newPhases);
    setSelectedHandle(afterIndex + 1);
  };

  const handleRemovePhase = () => {
    if (selectedHandle === null || phases.length <= 1) return;
    const newPhases = removePhase(phases, selectedHandle);
    onChangePhases(newPhases);
    setSelectedHandle(Math.min(selectedHandle, newPhases.length - 1));
  };

  const handleToggleHold = () => {
    if (selectedHandle === null) return;
    onChangePhases(togglePhaseHold(phases, selectedHandle));
  };

  const handleToggleLoopStart = () => {
    if (selectedHandle === null) return;
    onChangePhases(toggleLoopStart(phases, selectedHandle));
  };

  const selectedPhaseData = selectedHandle !== null ? phases[selectedHandle] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.18)",
          overflow: "visible",
        }}
      >
        {/* Layer 1: Shape (bottom) */}
        <canvas
          ref={shapeCanvasRef}
          style={{ ...canvasStyle(height), pointerEvents: "none" }}
        />
        {/* Layer 2: Playheads */}
        <canvas
          ref={playheadCanvasRef}
          style={{ ...canvasStyle(height), pointerEvents: "none" }}
        />
        {/* Layer 3: SVG interactions (top) */}
        <EnvelopeInteractionLayer
          phases={phases}
          metrics={metrics}
          activeHandle={activeHandle}
          selectedHandle={selectedHandle}
          hoveredSegment={hoveredSegment}
          markerDrag={markerDragState}
          revealed={revealed}
          height={height}
          onHandlePointerDown={handleHandlePointerDown}
          onSegmentPointerDown={handleSegmentPointerDown}
          onMarkerPointerDown={handleMarkerPointerDown}
          onSegmentHover={handleSegmentHover}
          onBackgroundPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        />
      </div>

      {/* Phase controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "rgba(255,255,255,0.7)",
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={handleAddPhase}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 3,
              color: "rgba(255,255,255,0.8)",
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            +
          </button>
          <button
            onClick={handleRemovePhase}
            disabled={phases.length <= 1 || selectedHandle === null}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 3,
              color: phases.length <= 1 || selectedHandle === null
                ? "rgba(255,255,255,0.3)"
                : "rgba(255,255,255,0.8)",
              padding: "2px 8px",
              cursor: phases.length <= 1 || selectedHandle === null ? "not-allowed" : "pointer",
              fontSize: 11,
            }}
          >
            −
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {selectedHandle !== null && (
            <span>
              Phase {selectedHandle + 1} of {phases.length}
            </span>
          )}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: selectedHandle !== null && selectedHandle !== phases.length - 1 ? "pointer" : "not-allowed",
              opacity: selectedHandle !== null && selectedHandle !== phases.length - 1 ? 1 : 0.5,
            }}
            title={selectedHandle === phases.length - 1 ? "Cannot set loop start on last phase" : undefined}
          >
            <input
              type="checkbox"
              checked={selectedPhaseData?.loopStart ?? false}
              onChange={handleToggleLoopStart}
              disabled={selectedHandle === null || selectedHandle === phases.length - 1}
              style={{ margin: 0 }}
            />
            Loop Start
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: selectedHandle !== null && selectedHandle !== phases.length - 1 ? "pointer" : "not-allowed",
              opacity: selectedHandle !== null && selectedHandle !== phases.length - 1 ? 1 : 0.5,
            }}
            title={selectedHandle === phases.length - 1 ? "Cannot hold on last phase" : undefined}
          >
            <input
              type="checkbox"
              checked={selectedPhaseData?.hold ?? false}
              onChange={handleToggleHold}
              disabled={selectedHandle === null || selectedHandle === phases.length - 1}
              style={{ margin: 0 }}
            />
            Hold
          </label>
        </div>
      </div>
    </div>
  );
}
