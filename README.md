# webaudio-playground

*TW: vibe code*

This is a node-based audio synth for the browser.

Data flows across three domains: MIDI, CV/gate, and audio.

## Features

- MIDI event streaming through MIDI player node
- MIDI to CV boundary node which outputs synth-friendly pitch in V/oct, gate/trigger, and CV
- Polyphony: each cable represents a set of voices, which can be independently held by downstream consumers
- A set of nodes enough to build frequency, phase, and ring modulation synthesis: VCO, VCA, LFO, Ratio, Filter, others
- An Envelope node with arbitrary number of phases and support for sustain/loop
- A Soundfont player using [js-synthesizer](https://github.com/jet2jet/js-synthesizer) (FluidSynth Emscripten build)
- Convolutional reverb, delay, and limiter nodes; the latter is built with Rust (because why not)
- Export/import in a simple .zip containing serialized project data and assets

The project is in active development and technically hasn't even reached version 0.0.1.

## Dev

```sh
npm install
npm run dev
```

### Rust Toolchain (for WASM nodes)

Some nodes (like the limiter) use WebAssembly compiled from Rust. To build these:

1. Install Rust via [rustup](https://rustup.rs/);

2. Add the WASM target:

   ```sh
   rustup target add wasm32-unknown-unknown
   ```

3. Install wasm-pack:

   ```sh
   cargo install wasm-pack
   ```

WASM builds run automatically before `npm run dev` and `npm run build`. To skip them during UI-only development:

```sh
SKIP_WASM=1 npm run dev
```

## Typecheck / Build

```sh
npm run typecheck
npm run build
```
