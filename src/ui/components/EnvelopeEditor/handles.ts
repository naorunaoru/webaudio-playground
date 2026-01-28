import type { EnvelopePhase } from "@nodes/envelope/types";
import { clampShape } from "@utils/envelope";
import { clamp01 } from "@utils/math";
import type { HandleIndex, SegmentIndex } from "./types";
import { clampMs, cumulativeTimeBeforePhase } from "./geometry";

/**
 * Apply a handle drag to update a phase's duration and targetLevel.
 * Handle i is at the end of phase i.
 */
export function applyHandleDrag(
  phases: EnvelopePhase[],
  handleIndex: HandleIndex,
  nextMs: number,
  nextLevel: number
): EnvelopePhase[] {
  if (handleIndex < 0 || handleIndex >= phases.length) {
    return phases;
  }

  const newPhases = phases.map((p) => ({ ...p }));
  const phase = newPhases[handleIndex]!;

  // Compute the start time of this phase
  const phaseStartMs = cumulativeTimeBeforePhase(phases, handleIndex);

  // Duration is the difference between the new end time and the start time
  const newDurationMs = Math.max(1, clampMs(nextMs) - phaseStartMs);

  // Update the phase
  phase.durationMs = newDurationMs;
  phase.targetLevel = clamp01(nextLevel);

  return newPhases;
}

/**
 * Apply a shape drag to update a phase's curve shape.
 */
export function applyShapeDrag(
  phases: EnvelopePhase[],
  segmentIndex: SegmentIndex,
  startShape: number,
  deltaY: number,
  dpr: number
): EnvelopePhase[] {
  if (segmentIndex < 0 || segmentIndex >= phases.length) {
    return phases;
  }

  const newPhases = phases.map((p) => ({ ...p }));
  const phase = newPhases[segmentIndex]!;

  const sensitivity = 120 * dpr;
  // For phases going up (attack-like), drag down = more exponential
  // For phases going down (decay-like), drag down = more exponential
  const prevLevel = segmentIndex > 0 ? phases[segmentIndex - 1]!.targetLevel : 0;
  const direction = phase.targetLevel > prevLevel ? -1 : 1;
  const nextShape = clampShape(startShape + direction * (deltaY / sensitivity));

  phase.shape = nextShape;

  return newPhases;
}

/**
 * Generate a unique ID for a new phase.
 */
function generatePhaseId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add a new phase after the specified index.
 * If index is -1, adds at the beginning.
 */
export function addPhaseAfter(
  phases: EnvelopePhase[],
  afterIndex: number
): EnvelopePhase[] {
  const insertIndex = afterIndex + 1;

  // Determine reasonable defaults for the new phase
  const prevLevel = afterIndex >= 0 && afterIndex < phases.length
    ? phases[afterIndex]!.targetLevel
    : 0;

  // Default to decaying toward 0 or sustaining at current level
  const newPhase: EnvelopePhase = {
    id: generatePhaseId(),
    targetLevel: Math.max(0, prevLevel - 0.2),
    durationMs: 100,
    shape: 0.6,
    hold: false,
  };

  const newPhases = [...phases];
  newPhases.splice(insertIndex, 0, newPhase);
  return newPhases;
}

/**
 * Remove a phase at the specified index.
 * Won't remove if it's the only phase.
 * Clears hold flag if the last remaining phase would have it.
 */
export function removePhase(
  phases: EnvelopePhase[],
  index: number
): EnvelopePhase[] {
  if (phases.length <= 1 || index < 0 || index >= phases.length) {
    return phases;
  }

  const newPhases = phases.map((p) => ({ ...p }));
  newPhases.splice(index, 1);

  // Clear hold if it's now on the last phase
  const lastIndex = newPhases.length - 1;
  if (newPhases[lastIndex]!.hold) {
    newPhases[lastIndex]!.hold = false;
  }

  return newPhases;
}

/**
 * Toggle the hold flag on a phase.
 * Only one phase can have hold=true, and it cannot be the last phase.
 */
export function togglePhaseHold(
  phases: EnvelopePhase[],
  index: number
): EnvelopePhase[] {
  if (index < 0 || index >= phases.length) {
    return phases;
  }

  // Cannot set hold on the last phase
  if (index === phases.length - 1) {
    return phases;
  }

  const currentlyHeld = phases[index]!.hold;

  // If turning off, just turn off
  if (currentlyHeld) {
    const newPhases = phases.map((p) => ({ ...p }));
    newPhases[index]!.hold = false;
    return newPhases;
  }

  // If turning on, clear hold from all other phases first
  const newPhases = phases.map((p, i) => ({
    ...p,
    hold: i === index,
  }));
  return newPhases;
}

/**
 * Toggle the loopStart flag on a phase.
 * loopStart marks where looping begins when a hold phase is reached.
 * Can only be set on phases at or before a hold phase.
 */
export function toggleLoopStart(
  phases: EnvelopePhase[],
  index: number
): EnvelopePhase[] {
  if (index < 0 || index >= phases.length) {
    return phases;
  }

  // Cannot set loopStart on the last phase
  if (index === phases.length - 1) {
    return phases;
  }

  const currentlyLoopStart = phases[index]!.loopStart ?? false;

  // If turning off, just turn off
  if (currentlyLoopStart) {
    const newPhases = phases.map((p) => ({ ...p }));
    newPhases[index]!.loopStart = false;
    return newPhases;
  }

  // If turning on, clear loopStart from all other phases first
  const newPhases = phases.map((p, i) => ({
    ...p,
    loopStart: i === index,
  }));
  return newPhases;
}

/**
 * Move the loopStart marker to a different phase.
 */
export function moveLoopStart(
  phases: EnvelopePhase[],
  toIndex: number
): EnvelopePhase[] {
  if (toIndex < 0 || toIndex >= phases.length - 1) {
    return phases;
  }

  const newPhases = phases.map((p, i) => ({
    ...p,
    loopStart: i === toIndex,
  }));
  return newPhases;
}

/**
 * Move the hold marker to a different phase.
 */
export function moveHold(
  phases: EnvelopePhase[],
  toIndex: number
): EnvelopePhase[] {
  if (toIndex < 0 || toIndex >= phases.length - 1) {
    return phases;
  }

  const newPhases = phases.map((p, i) => ({
    ...p,
    hold: i === toIndex,
  }));
  return newPhases;
}
