# Editor Metaphors (Design Stubs)

This document tracks UI metaphors/components that are *editor-level* (graph UI and workflows) rather than “audio parameter controls” like knobs/sliders.

The goal is to keep these primitives reusable so that features like **Group** and **Patch** can be built as workflows on top.

## Selection

### Multi-Select

**Component/metaphor:** `SelectionModel` + selection affordances (outline/halo).

**Core behaviors:**
- Shift-click toggles membership.
- Click empty canvas clears selection.
- Optional “select by type” / “select all connected” later.

**Use cases:**
- Group: select nodes then “Group”.
- Patch: select nodes then “Combine into Patch”.
- Bulk operations: delete/move/duplicate.

### Marquee/Box Selection

**Component/metaphor:** `MarqueeSelect` (drag rectangle) + hit-testing.

**Use cases:**
- Selecting many nodes in dense patches.
- Quickly defining a group boundary.

## Menus & Overlays

### Context Menu

**Component/metaphor:** `ContextMenu` (right click / long-press).

**Use cases:**
- Node actions: rename, duplicate, delete, “Combine”, “Explode”.
- Group actions: ungroup, rename, resize options.
- Patch actions: open, edit interface, save to library.

### Dialog / Modal

**Component/metaphor:** `Dialog` / `Modal` + `ConfirmDialog`.

**Use cases:**
- Confirm destructive actions (explode patch, delete patch definition).
- Combine wizard confirmation (show derived ports and naming collisions).

### Toast / Status

**Component/metaphor:** lightweight `Toast`/`Snackbar` for transient feedback.

**Use cases:**
- “Grouped 7 nodes”, “Saved patch”, “Exploded patch”.

## Naming

### Inline Rename

**Component/metaphor:** `InlineRename` (click title → edit, Enter/Escape).

**Use cases:**
- Node display names (“Oscillator 1”).
- Group names.
- Patch instance names and patch definition names.

## Panels & Navigation

### Inspector / Detail Panel

**Component/metaphor:** `InspectorPanel` / “details sidebar” showing selection properties/actions.

**Use cases:**
- Rename selected node/group/patch without context menu.
- Show patch interface ports and mapping.
- Show selection statistics (node count, connection count).

### Command Palette

**Component/metaphor:** `CommandPalette` (searchable actions).

**Use cases:**
- Run “Group”, “Combine into Patch”, “Explode”, “Export”, etc. without hunting menus.

### Breadcrumb / Navigation

**Component/metaphor:** `Breadcrumbs` or tabbed navigation for “inside patch” editing.

**Use cases:**
- Enter patch internals editor view (later) and return to parent graph.

## Patch UX (Editor-side)

### Combine Wizard (Minimal)

**Component/metaphor:** `CombineWizard` that previews derived patch ports and names.

**Use cases:**
- Resolve ambiguous port names/collisions (“Oscillator 1 MIDI” vs “Oscillator 2 MIDI”).
- Choose which boundary ports become patch ports (if allowing opt-out).

### Patch Library Browser

**Component/metaphor:** `PatchLibraryPanel`.

**Use cases:**
- Save patch definition from selection.
- Instantiate patch definition into current graph.

