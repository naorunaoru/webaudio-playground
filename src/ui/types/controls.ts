import type { ReactNode } from 'react';

/**
 * Continuous controls share this value shape.
 * Used by Knob, Slider, NumericInput.
 */
export interface ContinuousControlProps<T = number> {
  value: T;
  onChange: (value: T) => void;
  min: T;
  max: T;
  step?: T;
  fineStep?: T;
  scale?: 'linear' | 'log';
  detents?: T[];
  detentStrength?: number;
}

/**
 * Option definition shared by all discrete controls.
 */
export interface OptionDef<T = string | number> {
  value: T;
  /** Icon, label, or any React node */
  content: ReactNode;
  /** Accessibility label - required if content isn't text */
  ariaLabel?: string;
}

/**
 * Single selection (RadioGroup, DiscreteKnob).
 */
export interface SingleSelectProps<T = string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Array<OptionDef<T>>;
}

/**
 * Multiple selection (MultiSelectGroup).
 */
export interface MultiSelectProps<T = string | number> {
  value: T[];
  onChange: (value: T[]) => void;
  options: Array<OptionDef<T>>;
  min?: number;
  max?: number;
}

/**
 * Context menu action types.
 */
export type ContextMenuAction =
  | { type: 'toggleExport' }
  | { type: 'resetDefault' };

/**
 * Common props all controls share.
 */
export interface BaseControlProps {
  label?: string;
  disabled?: boolean;
  /** Shows indicator dot when exported for CC */
  exported?: boolean;
  onContextMenu?: (action: ContextMenuAction) => void;
}
