import { DEFAULT_CONTEXT_VALUES } from "@audio/context";
import { useGraphDoc } from "@state";
import { Button } from "@ui/components/Button";
import { NumericInput } from "@ui/components/NumericInput";
import styles from "./ContextToolbar.module.css";

export function ContextToolbar() {
  const { uiState, setContextState, audioState, onAudioToggle } = useGraphDoc();

  // Read values from persisted state, falling back to defaults
  const persisted = uiState.context;
  const tempo = persisted?.tempo ?? DEFAULT_CONTEXT_VALUES.tempo;
  const a4Hz = persisted?.a4Hz ?? DEFAULT_CONTEXT_VALUES.a4Hz;
  const timeSignature =
    persisted?.timeSignature ?? DEFAULT_CONTEXT_VALUES.timeSignature;

  const handleTempoChange = (newTempo: number) => {
    setContextState({ tempo: newTempo });
  };

  const handleA4Change = (newA4Hz: number) => {
    setContextState({ a4Hz: newA4Hz });
  };

  const handleBeatsPerBarChange = (beatsPerBar: number) => {
    setContextState({ timeSignature: [beatsPerBar, timeSignature[1]] });
  };

  const handleBeatUnitChange = (beatUnit: number) => {
    setContextState({ timeSignature: [timeSignature[0], beatUnit] });
  };

  const isRunning = audioState === "running";

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <NumericInput
          value={tempo}
          onChange={handleTempoChange}
          min={20}
          max={300}
          step={1}
          format={(v) => v.toFixed(0)}
          label="BPM"
          labelPosition="right"
          width={44}
        />
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <NumericInput
          value={timeSignature[0]}
          onChange={handleBeatsPerBarChange}
          min={1}
          max={16}
          step={1}
          format={(v) => v.toFixed(0)}
          width={28}
        />
        <span className={styles.timeSigSlash}>/</span>
        <NumericInput
          value={timeSignature[1]}
          onChange={handleBeatUnitChange}
          min={1}
          max={16}
          step={1}
          format={(v) => v.toFixed(0)}
          width={28}
        />
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <NumericInput
          value={a4Hz}
          onChange={handleA4Change}
          min={400}
          max={480}
          step={1}
          format={(v) => v.toFixed(0)}
          label="A4"
          labelPosition="left"
          unit="Hz"
          width={56}
        />
      </div>

      <div className={styles.separator} />

      <Button
        className={styles.audioToggle}
        data-audio-toggle
        aria-pressed={isRunning}
        onClick={onAudioToggle}
        title={isRunning ? "Suspend Audio" : "Start Audio"}
      >
        {isRunning ? "Running" : "Suspended"}
      </Button>
    </div>
  );
}
