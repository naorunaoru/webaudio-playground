import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import { clamp } from "@utils/math";

type DelayGraphNode = Extract<GraphNode, { type: "delay" }>;

function createDelayRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<DelayGraphNode> {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const delay = ctx.createDelay(5.0);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();

  // Feedback send: taps the delayed signal for external processing
  const feedbackSend = ctx.createGain();
  feedbackSend.gain.value = 1;

  // Feedback return: receives processed signal from external chain
  const feedbackReturn = ctx.createGain();
  feedbackReturn.gain.value = 1;

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  // Dry path
  input.connect(dry);
  dry.connect(output);

  // Wet path: input → delay → feedback (gain) → wet → output
  // This ensures the first repeat is also attenuated by feedback amount
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(wet);
  wet.connect(output);

  // Internal feedback loop (default): feedback output loops back to delay
  feedback.connect(delay);
  let internalFeedbackConnected = true;

  // Feedback send taps after delay, before feedback gain (so external chain receives full signal)
  delay.connect(feedbackSend);

  // Feedback return routes through its own gain to delay input
  feedbackReturn.connect(delay);

  output.connect(meter);

  return {
    type: "delay",
    updateState: (state) => {
      const now = ctx.currentTime;
      const delayMs = clamp(state.delayMs, 0, 5000);
      const feedbackGain = clamp(state.feedback, 0, 0.98);
      const mix = clamp(state.mix, 0, 1);

      delay.delayTime.setTargetAtTime(delayMs / 1000, now, 0.015);
      // The feedback/return level applies to whichever path is active
      feedback.gain.setTargetAtTime(feedbackGain, now, 0.02);
      feedbackReturn.gain.setTargetAtTime(feedbackGain, now, 0.02);
      wet.gain.setTargetAtTime(mix, now, 0.02);
      dry.gain.setTargetAtTime(1 - mix, now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      if (portId === "feedback_return") return feedbackReturn;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      if (portId === "feedback_send") return feedbackSend;
      return null;
    },
    onConnectionsChanged: ({ inputs }) => {
      const hasExternalFeedback = inputs.has("feedback_return");
      if (hasExternalFeedback && internalFeedbackConnected) {
        // External feedback connected - disconnect internal loop
        feedback.disconnect(delay);
        internalFeedbackConnected = false;
      } else if (!hasExternalFeedback && !internalFeedbackConnected) {
        // External feedback disconnected - reconnect internal loop
        feedback.connect(delay);
        internalFeedbackConnected = true;
      }
    },
    onRemove: () => {
      meter.disconnect();
      output.disconnect();
      wet.disconnect();
      dry.disconnect();
      feedback.disconnect();
      feedbackSend.disconnect();
      feedbackReturn.disconnect();
      delay.disconnect();
      input.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function delayAudioFactory(_services: AudioNodeServices): AudioNodeFactory<DelayGraphNode> {
  return {
    type: "delay",
    create: (ctx, nodeId) => createDelayRuntime(ctx, nodeId),
  };
}

