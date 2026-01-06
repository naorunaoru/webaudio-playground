# Composed Components

These are the high-level components built from primitives.

## EnvelopeEditor

**Composition:**

- Grid (time vs value)
- Curve (envelope shape)
- PointEditor (add/move/delete envelope stages)
- CurveHandle (adjust curve between stages)
- Playhead (current envelope position)
- ZoomPan (for complex envelopes)

**Specific Features:**

- Sustain point designation (stops progression until note-off)
- Musical time base option (bars/beats instead of milliseconds)
- Preset shapes (ADSR, AR, custom)

**Example:**

```typescript
function EnvelopeEditor({
  initialPoints,
  tempo,
  onEnvelopeChange
}: EnvelopeEditorProps) {
  const [points, setPoints] = useState(initialPoints);
  const [timeBase, setTimeBase] = useState<TimeBase>({
    type: 'absolute',
    unit: 'ms'
  });

  const { chrome, theme } = useTheme();

  const gridConfig: GridConfig = {
    xAxis: {
      scale: 'linear',
      domain: [0, 2000],
      timeBase,
      label: timeBase.type === 'musical' ? 'Time (beats)' : 'Time (ms)'
    },
    yAxis: {
      scale: 'linear',
      domain: [0, 1],
      label: 'Value'
    },
    width: 600,
    height: 300,
    chrome,
    theme
  };

  return (
    <div className="envelope-editor">
      <div className="toolbar">
        <button onClick={() => toggleTimeBase()}>
          {timeBase.type === 'musical' ? '♪ Bars/Beats' : '⏱ Time'}
        </button>
        <button onClick={() => resetToADSR()}>ADSR Preset</button>
      </div>

      <Grid config={gridConfig}>
        <ZoomPan />
        <Curve
          points={points}
          interpolation="exponential"
        />
        <PointEditor
          points={points}
          onPointsChange={setPoints}
          snapToGrid={true}
        />
        <CurveHandle points={points} />
        <Playhead position={currentTime} />
      </Grid>
    </div>
  );
}
```

---

## SamplePlayer

**Composition:**

- Grid (sample position vs amplitude)
- Waveform (audio sample visualization)
- RegionSelector (loop points, selection)
- Playhead (current play position)
- ZoomPan (essential for long samples)

**Specific Features:**

- Loop point markers (draggable)
- Multi-channel display (stereo, surround)
- Waveform editing (cut, paste, normalize)
- Sample-accurate positioning

**Example:**

```typescript
function SamplePlayer({
  audioBuffer,
  onRegionChange
}: SamplePlayerProps) {
  const [loopRegion, setLoopRegion] = useState<Region | null>(null);
  const [playPosition, setPlayPosition] = useState(0);

  const { chrome, theme } = useTheme();

  const waveformData = useMemo(() => ({
    sampleRate: audioBuffer.sampleRate,
    channels: [
      audioBuffer.getChannelData(0),
      audioBuffer.getChannelData(1)
    ],
    duration: audioBuffer.duration
  }), [audioBuffer]);

  const gridConfig: GridConfig = {
    xAxis: {
      scale: 'linear',
      domain: [0, audioBuffer.duration],
      label: 'Time (s)'
    },
    yAxis: {
      scale: 'linear',
      domain: [-1, 1],
      label: 'Amplitude'
    },
    width: 800,
    height: 200,
    chrome,
    theme
  };

  return (
    <div className="sample-player">
      <Grid config={gridConfig}>
        <ZoomPan />
        <Waveform
          data={waveformData}
          style="filled"
          channels={[0, 1]}
        />
        <RegionSelector
          onRegionChange={setLoopRegion}
          initialRegion={loopRegion}
        />
        <Playhead
          position={playPosition}
          interactive={true}
          onPositionChange={setPlayPosition}
        />
      </Grid>

      <div className="transport-controls">
        <button onClick={play}>▶ Play</button>
        <button onClick={pause}>⏸ Pause</button>
        <button onClick={stop}>⏹ Stop</button>
        {loopRegion && (
          <button onClick={() => setLoopRegion(null)}>✕ Clear Loop</button>
        )}
      </div>
    </div>
  );
}
```

---

## ParametricEQ

**Composition:**

- Grid (frequency vs gain, logarithmic frequency scale)
- Spectrum (input spectrum, translucent)
- Spectrum (output spectrum, translucent)
- Curve (EQ frequency response)
- PointEditor (add/move filter bands)
- CurveHandle (adjust Q factor per band)

**Specific Features:**

- Multiple visualization modes:
  - Overlay: Both input/output spectrums visible
  - Difference: Shows gain/cut at each frequency
- Standard filter types per band (lowpass, highpass, peaking, notch)
- Real-time spectrum analysis
- Logarithmic frequency scale (20Hz - 20kHz)
- dB scale for amplitude

**Example:**

