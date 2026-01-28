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
} from "./geometry";
import { applyHandleDrag, applyShapeDrag, addPhaseAfter, removePhase, togglePhaseHold } from "./handles";
import { drawEnvelope, type Playhead } from "./drawing";

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
  phasesRef.current = phases;
  activeHandleRef.current = activeHandle;
  selectedHandleRef.current = selectedHandle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const currentPhases = phasesRef.current;
      const { dpr, width, height } = getCanvasMetrics(canvas);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

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
        playheads
      );
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current != null) return;

    activePointerIdRef.current = e.pointerId;
    canvas.setPointerCapture(e.pointerId);

    const { rect, dpr, width, height } = getCanvasMetrics(canvas);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, phases);
    const handles = getHandlePositions(phases, coords);
    const hitRadius = 8 * dpr;

    const hitHandle = findClosestHandle(px, py, handles, hitRadius);

    if (hitHandle !== null) {
      setActiveHandle(hitHandle);
      setSelectedHandle(hitHandle);
      setActiveSegment(null);
      curveDragRef.current = null;
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
      onDragStart?.();
      return;
    }

    // Clicked empty area - deselect
    setActiveHandle(null);
    setSelectedHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    activePointerIdRef.current = null;
    canvas.releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const { rect, dpr, width, height } = getCanvasMetrics(canvas);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, phases);
    const nextMs = coords.msOfX(px);
    const nextLevel = coords.levelOfY(py);

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

    const wasDragging = activeHandle != null || activeSegment != null;
    activePointerIdRef.current = null;
    setActiveHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
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
