# UI Implementation Roadmap

Status: ✅ Done | 🚧 Partial | ⬜ Planned

---

## Controls

### Infrastructure

- [x] Theme system — `src/ui/context/theme.ts`
- [ ] Grid layout (NodePanel)
- [x] Label — `src/ui/components/Label.tsx`
- [x] Tooltip — `src/ui/components/Tooltip.tsx`

### Shared Hooks

- [ ] useContinuousValue — range value utilities
- [ ] useSingleSelect — discrete single selection
- [ ] useMultiSelect — discrete multiple selection
- [x] useDragValue — `src/ui/hooks/useDragValue.ts`
- [ ] useRepeatAction — hold-to-repeat timing

### Continuous Controls

- [x] Knob (continuous) — `src/ui/components/Knob.tsx`
- [ ] Slider
- [x] NumericInput — `src/ui/components/NumericInput.tsx`

### Discrete Controls

- [ ] Toggle
- [ ] Button
- [x] RadioGroup — `src/ui/components/RadioGroup.tsx`
- [ ] MultiSelectGroup
- [ ] Knob (discrete)

### Layout & Context

- [ ] Group
- [ ] Separator
- [ ] Context menu
- [ ] Export indicator

---

## Editor Metaphors (Graph UX)

See `docs/ui/editor.md` for design stubs and use cases.

### Selection

- [ ] Multi-select (shift/click) + selection model
- [ ] Marquee/box selection

### Menus & Overlays

- 🚧 ContextMenu (ad-hoc exists in `src/graph/GraphEditor.tsx`)
- [ ] Dialog/Modal primitives (confirm, wizard)
- [ ] Toast/Snackbar for transient status

### Naming

- [ ] Inline rename (node/group/patch names)

### Panels & Navigation

- [ ] Inspector/Detail panel
- [ ] Command palette
- [ ] Breadcrumbs / “inside patch” navigation (later)

### Patch UX

- [ ] Combine wizard (preview derived ports + naming conflicts)
- [ ] Patch library browser (save/instantiate definitions)

---

## Graph Components

### Primitives

- [ ] Grid — coordinate system foundation
- [ ] Curve — curve rendering with interpolation
- [ ] Waveform — audio waveform visualization
- [ ] Spectrum — FFT visualization (Canvas)
- [ ] Playhead — position indicator

### Interactions

- [ ] PointEditor — point manipulation
- [ ] CurveHandle — curve tension controls
- [ ] RegionSelector — range selection
- [ ] ZoomPan — viewport navigation

### Composed

- [x] EnvelopeEditor — `src/ui/components/EnvelopeEditor.tsx` (needs rewrite)
- [ ] SampleEditor
- [ ] ParametricEQ
- [ ] SpectrumAnalyzer

### Supporting

- [ ] useCoordinateSystem hook
- [ ] useAnimationFrame hook
- [ ] useTimebase hook
- [ ] Interpolation utilities
- [ ] Downsampling utilities

---

## Future

- [ ] Detail panel
- [ ] Polyphony/MPE visualization

---

## Implementation Notes

**When completing a component:**

1. Update this checklist
2. Add file path reference
3. Update related documentation if behavior changed

**Existing components that need work:**

- EnvelopeEditor — full rewrite planned, should compose from primitives
