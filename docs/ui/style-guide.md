# Visual Style Guide

## Design Goals

- **Declarative**: Node UIs described as component trees with standard CSS grid/flex layout
- **Cohesive visual style**: Soft UI aesthetic — subtle shadows, gentle gradients, not flat but not skeuomorphic
- **Themeable**: Color schemes per component/node for visual distinction
- **Consistent interaction patterns**: Shared behaviors across similar controls
- **Compact**: Optimized for dense node graph UIs

## General Aesthetic

- Soft shadows (subtle, slightly blurred)
- Gentle gradients (not harsh, 2-3% variation)
- Rounded corners on containers
- Neutral grays for control bodies
- Theme colors for active/accent elements

## States

| State | Appearance |
|-------|------------|
| Default | Base appearance |
| Hover | Slight brightening, enhanced shadow |
| Active/dragging | Stronger accent, possible glow |
| Focused | Visible focus ring for keyboard nav |
| Disabled | Reduced opacity, no interactions |

## Export Indicator

When a control is exported (CC input exposed), a small dot appears in the corner of the grid cell using the theme accent color. The dot may pulse or glow when MIDI data is actively received.

```
┌─────────┐
│       ● │  ← export indicator
│  ╭───╮  │
│  │   │  │
│  ╰───╯  │
│  Freq   │
└─────────┘
```

## Tooltips

- Shows formatted value on hover
- Also visible during drag, positioned to not obscure control
- Falls back to ariaLabel for discrete options

## Accessibility

- All controls keyboard navigable
- ARIA roles and labels
- Screen reader announcements for value changes
- Sufficient color contrast
- Focus indicators
