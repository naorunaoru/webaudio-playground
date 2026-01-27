import { z } from "zod";
import { PORT_KINDS } from "@/graph/types";

export const CURRENT_FORMAT_VERSION = "1.0.0";

const semverRegex = /^\d+\.\d+\.\d+$/;

export const MetaSchema = z.object({
  formatVersion: z.string().refine((v) => semverRegex.test(v), {
    message: "Invalid semver format",
  }),
  projectName: z.string().optional(),
  createdAt: z.number().optional(),
  exportedAt: z.number().optional(),
  buildRevision: z.string().optional(),
});

export type ProjectMeta = z.infer<typeof MetaSchema>;

const PortKindSchema = z.enum(PORT_KINDS);

const ConnectionEndpointSchema = z.object({
  nodeId: z.string(),
  portId: z.string(),
});

const GraphConnectionSchema = z.object({
  id: z.string(),
  kind: PortKindSchema,
  from: ConnectionEndpointSchema,
  to: ConnectionEndpointSchema,
});

const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  state: z.unknown(),
});

export const GraphStateSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  connections: z.array(GraphConnectionSchema),
});

export type ValidatedGraphState = z.infer<typeof GraphStateSchema>;

export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
