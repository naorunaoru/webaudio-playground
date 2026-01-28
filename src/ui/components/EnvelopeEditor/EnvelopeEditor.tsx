import { useEffect, useRef, useState } from "react";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { EnvelopeEditorProps, HandleIndex, SegmentIndex, CurveDragState } from "./types";
import {
  HANDLE_BLEED_PX,
  getCanvasMetrics,
  createCoordinateSystem,
  getHandlePositions,
  getEnvelopeSegmentPoints,
  findClosestHandle,
  findClosestSegment,
  getMarkerPositions,
  findHitMarker,
  findClosestHandleByX,
} from "./geometry";
import { applyHandleDrag, applyShapeDrag, addPhaseAfter, removePhase, togglePhaseHold, toggleLoopStart, moveLoopStart, moveHold } from "./handles";
import type { MarkerDragVisual } from "./drawing";
import { useShapeCanvas } from "./useShapeCanvas";
import { useUICanvas, type UICanvasState } from "./useUICanvas";
import { usePlayheadCanvas } from "./usePlayheadCanvas";

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
  const activePointerIdRef = useRef<number | null>(null);
  const curveDragRef = useRef<CurveDragState | null>(null);
  const markerDragRef = useRef<MarkerDragVisual | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const isHoveredRef = useRef(false);
  const hoveredSegmentRef = useRef<SegmentIndex | null>(null);
  const metricsRef = useRef<ReturnType<typeof getCanvasMetrics> | null>(null);

  // Cached hit-test geometry — recomputed only when phases or canvas size change
  const hitCacheRef = useRef<{
    phases: EnvelopePhase[];
    width: number;
    height: number;
    dpr: number;
    coords: ReturnType<typeof createCoordinateSystem>;
    handles: ReturnType<typeof getHandlePositions>;
    markers: ReturnType<typeof getMarkerPositions>;
    segments: ReturnType<typeof getEnvelopeSegmentPoints>;
  } | null>(null);

  const getHitGeometry = () => {
    const metrics = metricsRef.current;
    if (!metrics) return null;

    const { dpr, width, height } = metrics;
    const cache = hitCacheRef.current;
    if (cache && cache.phases === phases && cache.width === width && cache.height === height && cache.dpr === dpr) {
      return cache;
    }

    const coords = createCoordinateSystem(width, height, dpr, phases);
    const handles = getHandlePositions(phases, coords);
    const markers = getMarkerPositions(phases, coords);
    const segments = getEnvelopeSegmentPoints(phases, coords, 40);

    const entry = { phases, width, height, dpr, coords, handles, markers, segments };
    hitCacheRef.current = entry;
    return entry;
  };

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

  const phasesRef = useRef(phases);
  if (phasesRef.current !== phases && activePointerIdRef.current == null) {
    markerDragRef.current = null;
  }
  phasesRef.current = phases;

  // UI canvas state ref — read by the UI canvas hook on each draw
  const uiStateRef = useRef<UICanvasState>({
    phases,
    activeHandle,
    selectedHandle,
    markerDrag: null,
    handleReveal: 0,
    hoveredSegment: null,
  });
  uiStateRef.current = {
    phases,
    activeHandle,
    selectedHandle,
    markerDrag: markerDragRef.current,
    handleReveal: 0, // managed by the hook's animation
    hoveredSegment: hoveredSegmentRef.current,
  };

  // --- Canvas hooks ---
  const { canvasRef: shapeCanvasRef, redraw: redrawShape } = useShapeCanvas(phases, metricsRef);
  const { canvasRef: uiCanvasRef, requestDraw } = useUICanvas(metricsRef, uiStateRef, isHoveredRef, activePointerIdRef);
  const { canvasRef: playheadCanvasRef } = usePlayheadCanvas(phasesRef, metricsRef, getRuntimeState);

  // Metrics management — shared across all canvases
  const updateMetrics = () => {
    // Use any canvas to measure (they're all the same size)
    const canvas = shapeCanvasRef.current;
    if (!canvas) return;
    metricsRef.current = getCanvasMetrics(canvas);
  };

  useEffect(() => {
    const canvas = shapeCanvasRef.current;
    if (!canvas) return;

    updateMetrics();

    const ro = new ResizeObserver(() => {
      updateMetrics();
      redrawShape();
      requestDraw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Re-render triggers UI redraw (state/prop changes)
  requestDraw();

  // --- Pointer event handlers ---
  const handlePointerEnter = () => { isHoveredRef.current = true; requestDraw(); };
  const handlePointerLeave = () => { isHoveredRef.current = false; hoveredSegmentRef.current = null; uiStateRef.current = { ...uiStateRef.current, hoveredSegment: null }; requestDraw(); };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = uiCanvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current != null) return;

    activePointerIdRef.current = e.pointerId;
    canvas.setPointerCapture(e.pointerId);

    const geo = getHitGeometry();
    if (!geo) return;
    const { rect, dpr } = metricsRef.current!;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const { handles, markers, segments } = geo;
    const hitRadius = 8 * dpr;

    const hitMarker = findHitMarker(px, py, markers, hitRadius);
    if (hitMarker !== null) {
      markerDragRef.current = {
        markerType: hitMarker.type,
        originalPhaseIndex: hitMarker.phaseIndex,
        currentX: hitMarker.x,
      };
      uiStateRef.current = { ...uiStateRef.current, markerDrag: markerDragRef.current };
      setActiveHandle(null);
      setSelectedHandle(hitMarker.phaseIndex);
      setActiveSegment(null);
      curveDragRef.current = null;
      onDragStart?.();
      return;
    }

    const hitHandle = findClosestHandle(px, py, handles, hitRadius);
    if (hitHandle !== null) {
      setActiveHandle(hitHandle);
      setSelectedHandle(hitHandle);
      setActiveSegment(null);
      curveDragRef.current = null;
      markerDragRef.current = null;
      uiStateRef.current = { ...uiStateRef.current, markerDrag: null };
      onDragStart?.();
      return;
    }

    const hitSegment = findClosestSegment(px, py, segments, 7 * dpr);
    if (hitSegment !== null) {
      setActiveHandle(null);
      setSelectedHandle(hitSegment);
      setActiveSegment(hitSegment);
      const startShape = phases[hitSegment]?.shape ?? 0;
      curveDragRef.current = { segmentIndex: hitSegment, startY: py, startShape };
      markerDragRef.current = null;
      uiStateRef.current = { ...uiStateRef.current, markerDrag: null };
      onDragStart?.();
      return;
    }

    // Clicked empty area
    setActiveHandle(null);
    setSelectedHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    uiStateRef.current = { ...uiStateRef.current, markerDrag: null };
    activePointerIdRef.current = null;
    canvas.releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = uiCanvasRef.current;
    if (!canvas) return;

    // Update cursor on hover (when not dragging)
    if (activePointerIdRef.current == null) {
      const geo = getHitGeometry();
      if (!geo) return;
      const { rect, dpr } = metricsRef.current!;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const { handles, markers, segments } = geo;
      const hitRadius = 8 * dpr;

      const prevHovered = hoveredSegmentRef.current;

      const hitMarker = findHitMarker(px, py, markers, hitRadius);
      if (hitMarker !== null) {
        hoveredSegmentRef.current = null;
        uiStateRef.current = { ...uiStateRef.current, hoveredSegment: null };
        canvas.style.cursor = "grab";
        if (prevHovered !== null) requestDraw();
        return;
      }

      const hitHandle = findClosestHandle(px, py, handles, hitRadius);
      if (hitHandle !== null) {
        hoveredSegmentRef.current = null;
        uiStateRef.current = { ...uiStateRef.current, hoveredSegment: null };
        canvas.style.cursor = "grab";
        if (prevHovered !== null) requestDraw();
        return;
      }

      const hitSegment = findClosestSegment(px, py, segments, 7 * dpr);
      if (hitSegment !== null) {
        hoveredSegmentRef.current = hitSegment;
        uiStateRef.current = { ...uiStateRef.current, hoveredSegment: hitSegment };
        canvas.style.cursor = "ns-resize";
        if (prevHovered !== hitSegment) requestDraw();
        return;
      }

      hoveredSegmentRef.current = null;
      uiStateRef.current = { ...uiStateRef.current, hoveredSegment: null };
      canvas.style.cursor = "";
      if (prevHovered !== null) requestDraw();
      return;
    }

    if (activePointerIdRef.current !== e.pointerId) return;

    const geo = getHitGeometry();
    if (!geo) return;
    const { rect, dpr } = metricsRef.current!;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const { coords, handles } = geo;
    const nextMs = coords.msOfX(px);
    const nextLevel = coords.levelOfY(py);

    if (markerDragRef.current) {
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
      uiStateRef.current = { ...uiStateRef.current, markerDrag: markerDragRef.current };
      requestDraw();
      return;
    }

    if (activeHandle !== null) {
      onChangePhases(applyHandleDrag(phases, activeHandle, nextMs, nextLevel));
      return;
    }

    const drag = curveDragRef.current;
    if (drag && activeSegment !== null) {
      const deltaY = py - drag.startY;
      onChangePhases(applyShapeDrag(phases, activeSegment, drag.startShape, deltaY, dpr));
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = uiCanvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const wasDragging = activeHandle != null || activeSegment != null || markerDragRef.current != null;

    const markerDrag = markerDragRef.current;
    if (markerDrag) {
      const geo = getHitGeometry();
      if (!geo) return;
      const { rect, dpr } = metricsRef.current!;
      const px = (e.clientX - rect.left) * dpr;

      const { handles } = geo;
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
        uiStateRef.current = { ...uiStateRef.current, markerDrag: markerDragRef.current };
        requestDraw();

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(animateSnap);
        } else {
          snapAnimRef.current = null;
          markerDragRef.current = null;
          uiStateRef.current = { ...uiStateRef.current, markerDrag: null };
          if (snapTarget !== null) setSelectedHandle(snapTarget);
          if (wasDragging) onDragEnd?.();
        }
      };

      activePointerIdRef.current = null;
      setActiveHandle(null);
      setActiveSegment(null);
      curveDragRef.current = null;
      canvas.releasePointerCapture(e.pointerId);
      snapAnimRef.current = requestAnimationFrame(animateSnap);
      return;
    }

    activePointerIdRef.current = null;
    setActiveHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    uiStateRef.current = { ...uiStateRef.current, markerDrag: null };
    canvas.releasePointerCapture(e.pointerId);
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
        {/* Layer 3: UI (top) — receives pointer events */}
        <canvas
          ref={uiCanvasRef}
          style={{ ...canvasStyle(height), touchAction: "none" }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
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
