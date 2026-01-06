# webaudio-playground

TW: vibe code

A node-based audio synthesizer. Make your worst sounds by connecting modular nodes: oscillators, filters, envelopes, effects, and more.

Heavily inspired by SunVox and Pure Data. Warning: may contain traces of your favorite DAW.

This project is in active development and technically hasn't even reached version 0.0.1.

## Features

- Visual node graph editor with drag-and-drop connections
- MIDI/CC routing for modulation and control
- Real-time audio metering and waveform display
- AudioWorklet + WASM support for custom DSP

## Wishful thinking

- A sequencer, maybe even several different ones
- Open Sound Control integration
- Electron app
    - file system access for project and sample management
    - VST host maybe?
    - lower level transports for OSC data

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

## Documentation

| Document | Description |
|----------|-------------|
| [docs/nodes/](docs/nodes/) | Audio node system — how to add new nodes |
| [docs/ui/](docs/ui/) | UI component library — controls, primitives, theming |
| [docs/project-format.md](docs/project-format.md) | Project `.zip` format — graph + embedded samples |
