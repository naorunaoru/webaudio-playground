/**
 * Voice mapping for translating voice indices between nodes.
 *
 * Pass-through nodes (like a hypothetical Gate Delay or Gate Router) may
 * remap voice indices. This interface allows consumers to translate their
 * local voice index back to the upstream allocator's voice index.
 */
export interface VoiceMapping {
  /**
   * Map a downstream voice index to the upstream voice index.
   * Used when a consumer needs to call hold/release on the allocator.
   */
  toUpstream(downstreamVoice: number): number;

  /**
   * Map an upstream voice index to the downstream voice index.
   * Returns null if the upstream voice is not mapped to this downstream.
   */
  toDownstream(upstreamVoice: number): number | null;
}

/**
 * Identity mapping: voice indices pass through unchanged.
 * Used for direct connections without any voice remapping.
 */
export const identityMapping: VoiceMapping = {
  toUpstream(downstreamVoice: number): number {
    return downstreamVoice;
  },

  toDownstream(upstreamVoice: number): number | null {
    return upstreamVoice;
  },
};

/**
 * Compose two voice mappings.
 *
 * When traversing through multiple pass-through nodes, mappings are composed
 * to create a single mapping from the consumer to the allocator.
 *
 * @param outer The mapping closer to the consumer (applied first for toUpstream)
 * @param inner The mapping closer to the allocator (applied second for toUpstream)
 * @returns A composed mapping
 */
export function composeMappings(outer: VoiceMapping, inner: VoiceMapping): VoiceMapping {
  return {
    toUpstream(downstreamVoice: number): number {
      // First apply outer (consumer -> intermediate), then inner (intermediate -> allocator)
      const intermediate = outer.toUpstream(downstreamVoice);
      return inner.toUpstream(intermediate);
    },

    toDownstream(upstreamVoice: number): number | null {
      // First apply inner (allocator -> intermediate), then outer (intermediate -> consumer)
      const intermediate = inner.toDownstream(upstreamVoice);
      if (intermediate === null) return null;
      return outer.toDownstream(intermediate);
    },
  };
}
