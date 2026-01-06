# Patch Nodes (Design Doc)

This document describes the long-term design for a reusable **Patch** feature: selecting an arbitrary subgraph and packaging it into a single node with a stable external interface. The patch node is primarily a **different representation** of constituent nodes and connections.

This is a “spherical ideal in vacuum” reference doc: it prioritizes clarity and future-proofing over minimal implementation.

See `docs/patch/roadmap.md` for missing requirements and a staged plan.

## Goals

- Combine a selected set of nodes into a single node called **Patch**.
- Patch presents:
  - A stable set of external ports derived from boundary connections.
  - A grouped UI composed from the constituent nodes’ UIs.
- Patch is **reusable** (can be saved/loaded as a template), but **instances are independent** (editing an instance does not affect other instances).
- Operation is reversible:
  - A patch created from a selection can be “exploded” back into the original nodes while preserving the original node IDs.
- Patch instances can later gain an “edit internals” view (not required for the initial combine feature).

## Non-goals (initially)

- Full nested graph editor UX.
- Polyphony/multi-instance voice management.
- Automatic port merging (e.g. MIDI fan-out, output mixing) without explicit routing/mixing nodes.
- Automatic “smart” parameter exposure rules.

## Key Concepts

### Patch Definition vs Patch Instance

- **Patch definition**: a reusable template stored in a library.
  - Contains an internal graph template and an interface description.
- **Patch instance**: a node in the current graph.
  - Instances are created by copying a definition (deep copy + ID remap).
  - Instances may later diverge (local edits), without affecting the definition or other instances.

Practical implication: a patch instance should store its internal graph **inline** (or as a private nested document) rather than referencing a shared mutable graph.

### Stable Interface (Frozen Ports)

Patch external ports must be stable for existing connections to remain valid.

- Ports are **frozen at combine-time** by storing an explicit mapping:
  - `patchPortId` → `{ nodeId, portId }` inside the patch internal graph.
- If the internal graph changes later, the mapping remains stable unless the user explicitly edits the patch interface.

## Data Model (Idealized)

### Patch Node

At the top-level graph:
- A `patch` node has:
  - `patchInstanceId` (stable ID)
  - `name` (user-editable)
  - `interface` (frozen port mapping)
  - `uiLayout` (grouping metadata; optional)
  - `internalGraph` (nodes + connections)

### Node Display Names

Port labels and UI grouping rely on nodes having a stable display name (e.g. “Oscillator 1”), separate from the node type (“Oscillator”).

Options:
- Add a `label` field to the shared node base (preferred).
- Or maintain a parallel metadata map keyed by node ID (if node state must remain strictly type-local).

### Patch Library

Patch library records should include:
- `id`, `name`, `createdAt`, `updatedAt`
- `definitionGraph` (internal nodes + connections)
- `interface` (port mapping)
- `uiLayout` (optional)
- `formatVersion` for migrations

Storage options:
- Separate Automerge document(s)
- IndexedDB/JSON store
- Export/import via project zip (future)

## Combine Operation (Selection → Patch)

### Boundary Detection

Given a selection set **S** of nodes:

1. Identify **external connections**:
   - `from ∉ S` → `to ∈ S`  (incoming boundary)
   - `from ∈ S` → `to ∉ S`  (outgoing boundary)
2. “Unused” means: **not connected within the selection** (internal connectivity does not create patch ports).

### Port Creation Rule (1:1 Mapping)

Each distinct boundary endpoint becomes a distinct patch port:

- Incoming boundary connection to `{nodeId, portId}` becomes a patch **input** port.
- Outgoing boundary connection from `{nodeId, portId}` becomes a patch **output** port.

No automatic merging:
- If two internal nodes both expect MIDI in from outside, patch gets two MIDI inputs.
- If a single “fanout” behavior is desired, it is authored explicitly using a routing node inside the patch.

### Port Naming

