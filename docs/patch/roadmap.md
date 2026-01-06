# Patch Roadmap

Groups are an implicit prerequisite for Patch: Patch “combine” starts from a selected set of nodes, which requires robust multi-selection and grouping UX.

## MVP Prerequisites (Group)

- [ ] Multi-select nodes (shift/box selection) and maintain a stable selection set
- [ ] Group create/ungroup with persistence and undo/redo
- [ ] Group bounding box rendering and hit-testing

## Patch MVP (Combine + Reversible)

- [ ] Patch definition storage (local library): create, list, rename, delete
- [ ] Instantiate patch from definition (deep copy + ID remap; instances independent)
- [ ] Combine selection → patch instance:
  - [ ] Detect boundary ports (“unused” = not connected within selection)
  - [ ] Create frozen interface mapping (1:1 ports; no merging)
  - [ ] Rewire external connections to patch ports
  - [ ] Preserve original node IDs for explode in the “created from selection” case
- [ ] Explode patch back to original selection (when possible), restoring IDs and boundary wiring
- [ ] Patch node UI composition (group internal node UIs by node display name)
- [ ] Node display names/labels (required for port naming + UI grouping)

## Engine / Runtime

- [ ] Patch runtime wiring:
  - [ ] Instantiate internal node runtimes
  - [ ] Wire internal connections
  - [ ] Wire patch boundary ports to internal endpoints
- [ ] MIDI/CC routing across patch boundary (explicit; no implicit fanout)
- [ ] Runtime state plumbing so internal UIs can show meters/scopes inside patch UI
- [ ] Undo/redo semantics for patch-internal parameter edits (patch UI calling `onPatchNode` for internal nodes)

## Serialization / Compatibility

- [ ] Project format updates (`docs/project-format.md`):
  - [ ] Store patch instances (internal graphs + interface mappings)
  - [ ] Store patch library definitions (optional, or export separately)
  - [ ] Versioning + migrations for node states and patch schemas
- [ ] Import/export of patch instances in `.zip`

## Later / Nice-to-have

- [ ] “Open patch internals” editor view
- [ ] Patch interface editor (add/remove/rename ports without breaking existing edges)
- [ ] Promote Group → Patch
- [ ] Dedicated routing/mixing primitives to reduce “many ports” pressure (split, merge, mixer)
- [ ] Audio→automation support (if adopted): scaling/offset/clamp primitives + UI affordances

