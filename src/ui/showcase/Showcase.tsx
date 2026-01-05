import { useState } from "react";
import { Knob } from "../components/Knob";
import { NumericInput } from "../components/NumericInput";
import { RadioGroup } from "../components/RadioGroup";
import { ThemeProvider } from "../context";
import { WaveformIcon } from "../icons";
import { defaultTheme } from "../types";
import type { ControlTheme, OptionDef } from "../types";

// Different themes to showcase
const themes: Record<string, ControlTheme> = {
  indigo: defaultTheme,
  emerald: {
    primary: "#10b981",
    secondary: "#34d399",
    tertiary: "#059669",
  },
  amber: {
    primary: "#f59e0b",
    secondary: "#fbbf24",
    tertiary: "#d97706",
  },
  rose: {
    primary: "#f43f5e",
    secondary: "#fb7185",
    tertiary: "#e11d48",
  },
};

interface ComponentDemo {
  name: string;
  theme: ControlTheme;
  render: () => JSX.Element;
}

// Waveform options for RadioGroup demo
const waveformOptions: OptionDef<string>[] = [
  { value: "sine", content: <WaveformIcon type="sine" />, ariaLabel: "Sine wave" },
  { value: "triangle", content: <WaveformIcon type="triangle" />, ariaLabel: "Triangle wave" },
  { value: "square", content: <WaveformIcon type="square" />, ariaLabel: "Square wave" },
  { value: "sawtooth", content: <WaveformIcon type="sawtooth" />, ariaLabel: "Sawtooth wave" },
  { value: "noise", content: <WaveformIcon type="noise" />, ariaLabel: "Noise" },
];

// Text options for RadioGroup demo
const curveOptions: OptionDef<string>[] = [
  { value: "lin", content: "Lin" },
  { value: "exp", content: "Exp" },
];

export function Showcase() {
  const [knobValue, setKnobValue] = useState(0.5);
  const [frequency, setFrequency] = useState(440);
  const [waveform, setWaveform] = useState("sawtooth");
  const [curve, setCurve] = useState("exp");

  const demos: ComponentDemo[] = [
    {
      name: "Knob (Arc)",
      theme: themes.indigo,
      render: () => (
        <Knob
          value={knobValue}
          onChange={setKnobValue}
          min={0}
          max={1}
          label="Freq"
          indicator="arc"
        />
      ),
    },
    {
      name: "Knob (Bipolar)",
      theme: themes.emerald,
      render: () => (
        <Knob
          value={knobValue * 2 - 1}
          onChange={(v) => setKnobValue((v + 1) / 2)}
          min={-1}
          max={1}
          label="Pan"
          indicator="bipolar"
        />
      ),
    },
    {
      name: "Knob (Pointer)",
      theme: themes.amber,
      render: () => (
        <Knob
          value={knobValue}
          onChange={setKnobValue}
          min={0}
          max={1}
          label="Level"
          indicator="pointer"
        />
      ),
    },
    {
      name: "Knob (Disabled)",
      theme: themes.rose,
      render: () => (
        <Knob
          value={0.3}
          onChange={() => {}}
          min={0}
          max={1}
          label="Locked"
          disabled
        />
      ),
    },
    {
      name: "NumericInput",
      theme: themes.indigo,
      render: () => (
        <NumericInput
          value={frequency}
          onChange={setFrequency}
          min={20}
          max={20000}
          step={1}
          label="Freq"
          unit="Hz"
          format={(v) => v.toFixed(0)}
        />
      ),
    },
    {
      name: "NumericInput (Fine)",
      theme: themes.emerald,
      render: () => (
        <NumericInput
          value={knobValue}
          onChange={setKnobValue}
          min={0}
          max={1}
          step={0.01}
          label="Gain"
        />
      ),
    },
    {
      name: "NumericInput (Disabled)",
      theme: themes.rose,
      render: () => (
        <NumericInput
          value={100}
          onChange={() => {}}
          min={0}
          max={1000}
          label="Fixed"
          unit="ms"
          format={(v) => v.toFixed(0)}
          disabled
        />
      ),
    },
    {
      name: "RadioGroup (Icons)",
      theme: themes.indigo,
      render: () => (
        <RadioGroup
          value={waveform}
          onChange={setWaveform}
          options={waveformOptions}
          label="Osc"
        />
      ),
    },
    {
      name: "RadioGroup (Vertical)",
      theme: themes.indigo,
      render: () => (
        <RadioGroup
          value={curve}
          onChange={setCurve}
          options={curveOptions}
          orientation="vertical"
          label="Curve"
        />
      ),
    },
    {
      name: "RadioGroup (Text)",
      theme: themes.emerald,
      render: () => (
        <RadioGroup
          value={curve}
          onChange={setCurve}
          options={curveOptions}
          label="Curve"
        />
      ),
    },
    {
      name: "RadioGroup (Disabled)",
      theme: themes.rose,
      render: () => (
        <RadioGroup
          value="sine"
          onChange={() => {}}
          options={waveformOptions}
          label="Locked"
          disabled
        />
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 24, fontWeight: 600 }}>
        UI Component Showcase
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 120px)",
          gap: 16,
        }}
      >
        {demos.map((demo) => (
          <ThemeProvider key={demo.name} theme={demo.theme}>
            <div
              style={{
                width: 120,
                height: 120,
                background: "#16162a",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                {demo.render()}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#888",
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {demo.name}
              </div>
            </div>
          </ThemeProvider>
        ))}
      </div>
    </div>
  );
}
