/**
 * Neutral "chrome" colors shared across all controls.
 * These don't change with the accent theme.
 */
export interface ChromeColors {
  /** Track/groove background (e.g., knob arc track, slider track) */
  track: string;
  /** Control body fill (e.g., knob center, button background) */
  surface: string;
  /** Control body stroke/border */
  border: string;
  /** Primary text color */
  text: string;
  /** Secondary/muted text color (labels, placeholders) */
  textMuted: string;
  /** Popover/tooltip/menu background */
  popover: string;
}

/**
 * Theme object for visual customization of UI controls.
 * Components accept a theme to enable visual differentiation between nodes.
 */
export interface ControlTheme {
  /** Main accent color - arc fill, active states */
  primary: string;
  /** Supporting elements - hover states */
  secondary: string;
  /** Subtle accents - borders (optional) */
  tertiary?: string;
  /** Background fills (optional) */
  gradient?: [string, string];
}

/**
 * Derive a slightly lighter or darker variant of a color.
 * Simple approach using CSS color-mix for now.
 */
export function lighten(color: string, amount: number = 0.1): string {
  return `color-mix(in srgb, ${color}, white ${amount * 100}%)`;
}

export function darken(color: string, amount: number = 0.1): string {
  return `color-mix(in srgb, ${color}, black ${amount * 100}%)`;
}

/**
 * Default chrome colors - dark theme
 */
export const chrome: ChromeColors = {
  track: '#333',
  surface: '#2a2a3e',
  border: '#444',
  text: '#fff',
  textMuted: '#aaa',
  popover: '#1a1a2e',
};

/**
 * Default accent theme for development/testing
 */
export const defaultTheme: ControlTheme = {
  primary: '#6366f1',    // Indigo
  secondary: '#818cf8',  // Lighter indigo
  tertiary: '#4f46e5',   // Darker indigo
};
