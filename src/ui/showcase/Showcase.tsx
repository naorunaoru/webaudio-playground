import { useState } from "react";
import { Knob } from "@ui/components/Knob";
import { NumericInput } from "@ui/components/NumericInput";
import { RadioGroup } from "@ui/components/RadioGroup";
import { WithContextMenu } from "@ui/components/WithContextMenu";
import {
  Menu,
  MenuItem,
  MenuItemCheckbox,
  MenuSeparator,
  SubMenu,
  useContextMenu,
} from "@ui/components/Menu";
import { MenuBar, MenuBarItem } from "@ui/components/MenuBar";
import { ThemeProvider } from "@ui/context";
import { WaveformIcon } from "@ui/icons";
import { defaultTheme } from "@ui/types";
import type { ControlTheme, OptionDef } from "@ui/types";

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

// Demo component for context menu
function ContextMenuDemo() {
  const { contextMenuProps, menuProps } = useContextMenu();
  const [showGrid, setShowGrid] = useState(true);

  return (
    <>
      <div
        {...contextMenuProps}
        style={{
          padding: "8px 12px",
          background: "#2a2a3e",
          borderRadius: 4,
          fontSize: 11,
          cursor: "context-menu",
        }}
      >
        Right-click me
      </div>
      <Menu {...menuProps}>
        <MenuItem onClick={() => console.log("Cut")}>Cut</MenuItem>
        <MenuItem onClick={() => console.log("Copy")}>Copy</MenuItem>
        <MenuItem onClick={() => console.log("Paste")}>Paste</MenuItem>
        <MenuSeparator />
        <MenuItemCheckbox checked={showGrid} onChange={setShowGrid}>
          Show Grid
        </MenuItemCheckbox>
        <MenuSeparator />
        <SubMenu label="More Options">
          <MenuItem>Option A</MenuItem>
          <MenuItem>Option B</MenuItem>
          <SubMenu label="Even More">
            <MenuItem>Deep Option 1</MenuItem>
            <MenuItem>Deep Option 2</MenuItem>
          </SubMenu>
        </SubMenu>
        <MenuItem disabled>Disabled Item</MenuItem>
      </Menu>
    </>
  );
}

// Demo component for menu bar
function MenuBarDemo() {
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);

  return (
    <MenuBar>
      <MenuBarItem label="File" index={0}>
        <MenuItem shortcut="Ctrl+N">New</MenuItem>
        <MenuItem shortcut="Ctrl+O">Open</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Ctrl+S">Save</MenuItem>
        <SubMenu label="Export">
          <MenuItem>Export as WAV</MenuItem>
          <MenuItem>Export as MP3</MenuItem>
          <MenuItem>Export as JSON</MenuItem>
        </SubMenu>
      </MenuBarItem>
      <MenuBarItem label="Edit" index={1}>
        <MenuItem shortcut="Ctrl+Z">Undo</MenuItem>
        <MenuItem shortcut="Ctrl+Y">Redo</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Ctrl+X">Cut</MenuItem>
        <MenuItem shortcut="Ctrl+C">Copy</MenuItem>
        <MenuItem shortcut="Ctrl+V">Paste</MenuItem>
      </MenuBarItem>
      <MenuBarItem label="View" index={2}>
        <MenuItemCheckbox checked={showGrid} onChange={setShowGrid}>
          Show Grid
        </MenuItemCheckbox>
        <MenuItemCheckbox checked={snapToGrid} onChange={setSnapToGrid}>
          Snap to Grid
        </MenuItemCheckbox>
        <MenuSeparator />
        <MenuItem shortcut="Ctrl++">Zoom In</MenuItem>
        <MenuItem shortcut="Ctrl+-">Zoom Out</MenuItem>
      </MenuBarItem>
    </MenuBar>
  );
}

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
      name: "Knob (Context Menu)",
      theme: themes.indigo,
      render: () => (
        <WithContextMenu
          items={[{ label: "Reset", onClick: () => setKnobValue(0.5) }]}
        >
          <Knob
            value={knobValue}
            onChange={setKnobValue}
            min={0}
            max={1}
            label="Gain"
            indicator="arc"
          />
        </WithContextMenu>
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
    {
      name: "Context Menu",
      theme: themes.indigo,
      render: () => <ContextMenuDemo />,
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

      <h2 style={{ marginTop: 48, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
        Menu Bar
      </h2>
      <ThemeProvider theme={themes.indigo}>
        <MenuBarDemo />
      </ThemeProvider>
    </div>
  );
}
