import { useEffect, useRef, useState } from "react";
import type { EnvelopeEditorProps, HandleIndex, SegmentIndex, CurveDragState } from "./types";
import {
  HANDLE_BLEED_PX,
  getCanvasMetrics,
  createCoordinateSystem,
  getHandlePositions,
  getEnvelopeSegmentPoints,
  findClosestHandle,
  findClosestSegment,
  phaseIndexToMs,
  getMarkerPositions,
  findHitMarker,
  findClosestHandleByX,
} from "./geometry";
import { applyHandleDrag, applyShapeDrag, addPhaseAfter, removePhase, togglePhaseHold, toggleLoopStart, moveLoopStart, moveHold } from "./handles";
import { drawEnvelope, type Playhead, type MarkerDragVisual } from "./drawing";

export type { EnvelopeEditorProps } from "./types";

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleIndex | null>(null);
  const [internalSelectedHandle, setInternalSelectedHandle] = useState<HandleIndex | null>(null);
  const [activeSegment, setActiveSegment] = useState<SegmentIndex | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const curveDragRef = useRef<CurveDragState | null>(null);
  const markerDragRef = useRef<MarkerDragVisual | null>(null);
  const snapAnimRef = useRef<number | null>(null);
  const isHoveredRef = useRef(false);
  const handleRadiusAnimRef = useRef(0);
  const hoveredSegmentRef = useRef<SegmentIndex | null>(null);
  const metricsRef = useRef<ReturnType<typeof getCanvasMetrics> | null>(null);

  const updateMetrics = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const metrics = getCanvasMetrics(canvas);
    metricsRef.current = metrics;
    if (canvas.width !== metrics.width) canvas.width = metrics.width;
    if (canvas.height !== metrics.height) canvas.height = metrics.height;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    updateMetrics();

    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

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
  const activeHandleRef = useRef(activeHandle);
  const selectedHandleRef = useRef(selectedHandle);
  if (phasesRef.current !== phases && activePointerIdRef.current == null) {
    // Phases changed while not dragging — clear any lingering marker drag overlay
    markerDragRef.current = null;
  }
  phasesRef.current = phases;
  activeHandleRef.current = activeHandle;
  selectedHandleRef.current = selectedHandle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastTime = performance.now();
    const draw = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      // Animate handle radius: 0 = collapsed, 1 = fully visible
      const target = isHoveredRef.current || activePointerIdRef.current != null ? 1 : 0;
      const speed = target === 1 ? 8 : 4; // faster in, slower out
      const prev = handleRadiusAnimRef.current;
      handleRadiusAnimRef.current = prev + (target - prev) * Math.min(1, speed * dt / 1000);

      const currentPhases = phasesRef.current;
      const metrics = metricsRef.current;
      if (!metrics) return;
      const { dpr, width, height } = metrics;

      const runtimeState = getRuntimeState?.();
      const playheads: Playhead[] = [];

      if (runtimeState) {
        const voices = runtimeState.voices ?? [];
        for (const voice of voices) {
          if (voice.phaseIndex >= 0 || voice.currentLevel > 0) {
            const ms = phaseIndexToMs(currentPhases, voice.phaseIndex, voice.phaseProgress);
            playheads.push({
              ms,
              level: voice.currentLevel,
            });
          }
        }
      }

      drawEnvelope(
        ctx,
        width,
        height,
        dpr,
        currentPhases,
        activeHandleRef.current,
        selectedHandleRef.current,
        playheads,
        markerDragRef.current,
        handleRadiusAnimRef.current,
        hoveredSegmentRef.current
      );
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState]);

  const handlePointerEnter = () => { isHoveredRef.current = true; };
  const handlePointerLeave = () => { isHoveredRef.current = false; hoveredSegmentRef.current = null; };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current != null) return;

    activePointerIdRef.current = e.pointerId;
    canvas.setPointerCapture(e.pointerId);

    const metrics = metricsRef.current;
    if (!metrics) return;
    const { rect, dpr } = metrics;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, phases);
    const handles = getHandlePositions(phases, coords);
    const hitRadius = 8 * dpr;

    // Check for marker hit first (they sit on top of handles)
    const markers = getMarkerPositions(phases, coords);
    const hitMarker = findHitMarker(px, py, markers, hitRadius);

    if (hitMarker !== null) {
      markerDragRef.current = {
        markerType: hitMarker.type,
        originalPhaseIndex: hitMarker.phaseIndex,
        currentX: hitMarker.x,
      };
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
      onDragStart?.();
      return;
    }

    const segments = getEnvelopeSegmentPoints(phases, coords, 40);
    const hitSegment = findClosestSegment(px, py, segments, 7 * dpr);

    if (hitSegment !== null) {
      setActiveHandle(null);
      setSelectedHandle(hitSegment); // Select the phase when clicking its segment
      setActiveSegment(hitSegment);
      const startShape = phases[hitSegment]?.shape ?? 0;
      curveDragRef.current = { segmentIndex: hitSegment, startY: py, startShape };
      markerDragRef.current = null;
      onDragStart?.();
      return;
    }

    // Clicked empty area - deselect
    setActiveHandle(null);
    setSelectedHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    activePointerIdRef.current = null;
    canvas.releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Update cursor on hover (when not dragging)
    if (activePointerIdRef.current == null) {
      const metrics = metricsRef.current;
      if (!metrics) return;
      const { rect, dpr } = metrics;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top) * dpr;
      const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, phases);
      const hitRadius = 8 * dpr;

      const markers = getMarkerPositions(phases, coords);
      const hitMarker = findHitMarker(px, py, markers, hitRadius);
      if (hitMarker !== null) {
        hoveredSegmentRef.current = null;
        canvas.style.cursor = "grab";
        return;
      }

      const handles = getHandlePositions(phases, coords);
      const hitHandle = findClosestHandle(px, py, handles, hitRadius);
      if (hitHandle !== null) {
        hoveredSegmentRef.current = null;
        canvas.style.cursor = "grab";
        return;
      }

      const segments = getEnvelopeSegmentPoints(phases, coords, 40);
      const hitSegment = findClosestSegment(px, py, segments, 7 * dpr);
      if (hitSegment !== null) {
        hoveredSegmentRef.current = hitSegment;
        canvas.style.cursor = "ns-resize";
        return;
      }

      hoveredSegmentRef.current = null;
      canvas.style.cursor = "";
      return;
    }

    if (activePointerIdRef.current !== e.pointerId) return;

    const metrics = metricsRef.current;
    if (!metrics) return;
    const { rect, dpr } = metrics;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, phases);
    const nextMs = coords.msOfX(px);
    const nextLevel = coords.levelOfY(py);

    // Update marker drag visual position and live-update phases
    if (markerDragRef.current) {
      const handles = getHandlePositions(phases, coords);
      const closestHandle = findClosestHandleByX(px, handles, true);

      // Move marker to closest handle during drag for live visual feedback
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const wasDragging = activeHandle != null || activeSegment != null || markerDragRef.current != null;

    // Handle marker drag completion - animate snap to nearest handle
    const markerDrag = markerDragRef.current;
    if (markerDrag) {
      const metrics = metricsRef.current;
      if (!metrics) return;
      const { rect, dpr, width, height } = metrics;
      const px = (e.clientX - rect.left) * dpr;

      const coords = createCoordinateSystem(width, height, dpr, phases);
      const handles = getHandlePositions(phases, coords);
      const snapTarget = findClosestHandleByX(px, handles, true);
      const snapX = snapTarget !== null ? handles[snapTarget]!.x : px;

      // Animate from current x to snap target
      const startX = px;
      const duration = 120; // ms
      const startTime = performance.now();
      const markerType = markerDrag.markerType;
      const currentPhaseIndex = markerDrag.originalPhaseIndex;

      // Cancel any existing snap animation
      if (snapAnimRef.current != null) cancelAnimationFrame(snapAnimRef.current);

      const animateSnap = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const currentX = startX + (snapX - startX) * eased;

        markerDragRef.current = { markerType, originalPhaseIndex: currentPhaseIndex, currentX };

        if (t < 1) {
          snapAnimRef.current = requestAnimationFrame(animateSnap);
        } else {
          // Animation complete — phases are already updated during drag
          snapAnimRef.current = null;
          markerDragRef.current = null;
          if (snapTarget !== null) setSelectedHandle(snapTarget);
          if (wasDragging) onDragEnd?.();
        }
      };

      activePointerIdRef.current = null;
      setActiveHandle(null);
      setActiveSegment(null);
      curveDragRef.current = null;
      // Don't clear markerDragRef here — animateSnap overwrites it on its first frame,
      // and clearing it would cause a one-frame flash where no handle is drawn.
      canvas.releasePointerCapture(e.pointerId);
      snapAnimRef.current = requestAnimationFrame(animateSnap);
      return;
    }

    activePointerIdRef.current = null;
    setActiveHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    markerDragRef.current = null;
    canvas.releasePointerCapture(e.pointerId);
    if (wasDragging) onDragEnd?.();
  };

  const handleAddPhase = () => {
    const afterIndex = selectedHandle ?? phases.length - 1;
    const newPhases = addPhaseAfter(phases, afterIndex);
    onChangePhases(newPhases);
    // Select the newly added phase
    setSelectedHandle(afterIndex + 1);
  };

  const handleRemovePhase = () => {
    if (selectedHandle === null || phases.length <= 1) return;
    const newPhases = removePhase(phases, selectedHandle);
    onChangePhases(newPhases);
    // Adjust selection
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
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            left: -HANDLE_BLEED_PX,
            top: -HANDLE_BLEED_PX,
            width: `calc(100% + ${HANDLE_BLEED_PX * 2}px)`,
            height: height + HANDLE_BLEED_PX * 2,
            touchAction: "none",
          }}
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
