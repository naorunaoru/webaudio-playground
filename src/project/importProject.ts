import JSZip from "jszip";
import type { GraphState, GraphNode } from "@graph/types";
import { putSampleFromFile } from "@audio/sampleStore";
import { putMidiFromFile } from "@audio/midiStore";
import { normalizeGraph } from "@graph/graphUtils";
import {
  MetaSchema,
  GraphStateSchema,
  CURRENT_FORMAT_VERSION,
  compareVersions,
  type ProjectMeta,
} from "./schemas";

export type ImportResult =
  | {
      success: true;
      graph: GraphState;
      meta: ProjectMeta;
      warnings: string[];
    }
  | {
      success: false;
      error: string;
    };

type SampleMetaFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
};

type MidiMetaFile = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  durationTicks: number;
  ticksPerBeat: number;
  trackCount: number;
};

export async function importProject(file: File): Promise<ImportResult> {
  const warnings: string[] = [];

  try {
    const zip = await JSZip.loadAsync(file);

    const metaFile = zip.file("meta.json");
    if (!metaFile) {
      return { success: false, error: "Missing meta.json in project file" };
    }

    const metaRaw = await metaFile.async("string");
    let metaParsed: unknown;
    try {
      metaParsed = JSON.parse(metaRaw);
    } catch {
      return { success: false, error: "Invalid JSON in meta.json" };
    }

    const metaResult = MetaSchema.safeParse(metaParsed);
    if (!metaResult.success) {
      return {
        success: false,
        error: `Invalid meta.json: ${metaResult.error.message}`,
      };
    }
    const meta = metaResult.data;

    const versionCmp = compareVersions(meta.formatVersion, CURRENT_FORMAT_VERSION);
    if (versionCmp > 0) {
      warnings.push(
        `Project was created with a newer format (${meta.formatVersion}). ` +
          `Some features may not be supported. Current version: ${CURRENT_FORMAT_VERSION}`
      );
    }

    const graphFile = zip.file("graph.json");
    if (!graphFile) {
      return { success: false, error: "Missing graph.json in project file" };
    }

    const graphRaw = await graphFile.async("string");
    let graphParsed: unknown;
    try {
      graphParsed = JSON.parse(graphRaw);
    } catch {
      return { success: false, error: "Invalid JSON in graph.json" };
    }

    const graphResult = GraphStateSchema.safeParse(graphParsed);
    if (!graphResult.success) {
      return {
        success: false,
        error: `Invalid graph.json: ${graphResult.error.message}`,
      };
    }

    const sampleIdMap = new Map<string, string>();

    const sampleFiles = Object.keys(zip.files).filter(
      (path) =>
        path.startsWith("samples/") &&
        !path.endsWith(".meta.json") &&
        !path.endsWith("/")
    );

    for (const samplePath of sampleFiles) {
      const sampleFile = zip.file(samplePath);
      if (!sampleFile) continue;

      const filename = samplePath.split("/").pop() ?? "";
      const dotIdx = filename.lastIndexOf(".");
      const originalId = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;

      const metaPath = `samples/${originalId}.meta.json`;
      const metaJsonFile = zip.file(metaPath);

      let sampleMeta: SampleMetaFile | null = null;
      if (metaJsonFile) {
        try {
          const metaContent = await metaJsonFile.async("string");
          sampleMeta = JSON.parse(metaContent) as SampleMetaFile;
        } catch {
          warnings.push(`Could not parse metadata for sample ${originalId}`);
        }
      }

      const blob = await sampleFile.async("blob");

      const importFile = new File([blob], sampleMeta?.name ?? filename, {
        type: sampleMeta?.mime ?? "audio/wav",
      });

      const storedSample = await putSampleFromFile(importFile);
      sampleIdMap.set(originalId, storedSample.id);
    }

    // Import MIDI files
    const midiIdMap = new Map<string, string>();

    const midiFiles = Object.keys(zip.files).filter(
      (path) =>
        path.startsWith("midi/") &&
        !path.endsWith(".meta.json") &&
        !path.endsWith("/")
    );

    for (const midiPath of midiFiles) {
      const midiFile = zip.file(midiPath);
      if (!midiFile) continue;

      const filename = midiPath.split("/").pop() ?? "";
      const dotIdx = filename.lastIndexOf(".");
      const originalId = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;

      const metaPath = `midi/${originalId}.meta.json`;
      const metaJsonFile = zip.file(metaPath);

      let midiMeta: MidiMetaFile | null = null;
      if (metaJsonFile) {
        try {
          const metaContent = await metaJsonFile.async("string");
          midiMeta = JSON.parse(metaContent) as MidiMetaFile;
        } catch {
          warnings.push(`Could not parse metadata for MIDI ${originalId}`);
        }
      }

      const blob = await midiFile.async("blob");

      const importFile = new File([blob], midiMeta?.name ?? filename, {
        type: "audio/midi",
      });

      if (midiMeta) {
        const storedMidi = await putMidiFromFile(importFile, {
          durationTicks: midiMeta.durationTicks,
          ticksPerBeat: midiMeta.ticksPerBeat,
          trackCount: midiMeta.trackCount,
        });
        midiIdMap.set(originalId, storedMidi.id);
      } else {
        warnings.push(`MIDI file ${originalId} missing metadata, skipping`);
      }
    }

    const graph = graphResult.data as GraphState;
    const remappedNodes: GraphNode[] = graph.nodes.map((node) => {
      if (node.type === "samplePlayer") {
        const state = node.state as {
          sampleId: string | null;
          sampleName: string | null;
          [key: string]: unknown;
        };
        if (state.sampleId) {
          const newId = sampleIdMap.get(state.sampleId);
          if (newId) {
            return {
              ...node,
              state: { ...state, sampleId: newId },
            } as GraphNode;
          }
          warnings.push(
            `Sample ${state.sampleId} not found in project, clearing reference`
          );
          return {
            ...node,
            state: { ...state, sampleId: null, sampleName: null },
          } as GraphNode;
        }
      }
      if (node.type === "midiPlayer") {
        const state = node.state as {
          midiId: string | null;
          midiName: string | null;
          [key: string]: unknown;
        };
        if (state.midiId) {
          const newId = midiIdMap.get(state.midiId);
          if (newId) {
            return {
              ...node,
              state: { ...state, midiId: newId },
            } as GraphNode;
          }
          warnings.push(
            `MIDI file ${state.midiId} not found in project, clearing reference`
          );
          return {
            ...node,
            state: { ...state, midiId: null, midiName: null },
          } as GraphNode;
        }
      }
      return node as GraphNode;
    });

    const remappedGraph: GraphState = {
      ...graph,
      nodes: remappedNodes,
    };

    const normalizedGraph = normalizeGraph(remappedGraph);

    return {
      success: true,
      graph: normalizedGraph,
      meta,
      warnings,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error importing project",
    };
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}
