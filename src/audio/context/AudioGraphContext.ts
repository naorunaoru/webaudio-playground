import type { AudioGraphContextValues, AudioGraphEvent } from "./types";

export type ContextSubscriber<T> = (value: T) => void;
export type EventSubscriber = (event: AudioGraphEvent) => void;

export interface AudioGraphContext {
  /** Get current context values (snapshot) */
  getValues(): AudioGraphContextValues;

  /** Subscribe to specific value changes. Callback is invoked immediately with current value. */
  subscribe<K extends keyof AudioGraphContextValues>(
    key: K,
    fn: ContextSubscriber<AudioGraphContextValues[K]>
  ): () => void;

  /** Subscribe to all events */
  onEvent(fn: EventSubscriber): () => void;

  /** Create a child context for nested graphs (inherits parent values) */
  createChild(overrides?: Partial<AudioGraphContextValues>): AudioGraphContext;

  /** Get parent context (null for root) */
  getParent(): AudioGraphContext | null;
}