Default port label:
- `"<Node Display Name> <Port Name>"`

Example:
- “Oscillator 1 MIDI”
- “Envelope 1 Env”

Port IDs should be stable and collision-resistant, e.g.:
- `in__<nodeId>__<portId>`
- `out__<nodeId>__<portId>`

The label can be user-renamed later without changing the ID.

### Rewiring

After port creation, update the top-level graph:

- Replace the selected nodes by a single patch node.
- For every boundary connection:
  - External → internal becomes External → PatchPort.
  - Internal → external becomes PatchPort → External.
- Internal connections among selected nodes are moved into `internalGraph`.

### Reversibility and ID Preservation

If the patch was created from an existing selection:
- Record an “explode recipe” in the patch instance:
  - Original node IDs, original internal wiring, and original boundary mapping.
- On explode:
  - Remove the patch node.
  - Restore all original nodes with their original IDs and all original connections.

Note: for patch instances created from a reusable definition, there are no “original top-level IDs” to restore; explode restores the instance’s internal IDs.

## Patch UI Composition (Grouped Controls)

Patch node UI is a projection of internal nodes’ UIs:

- Each internal node becomes a **group** in the patch UI.
- Group title uses the node display name (e.g. “Oscillator 1”).
- Group content re-renders the node’s existing React UI component.

### Routing UI Actions

To reuse existing node UIs unchanged, the patch UI needs to provide:
- `onPatchNode(internalNodeId, patch)` targeting internal nodes
- `runtimeState[internalNodeId]`
- Optional batching/undo boundaries that remain sane (patch-level vs internal-level history)

### “Controls” vs “Views”

A node UI might contain:
- controls (knobs, toggles)
- telemetry/views (meters, scopes)

Patch composition should embed the entire node UI by default (controls + views), even if it becomes large. Future refinements can add:
- “Expose minimal controls” flags per node/parameter
- Collapsible groups

## Runtime Semantics

### Audio and Automation

Patch runtime should behave exactly as if the internal nodes existed in the top-level graph:
- Internal nodes get their own audio runtimes.
- Internal audio/automation wiring happens inside the patch.
- Patch boundary ports connect external signals to the mapped internal endpoint.

### MIDI/CC Events

MIDI/CC routing into a patch should be explicit:
- If a patch has one MIDI input and needs fanout/filtering, it uses routing nodes inside the patch.
- Patch itself should not implement hidden fanout logic.

## Audio → Automation Connections (Possible Future Change)

Allowing audio-rate signals to drive “automation” (AudioParam/CV) can be powerful, but it changes several assumptions:

- **Unit mismatch**: audio signals are typically [-1..1] AC; automation often expects absolute units (Hz, gain, seconds).
- **DC offset**: many modulation schemes require bias/offset nodes.
- **Smoothing**: AudioParam inputs may need filtering or scaling to avoid zippering or instability.

Tradeoff: permitting audio→automation enables FM-style patching without worklets, but the UI needs strong affordances (scalers, offsets, clamps) to avoid confusing results.

## Major Tradeoffs / Drawbacks

- **Foundational complexity**: a true Patch feature is nested graphs + stable interfaces + UI composition + routing across boundaries.
- **Port stability vs flexibility**: frozen ports prevent accidental breakage but require explicit “edit interface” tooling later.
- **Undo/redo semantics**: patch-level edits vs internal-node edits need a coherent history model.
- **Debugging**: collapsed patches hide important state; an “open internals” mode becomes essential.
- **Performance**: rendering many internal node UIs inside one card can be heavy; virtualized UI or collapsible groups may be required.
- **Serialization/migrations**: project format must evolve to store patch definitions/instances safely, with versioning and migrations.

## Relationship to “Group”

“Group” is a separate, lighter-weight feature for organizing the top-level graph visually without changing routing or data model.

A future UX can allow:
- Group → Patch (“promote to patch”), using the same boundary detection and interface freeze rules.

