# Groups (Design Doc)

This document describes a **Group** feature: a lightweight, reversible way to visually and ergonomically organize multiple nodes without changing audio/MIDI semantics.

Unlike Patch nodes, Groups do **not** create a new node type in the audio graph. They are a UI/graph-editor construct.

See `docs/group/roadmap.md` for missing requirements and a staged plan.

## Goals

- Select a set of nodes and create a **Group**.
- Group provides:
  - A visible bounding region (“frame”) with a title.
  - Selection convenience (select group → selects member nodes).
  - Movement convenience (drag group → moves all member nodes).
- Group is reversible:
  - Ungroup restores the graph exactly as it was (node IDs and connections unchanged).
- Group is compatible with all node types and future nested graph features.

## Non-goals (initially)

- Turning a group into an actual runnable subgraph (“Patch”) automatically.
- Collapsing a group into a single node (that is the Patch feature).
- Editing ports at the group level.

## Data Model (Idealized)

Add a `groups` collection to the graph document:

- `Group`
  - `id`
  - `name` (user-editable)
  - `color` / style (optional)
  - `memberNodeIds: NodeId[]`
  - `rect` (optional cached bounds; can also be derived from member positions)

Notes:
- Groups must tolerate member deletion (auto-remove missing node IDs).
- Groups can overlap; z-order rules should be defined (e.g. separate group z-order from node z-order).

## UI/UX Behaviors

### Create Group

- User selects nodes → clicks “Group”.
- Default group name could be “Group 1”, renameable.
- Bounds can be:
  - Derived from member node bounding boxes with padding.
  - Or explicitly resized by the user (requires storing `rect`).

### Selecting

- Clicking the group frame selects the group.
- Group selection may imply:
  - single-click: selects group only
  - double-click or modifier: selects all member nodes

This affects keyboard actions (delete, nudge, copy).

### Moving

- Dragging the group frame moves all member nodes by the delta.
- Move is recorded as a batch operation (one undo step).

### Ungroup

- Removes the group record only.
- Does not affect nodes or connections.

## Tradeoffs / Drawbacks

- **No reduction in graph complexity**: groups do not change how many nodes/edges exist; they only improve readability and manipulation.
- **Overlapping groups** introduce ambiguity for selection/movement and need clear rules.
- **Bounds calculation** can be surprising if purely derived from members; storing explicit bounds makes resizing easy but adds state to persist.
- **Discoverability**: group frames must be clickable without interfering with node interactions.

## Relationship to Patch

Group is a natural precursor to Patch:

- “Promote Group to Patch” can later:
  - Use the group’s member set as the selection set.
  - Derive patch boundary ports from boundary connections.
  - Freeze an explicit interface mapping.

Keeping Group independent avoids prematurely committing to nested graph semantics, while still enabling the “select → combine” workflow in a lightweight form.

