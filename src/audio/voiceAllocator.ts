import type { GraphState, NodeId } from "@graph/types";
import type { DispatchEventFn } from "@/types/nodeModule";

/**
 * State of an individual voice in the allocator.
 */
export type VoiceState = {
  index: number;
  /** True if note is actively held (note-on received, note-off not yet received). */
  noteActive: boolean;
  /** Consumer IDs currently holding this voice (format: `${nodeId}:${portId}`). */
  consumers: Set<string>;
};

/**
 * Allocation state machine for voice count changes.
 * - "stable": voice count matches target
 * - "shrinking": waiting for high-indexed voices to free before shrinking
 */
export type AllocationState =
  | { type: "stable"; voiceCount: number }
  | { type: "shrinking"; currentCount: number; targetCount: number };

/**
 * Dependencies injected into VoiceAllocator.
 * Uses closures to avoid coupling to AudioContext directly.
 */
export type VoiceAllocatorDeps = {
  nodeId: NodeId;
  getGraphRef: () => GraphState | null;
  dispatchEvent: DispatchEventFn;
  getCurrentTime: () => number;
};

/**
 * Manages polyphonic voice allocation with consumer hold tracking.
 *
 * The allocator implements a "Consumer Hold" model where voices are not
 * considered free until:
 * 1. The note is released (noteOff called)
 * 2. All downstream consumers have released their holds
 *
 * This prevents voice stealing from cutting off envelope release phases.
 */
export class VoiceAllocator {
  private voices: VoiceState[];
  private allocationState: AllocationState;
  private allocationOrder: number[] = [];
  private deps: VoiceAllocatorDeps;

  constructor(voiceCount: number, deps: VoiceAllocatorDeps) {
    this.deps = deps;
    this.voices = [];
    for (let i = 0; i < voiceCount; i++) {
      this.voices.push({
        index: i,
        noteActive: false,
        consumers: new Set(),
      });
    }
    this.allocationState = { type: "stable", voiceCount };
  }

  /**
   * Allocate a voice for a new note.
   * Returns the voice index, or null if no voice is available.
   *
   * Allocation priority:
   * 1. First free voice (noteActive=false, no consumers)
   * 2. Steal voice in release phase (noteActive=false, has consumers) - oldest first
   * 3. Steal oldest active voice (noteActive=true) - FIFO order
   */
  allocate(): number | null {
    const count = this.getVoiceCount();

    // 1. Find first completely free voice
    for (let i = 0; i < count; i++) {
      if (this.isVoiceFree(i)) {
        this.allocationOrder.push(i);
        return i;
      }
    }

    // 2. Steal voice in release phase (noteActive=false but consumers holding)
    // Find oldest one based on allocation order
    for (const voiceIdx of this.allocationOrder) {
      if (voiceIdx < count && !this.voices[voiceIdx].noteActive && this.voices[voiceIdx].consumers.size > 0) {
        this.forceRelease(voiceIdx);
        this.removeFromAllocationOrder(voiceIdx);
        this.allocationOrder.push(voiceIdx);
        return voiceIdx;
      }
    }

    // 3. Steal oldest active voice
    if (this.allocationOrder.length > 0) {
      const oldest = this.allocationOrder.shift()!;
      if (oldest < count) {
        this.forceRelease(oldest);
        this.allocationOrder.push(oldest);
        return oldest;
      }
    }

    // Fallback: return first voice if allocation order is somehow empty
    if (count > 0) {
      this.forceRelease(0);
      this.allocationOrder.push(0);
      return 0;
    }

    return null;
  }

  /**
   * Mark a voice as note-off (key released).
   * The voice may still be held by consumers (e.g., envelope in release phase).
   */
  noteOff(voiceIndex: number): void {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return;

    this.voices[voiceIndex].noteActive = false;
    this.removeFromAllocationOrder(voiceIndex);

    // Check if we can complete a pending shrink
    this.checkShrinkCompletion();
  }

  /**
   * Register a consumer hold on a voice.
   * Called by downstream nodes (e.g., envelope) when they start processing a voice.
   *
   * @param voiceIndex The voice index to hold
   * @param consumerId Consumer identifier in format `${nodeId}:${portId}`
   */
  hold(voiceIndex: number, consumerId: string): void {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return;

    this.voices[voiceIndex].consumers.add(consumerId);
  }

  /**
   * Release a consumer hold on a voice.
   * Called by downstream nodes when they finish processing (e.g., envelope release complete).
   *
   * @param voiceIndex The voice index to release
   * @param consumerId Consumer identifier in format `${nodeId}:${portId}`
   */
  release(voiceIndex: number, consumerId: string): void {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return;

    this.voices[voiceIndex].consumers.delete(consumerId);

    // Check if we can complete a pending shrink
    this.checkShrinkCompletion();
  }

