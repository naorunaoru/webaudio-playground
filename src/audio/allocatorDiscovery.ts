import type { GraphState, NodeId } from "@graph/types";
import type { AudioNodeInstance } from "@/types/audioRuntime";
import type { VoiceAllocator } from "./voiceAllocator";
import { type VoiceMapping, identityMapping, composeMappings } from "./voiceMapping";

/**
 * Result of finding an upstream voice allocator.
 */
export type AllocatorLookupResult = {
  /** The voice allocator that owns the voices. */
  allocator: VoiceAllocator;
  /** The node ID of the voice source (owner of the allocator). */
  sourceId: NodeId;
  /** Voice mapping from consumer's voice indices to allocator's voice indices. */
  mapping: VoiceMapping;
};

/**
 * Find the upstream voice allocator for a given node's input port.
 *
 * Traverses backward through gate/trigger connections to find the voice source
 * that owns the allocator. Composes voice mappings along the way for pass-through nodes.
 *
 * @param graph The current graph state
 * @param nodeId The node looking for its allocator
 * @param inputPortId The input port that received the voice event (e.g., "gate_in")
 * @param getAudioNode Function to look up audio node instances
 * @returns The allocator lookup result, or null if no allocator found
 */
export function findAllocator(
  graph: GraphState,
  nodeId: NodeId,
  inputPortId: string,
  getAudioNode: (nodeId: NodeId) => AudioNodeInstance | undefined
): AllocatorLookupResult | null {
  // Find the connection coming into this port
  const incomingConn = graph.connections.find(
    (c) =>
      (c.kind === "gate" || c.kind === "trigger") &&
      c.to.nodeId === nodeId &&
      c.to.portId === inputPortId
  );

  if (!incomingConn) {
    // No connection to this port
    return null;
  }

  // Start traversal from the source of this connection
  return traverseForAllocator(
    graph,
    incomingConn.from.nodeId,
    incomingConn.from.portId,
    identityMapping,
    getAudioNode,
    new Set()
  );
}

/**
 * Recursively traverse backward through the graph to find an allocator.
 *
 * @param graph The current graph state
 * @param currentNodeId The node we're currently examining
 * @param outputPortId The output port on this node (where the event came from)
 * @param accumulatedMapping The composed mapping so far
 * @param getAudioNode Function to look up audio node instances
 * @param visited Set of visited node IDs (cycle detection)
 */
function traverseForAllocator(
  graph: GraphState,
  currentNodeId: NodeId,
  outputPortId: string,
  accumulatedMapping: VoiceMapping,
  getAudioNode: (nodeId: NodeId) => AudioNodeInstance | undefined,
  visited: Set<NodeId>
): AllocatorLookupResult | null {
  // Cycle detection
  if (visited.has(currentNodeId)) {
    return null;
  }
  visited.add(currentNodeId);

  const audioNode = getAudioNode(currentNodeId);
  if (!audioNode) {
    return null;
  }

  // Check if this node owns a voice allocator
  if (audioNode.voiceAllocator) {
    return {
      allocator: audioNode.voiceAllocator,
      sourceId: currentNodeId,
      mapping: accumulatedMapping,
    };
  }

  // This might be a pass-through node - get its voice mapping for this output
  const nodeMapping = audioNode.getVoiceMappingForOutput?.(outputPortId) ?? identityMapping;

  // Compose the mapping: consumer -> this node -> upstream
  const newMapping = composeMappings(accumulatedMapping, nodeMapping);

  // Find the event input port on this node that corresponds to this output
  // For pass-through nodes, we need to find where the event came from
  const eventInputPort = findEventInputPort(graph, currentNodeId, outputPortId);

  if (!eventInputPort) {
    // No event input found - this node generates events but has no allocator
    // This shouldn't happen in a well-formed graph, but handle gracefully
    return null;
  }

  // Find the connection coming into the event input port
  const incomingConn = graph.connections.find(
    (c) =>
      (c.kind === "gate" || c.kind === "trigger") &&
      c.to.nodeId === currentNodeId &&
      c.to.portId === eventInputPort
  );

  if (!incomingConn) {
    // No upstream connection
    return null;
  }

  // Recurse to the upstream node
  return traverseForAllocator(
    graph,
    incomingConn.from.nodeId,
    incomingConn.from.portId,
    newMapping,
    getAudioNode,
    visited
  );
}

/**
 * Find the event input port on a node that corresponds to a given output port.
 *
 * For simple pass-through nodes, this finds the matching gate/trigger input.
 * For nodes with multiple event I/O, this uses a naming convention or the first match.
 *
 * @param graph The current graph state
 * @param nodeId The node to examine
 * @param outputPortId The output port we're tracing back from
 * @returns The input port ID, or null if none found
 */
function findEventInputPort(
  graph: GraphState,
  nodeId: NodeId,
  outputPortId: string
): string | null {
  // Find all event connections going INTO this node
  const eventInputs = graph.connections.filter(
    (c) =>
      (c.kind === "gate" || c.kind === "trigger") &&
      c.to.nodeId === nodeId
  );

  if (eventInputs.length === 0) {
    return null;
  }

  // If there's only one event input, use it
  if (eventInputs.length === 1) {
    return eventInputs[0].to.portId;
  }

  // Multiple event inputs - try to match by naming convention
  // e.g., "gate_out" -> "gate_in", "trigger_out" -> "trigger_in"
  const expectedInput = outputPortId.replace("_out", "_in");
  const matchingInput = eventInputs.find((c) => c.to.portId === expectedInput);

  if (matchingInput) {
    return matchingInput.to.portId;
  }

  // Fall back to the first event input
  return eventInputs[0].to.portId;
}