```typescript
function ParametricEQ({
  audioContext,
  inputNode,
  onFilterChange
}: ParametricEQProps) {
  const [filterBands, setFilterBands] = useState<FilterBand[]>([]);
  const [vizMode, setVizMode] = useState<'overlay' | 'difference'>('overlay');
  const [inputSpectrum, setInputSpectrum] = useState<SpectrumData | null>(null);
  const [outputSpectrum, setOutputSpectrum] = useState<SpectrumData | null>(null);

  const { chrome, theme } = useTheme();

  const gridConfig: GridConfig = {
    xAxis: {
      scale: 'logarithmic',  // Critical for frequency domain
      domain: [20, 20000],
      label: 'Frequency (Hz)'
    },
    yAxis: {
      scale: 'db',
      domain: vizMode === 'difference' ? [-40, 40] : [-60, 20],
      label: vizMode === 'difference' ? 'Gain/Cut (dB)' : 'Magnitude (dB)'
    },
    width: 800,
    height: 400,
    chrome,
    theme
  };

  // Real-time spectrum analysis
  useAnimationFrame(() => {
    setInputSpectrum(analyzeSpectrum(inputNode));
    setOutputSpectrum(analyzeSpectrum(outputNode));
  });

  return (
    <div className="parametric-eq">
      <div className="toolbar">
        <button onClick={() => setVizMode('overlay')}>
          Overlay
        </button>
        <button onClick={() => setVizMode('difference')}>
          Difference
        </button>
      </div>

      <Grid config={gridConfig}>
        {vizMode === 'overlay' ? (
          <>
            <Spectrum
              data={inputSpectrum}
              opacity={0.5}
            />
            <Spectrum
              data={outputSpectrum}
              opacity={0.5}
            />
          </>
        ) : (
          <Spectrum
            data={computeSpectrumDifference(inputSpectrum, outputSpectrum)}
            style="filled"
          />
        )}

        <Curve
          points={filterBandsToPoints(filterBands)}
          interpolation="smooth"
        />

        <PointEditor
          points={filterBandsToPoints(filterBands)}
          onPointsChange={(pts) => setFilterBands(pointsToFilterBands(pts))}
        />

        {filterBands.map((band, i) => (
          <CurveHandle
            key={i}
            segment={getFilterBandSegment(band)}
            segmentIndex={i}
            onTensionChange={(_, q) => updateBandQ(i, q)}
          />
        ))}
      </Grid>

      <div className="filter-bands">
        {filterBands.map((band, i) => (
          <FilterBandControl
            key={i}
            band={band}
            onBandChange={(updated) => updateBand(i, updated)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## SpectrumAnalyzer

**Composition:**

- Grid (frequency vs magnitude)
- Spectrum (FFT visualization)
- Optional Playhead (for scrolling time-based display)

**Specific Features:**

- Real-time FFT updates
- Peak hold display
- Averaging/smoothing controls
- Multiple color schemes
- Optional scrolling waterfall display

**Example:**

```typescript
function SpectrumAnalyzer({
  audioContext,
  sourceNode
}: SpectrumAnalyzerProps) {
  const [spectrumData, setSpectrumData] = useState<SpectrumData | null>(null);
  const [smoothing, setSmoothing] = useState(0.8);
  const [peakHold, setPeakHold] = useState(true);

  const { chrome, theme } = useTheme();

  const analyser = useMemo(() => {
    const node = audioContext.createAnalyser();
    node.fftSize = 2048;
    node.smoothingTimeConstant = smoothing;
    sourceNode.connect(node);
    return node;
  }, [audioContext, sourceNode]);

  const gridConfig: GridConfig = {
    xAxis: {
      scale: 'logarithmic',
      domain: [20, 20000],
      label: 'Frequency (Hz)'
    },
    yAxis: {
      scale: 'db',
      domain: [-90, 0],
      label: 'Magnitude (dB)'
    },
    width: 800,
    height: 400,
    chrome,
    theme
  };

  useAnimationFrame(() => {
    const frequencies = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(frequencies);

    setSpectrumData({
      frequencies: getFrequencyArray(analyser),
      magnitudes: frequencies,
      sampleRate: audioContext.sampleRate
    });
  });

  return (
    <div className="spectrum-analyzer">
      <div className="controls">
        <label>
          Smoothing
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={smoothing}
            onChange={(e) => {
              setSmoothing(parseFloat(e.target.value));
              analyser.smoothingTimeConstant = parseFloat(e.target.value);
            }}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={peakHold}
            onChange={(e) => setPeakHold(e.target.checked)}
          />
          Peak Hold
        </label>
      </div>

      <Grid config={gridConfig}>
        <Spectrum
          data={spectrumData}
          style="bars"
          smoothing={smoothing}
          peakHold={peakHold}
        />
      </Grid>
    </div>
  );
}
```
