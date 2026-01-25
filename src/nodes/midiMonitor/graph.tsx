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
  if (event.type === "pitchBend") {
    // Show as percentage of full range (-100% to +100%)
    const pct = Math.round((event.value / 8192) * 100);
    return `PB  ${pct >= 0 ? "+" : ""}${pct}%`;
  }
  if (event.type === "aftertouch") {
    return `AT  ${event.value}`;
  }
  if (event.type === "polyAftertouch") {
    return `PAT ${formatNote(event.note).padEnd(4)} ${event.value}`;
  }
  return "???";
}

function getEventColor(event: MidiEvent): string {
  switch (event.type) {
    case "noteOn":
      return "#4ade80"; // green
    case "noteOff":
      return "#f87171"; // red
    case "cc":
      return "#60a5fa"; // blue
    case "pitchBend":
      return "#c084fc"; // purple
    case "aftertouch":
    case "polyAftertouch":
      return "#facc15"; // yellow
    default:
      return "#9ca3af"; // gray
  }
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
                color: getEventColor(evt),
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
