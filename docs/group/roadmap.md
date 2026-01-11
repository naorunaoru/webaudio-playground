# Group Roadmap

Groups are treated as an implicit prerequisite for Patch (you can’t “combine a selection” without a robust notion of selection + grouping).

## MVP

- [ ] Multi-select nodes
  - [ ] Shift-click add/remove from selection
  - [ ] Drag marquee/box selection (optional but very useful)
  - [ ] Selection UI state: nodes + connections + groups (later)
- [ ] Group data model
  - [ ] Add `groups` to graph doc/state
  - [ ] Persist groups via Automerge
  - [ ] Normalize groups (drop missing members)
- [ ] Group rendering
  - [ ] Draw group frame behind member nodes
  - [ ] Compute bounds from member positions (+ padding) or store explicit `rect`
  - [ ] Hit-testing that doesn’t break node port interactions
- [ ] Group interactions
  - [ ] Create group from selection
  - [ ] Select group (and optionally “select members” affordance)
  - [ ] Drag group to move all member nodes (single undo step)
  - [ ] Ungroup

## Integration

- [ ] Import/export groups in project `.zip`
- [ ] Undo/redo descriptions for group actions
- [ ] Keyboard actions: delete group vs delete members (define semantics)

## Later / Nice-to-have

- [ ] Rename groups
- [ ] Resize group frame (explicit `rect`)
- [ ] Overlapping groups and z-order policy
- [ ] “Promote Group to Patch”

