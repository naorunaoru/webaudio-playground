import type {
  AudioGraphContext,
  ContextSubscriber,
  EventSubscriber,
} from "./AudioGraphContext";
import type { AudioGraphContextValues, AudioGraphEvent } from "./types";

export class AudioGraphContextImpl implements AudioGraphContext {
  private values: AudioGraphContextValues;
  private parent: AudioGraphContext | null;
  private valueSubscribers = new Map<string, Set<ContextSubscriber<unknown>>>();
  private eventSubscribers = new Set<EventSubscriber>();
  private children = new Set<AudioGraphContextImpl>();

  constructor(
    initial: AudioGraphContextValues,
    parent: AudioGraphContext | null = null
  ) {
    this.values = Object.freeze({ ...initial });
    this.parent = parent;
  }

  getValues(): AudioGraphContextValues {
    return this.values;
  }

  subscribe<K extends keyof AudioGraphContextValues>(
    key: K,
    fn: ContextSubscriber<AudioGraphContextValues[K]>
  ): () => void {
    let subs = this.valueSubscribers.get(key);
    if (!subs) {
      subs = new Set();
      this.valueSubscribers.set(key, subs);
    }
    subs.add(fn as ContextSubscriber<unknown>);

    // Immediately invoke with current value
    fn(this.values[key]);

    return () => subs!.delete(fn as ContextSubscriber<unknown>);
  }

  onEvent(fn: EventSubscriber): () => void {
    this.eventSubscribers.add(fn);
    return () => this.eventSubscribers.delete(fn);
  }

  /** Update a value and notify subscribers */
  setValue<K extends keyof AudioGraphContextValues>(
    key: K,
    value: AudioGraphContextValues[K]
  ): void {
    if (this.values[key] === value) return;

    this.values = Object.freeze({ ...this.values, [key]: value });

    // Notify local subscribers
    const subs = this.valueSubscribers.get(key);
    if (subs) {
      for (const fn of subs) {
        try {
          fn(value);
        } catch (e) {
          console.error("Context subscriber error:", e);
        }
      }
    }

    // Propagate to children
    for (const child of this.children) {
      child.handleParentValueChange(key, value);
    }
  }

  /** Emit an event to all subscribers and children */
  emit(event: AudioGraphEvent): void {
    for (const fn of this.eventSubscribers) {
      try {
        fn(event);
      } catch (e) {
        console.error("Context event subscriber error:", e);
      }
    }

    // Also update the corresponding value if applicable
    switch (event.type) {
      case "tempoChange":
        this.setValue("tempo", event.tempo);
        break;
      case "a4Change":
        this.setValue("a4Hz", event.a4Hz);
        break;
      case "timeSignatureChange":
        this.setValue("timeSignature", event.timeSignature);
        break;
    }

    // Propagate event down to children
    for (const child of this.children) {
      child.emit(event);
    }
  }

  createChild(
    overrides?: Partial<AudioGraphContextValues>
  ): AudioGraphContextImpl {
    const childValues = { ...this.values, ...overrides };
    const child = new AudioGraphContextImpl(childValues, this);
    this.children.add(child);
    return child;
  }

  getParent(): AudioGraphContext | null {
    return this.parent;
  }

  /** Called when parent value changes */
  private handleParentValueChange<K extends keyof AudioGraphContextValues>(
    key: K,
    value: AudioGraphContextValues[K]
  ): void {
    // Propagate parent changes to this context
    // Future: could track local overrides and skip propagation if overridden
    this.setValue(key, value);
  }

  /** Remove a child context */
  removeChild(child: AudioGraphContextImpl): void {
    this.children.delete(child);
  }

  /** Cleanup when this context is no longer needed */
  dispose(): void {
    // Remove from parent's children set
    if (this.parent instanceof AudioGraphContextImpl) {
      this.parent.removeChild(this);
    }

    // Dispose all children
    for (const child of this.children) {
      child.dispose();
    }

    this.valueSubscribers.clear();
    this.eventSubscribers.clear();
    this.children.clear();
  }
}
