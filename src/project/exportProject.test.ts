import { describe, it, expect, vi } from "vitest";

vi.stubGlobal("__BUILD_REVISION__", "test123");

import { exportProject } from "./exportProject";
import JSZip from "jszip";

describe("exportProject", () => {
  it("includes buildRevision in meta.json", async () => {
    const blob = await exportProject({ nodes: [], connections: [] });
    const buffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const metaJson = await zip.file("meta.json")?.async("string");
    const meta = JSON.parse(metaJson!);

    expect(meta.buildRevision).toBe("test123");
  });
});
