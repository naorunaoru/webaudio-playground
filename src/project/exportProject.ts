import JSZip from "jszip";
import type { GraphState } from "@graph/types";
import { getSample, type StoredSample } from "@audio/sampleStore";
import { CURRENT_FORMAT_VERSION, type ProjectMeta } from "./schemas";

type SampleRef = {
  sampleId: string;
  nodeId: string;
};

function collectSampleRefs(graph: GraphState): SampleRef[] {
  const refs: SampleRef[] = [];
  for (const node of graph.nodes) {
    if (node.type === "samplePlayer") {
      const state = node.state as { sampleId: string | null };
      if (state.sampleId) {
        refs.push({ sampleId: state.sampleId, nodeId: node.id });
      }
    }
  }
  return refs;
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "audio/webm": "webm",
  };
  return map[mime] ?? "bin";
}

export type ExportOptions = {
  projectName?: string;
};

export async function exportProject(
  graph: GraphState,
  options: ExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();

  const meta: ProjectMeta = {
    formatVersion: CURRENT_FORMAT_VERSION,
    projectName: options.projectName ?? "Untitled Project",
    createdAt: Date.now(),
    exportedAt: Date.now(),
    buildRevision: __BUILD_REVISION__,
  };
  zip.file("meta.json", JSON.stringify(meta, null, 2));

  const sampleRefs = collectSampleRefs(graph);
  const samplesFolder = zip.folder("samples");
  const processedIds = new Set<string>();

  for (const ref of sampleRefs) {
    if (processedIds.has(ref.sampleId)) continue;
    processedIds.add(ref.sampleId);

    const sample = await getSample(ref.sampleId);
    if (!sample) {
      console.warn(`Sample ${ref.sampleId} not found in IndexedDB`);
      continue;
    }

    const ext = extensionFromMime(sample.mime);
    const filename = `${ref.sampleId}.${ext}`;

    const sampleMeta: StoredSample = {
      id: sample.id,
      name: sample.name,
      mime: sample.mime,
      size: sample.size,
      createdAt: sample.createdAt,
    };

    samplesFolder?.file(filename, sample.data);
    samplesFolder?.file(
      `${ref.sampleId}.meta.json`,
      JSON.stringify(sampleMeta, null, 2)
    );
  }

  zip.file("graph.json", JSON.stringify(graph, null, 2));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