  /**
   * Force-release a voice due to voice stealing.
   * Dispatches a force-release event to all consumers and clears all holds.
   *
   * This is called when the allocator must reclaim a voice that consumers
   * are still holding (e.g., for a new note when all voices are in use).
   */
  forceRelease(voiceIndex: number): void {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return;

    const voice = this.voices[voiceIndex];

    // Only dispatch if there are consumers to notify
    if (voice.consumers.size > 0 || voice.noteActive) {
      const graph = this.deps.getGraphRef();
      if (graph) {
        this.deps.dispatchEvent(graph, this.deps.nodeId, "gate_out", {
          type: "force-release",
          voice: voiceIndex,
          time: this.deps.getCurrentTime(),
        });
      }
    }

    // Clear all state
    voice.noteActive = false;
    voice.consumers.clear();
  }

  /**
   * Safety net for consumer disconnect.
   * Clears all holds for a consumer without dispatching events.
   *
   * Consumers should self-cleanup via onConnectionsChanged, but this
   * serves as a fallback if that doesn't happen.
   *
   * @param consumerId Consumer identifier in format `${nodeId}:${portId}`
   */
  consumerDisconnected(consumerId: string): void {
    for (const voice of this.voices) {
      voice.consumers.delete(consumerId);
    }

    // Check if we can complete a pending shrink
    this.checkShrinkCompletion();
  }

  /**
   * Request a voice count change.
   *
   * - Growing is immediate: new voices are added right away
   * - Shrinking is deferred: waits for high-indexed voices to become free
   */
  requestResize(newCount: number): void {
    const currentCount = this.getVoiceCount();

    if (newCount === currentCount) {
      return;
    }

    if (newCount > currentCount) {
      // Growing: immediate
      this.grow(newCount);
    } else {
      // Shrinking: may be deferred
      this.requestShrink(newCount);
    }
  }

  /**
   * Get the current effective voice count.
   */
  getVoiceCount(): number {
    if (this.allocationState.type === "stable") {
      return this.allocationState.voiceCount;
    }
    return this.allocationState.currentCount;
  }

  /**
   * Get the target voice count (may differ from current during shrinking).
   */
  getTargetVoiceCount(): number {
    if (this.allocationState.type === "stable") {
      return this.allocationState.voiceCount;
    }
    return this.allocationState.targetCount;
  }

  /**
   * Check if a voice is completely free (can be allocated without stealing).
   */
  isVoiceFree(voiceIndex: number): boolean {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return false;

    const voice = this.voices[voiceIndex];
    return !voice.noteActive && voice.consumers.size === 0;
  }

  /**
   * Get the state of a specific voice (for debugging/testing).
   */
  getVoiceState(voiceIndex: number): VoiceState | null {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return null;
    return { ...this.voices[voiceIndex], consumers: new Set(this.voices[voiceIndex].consumers) };
  }

  /**
   * Get the current allocation state (for debugging/testing).
   */
  getAllocationState(): AllocationState {
    return { ...this.allocationState };
  }

  /**
   * Mark a voice as actively playing (note-on).
   * This is typically called after allocate() succeeds.
   */
  markNoteActive(voiceIndex: number): void {
    if (voiceIndex < 0 || voiceIndex >= this.voices.length) return;
    this.voices[voiceIndex].noteActive = true;
  }

  // --- Private methods ---

  private grow(newCount: number): void {
    // Add new voice states
    for (let i = this.voices.length; i < newCount; i++) {
      this.voices.push({
        index: i,
        noteActive: false,
        consumers: new Set(),
      });
    }

    this.allocationState = { type: "stable", voiceCount: newCount };
  }

  private requestShrink(newCount: number): void {
    const currentCount = this.getVoiceCount();

    // Check if high-indexed voices are already free
    let canShrinkImmediately = true;
    for (let i = newCount; i < currentCount; i++) {
      if (!this.isVoiceFree(i)) {
        canShrinkImmediately = false;
        break;
      }
    }

    if (canShrinkImmediately) {
      this.completeShrink(newCount);
    } else {
      // Defer shrinking
      this.allocationState = {
        type: "shrinking",
        currentCount,
        targetCount: newCount,
      };
    }
  }

  private checkShrinkCompletion(): void {
    if (this.allocationState.type !== "shrinking") return;

    const { currentCount, targetCount } = this.allocationState;

    // Check if all high-indexed voices are now free
    for (let i = targetCount; i < currentCount; i++) {
      if (!this.isVoiceFree(i)) {
        return; // Still waiting
      }
    }

    this.completeShrink(targetCount);
  }

  private completeShrink(newCount: number): void {
    // Remove high-indexed voices from allocation order
    this.allocationOrder = this.allocationOrder.filter((i) => i < newCount);

    // Truncate voices array
    this.voices.length = newCount;

    this.allocationState = { type: "stable", voiceCount: newCount };
  }

  private removeFromAllocationOrder(voiceIndex: number): void {
    const idx = this.allocationOrder.indexOf(voiceIndex);
    if (idx !== -1) {
      this.allocationOrder.splice(idx, 1);
    }
  }
}
