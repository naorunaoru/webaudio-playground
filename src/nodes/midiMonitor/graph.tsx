import { useEffect, useState } from "react";
import type { GraphNode, MidiEvent } from "@graph/types";
import { useRuntimeStateGetter } from "@graph/hooks";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import type { MidiMonitorRuntimeState } from "./types";

type MidiMonitorNode = Extract<GraphNode, { type: "midiMonitor" }>;

function defaultState(): MidiMonitorNode["state"] {
  return { maxEvents: 8 };
}

function formatNote(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave}`;
}

function formatEvent(event: MidiEvent): string {
  if (event.type === "noteOn") {
    return `ON  ${formatNote(event.note).padEnd(4)} v${event.velocity}`;
  }
  if (event.type === "noteOff") {
    return `OFF ${formatNote(event.note).padEnd(4)}`;
  }
  if (event.type === "cc") {
    return `CC${event.controller.toString().padStart(3)} = ${event.value}`;
  }
  return "???";
}

const MidiMonitorUi: React.FC<NodeUiProps<MidiMonitorNode>> = ({
  node,
  audioState,
}) => {
  const getRuntimeState = useRuntimeStateGetter<MidiMonitorRuntimeState>(node.id);
  const [events, setEvents] = useState<MidiEvent[]>([]);

  useEffect(() => {
    if (audioState !== "running") return;

    let raf = 0;
    const tick = () => {
      const state = getRuntimeState();
      if (state?.events) {
        setEvents(state.events);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState, audioState]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          background: "rgba(0,0,0,0.4)",
          borderRadius: 4,
          padding: 8,
          minHeight: 120,
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {events.length === 0 ? (
          <div style={{ opacity: 0.5, fontStyle: "italic" }}>No events</div>
        ) : (
          [...events].reverse().map((evt, i) => (
            <div
              key={i}
              style={{
                padding: "2px 0",
                opacity: 1 - i * 0.08,
                color: evt.type === "noteOn" ? "#4ade80" : evt.type === "noteOff" ? "#f87171" : "#60a5fa",
              }}
            >
              {formatEvent(evt)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const midiMonitorGraph: NodeDefinition<MidiMonitorNode> = {
  type: "midiMonitor",
  title: "MIDI Monitor",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "midi_out", name: "MIDI", kind: "midi", direction: "out" },
  ],
  ui: MidiMonitorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiMonitorNode["state"]>;
    const d = defaultState();
    return {
      maxEvents: s.maxEvents ?? d.maxEvents,
    };
  },
};
