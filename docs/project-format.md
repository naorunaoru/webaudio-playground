# Project Format

Projects are exported/imported as a single `.zip` file containing the graph plus any referenced sample audio.

The canonical implementation lives in:
- `src/project/exportProject.ts`
- `src/project/importProject.ts`
- `src/project/schemas.ts`

## Container Layout

```
<project>.zip
├── meta.json
├── graph.json
└── samples/
    ├── <sampleId>.<ext>
    └── <sampleId>.meta.json
```

## `meta.json`

Small metadata used for compatibility checks and UX:
- `formatVersion` (required): semantic version string used to detect newer/older formats
- `projectName` (optional)
- `createdAt` / `exportedAt` (optional, epoch milliseconds)

Import compares `formatVersion` against the app’s current `CURRENT_FORMAT_VERSION`. Newer versions are allowed but may emit warnings.

## `graph.json`

The graph is exported as JSON with:
- `nodes`: positioned node instances (`id`, `type`, `x`, `y`, `state`)
- `connections`: edges with `kind` (`audio`/`midi`/`cc`/`automation`) and `{ from, to }` endpoints

Notes:
- Node `state` is treated as opaque JSON at the project-format layer; node-specific normalization happens after import.
- Only the fields validated by `GraphStateSchema` are imported. Extra fields in the JSON are currently ignored.

## `samples/`

Referenced sample audio is embedded in the zip:
- `<sampleId>.<ext>`: raw audio data (extension derived from MIME type at export time)
- `<sampleId>.meta.json`: sample metadata (name, mime, size, createdAt)

On import, samples are written into local storage (IndexedDB) and assigned new IDs; any nodes that referenced the old IDs are remapped to the new IDs.

## Import Normalization

After parsing and validating:
- Samples are imported first, building an old-ID → new-ID map.
- Nodes that reference samples are remapped (missing samples clear the reference and emit warnings).
- The graph is normalized to match the currently-registered node/port definitions:
  - Node state may be normalized by node definitions (when supported).
  - Invalid connections (missing nodes/ports, kind mismatches, direction mismatches) are dropped.

