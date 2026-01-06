# WebAssembly Builds

Nodes can use WebAssembly for high-performance DSP. WASM builds are self-contained within each node folder.

## Overview

The build system:
1. Scans `src/nodes/*/` for `build-wasm.sh` or `build-wasm.mjs` scripts
2. Executes each script to compile WASM
3. Outputs `.wasm` files alongside the source

## Setting Up a WASM Node

### Folder Structure

```
src/nodes/<yourNode>/
├── types.ts
├── graph.tsx
├── audio.ts
├── index.ts
├── processor.ts          # AudioWorkletProcessor
├── build-wasm.mjs        # Build script
├── src/                  # Rust/C source
│   └── lib.rs
└── yourNode.wasm         # Build output
```

### Build Script

Create `build-wasm.mjs` (Node.js) or `build-wasm.sh` (shell):

```js
// src/nodes/limiter/build-wasm.mjs
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

execSync(
  `wasm-pack build --target web --out-dir ${join(__dirname, "wasm")} ${join(__dirname, "src")}`,
  { stdio: "inherit" }
);
```

### Running Builds

```bash
# Build all WASM modules
npm run build-wasm

# Skip WASM builds (for UI-only development)
SKIP_WASM=1 npm run dev
```

WASM builds run automatically before `npm run dev` and `npm run build` via `predev`/`prebuild` scripts.

## AudioWorklet + WASM Integration

### Processor File

The AudioWorkletProcessor loads and uses the WASM module:

```ts
// src/nodes/limiter/processor.ts
import init, { LimiterProcessor } from "./wasm/limiter";

class LimiterWorkletProcessor extends AudioWorkletProcessor {
  private processor: LimiterProcessor | null = null;
  private initialized = false;

  constructor() {
    super();
    this.init();
  }

  async init() {
    await init();  // Initialize WASM
    this.processor = new LimiterProcessor(sampleRate);
    this.initialized = true;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.initialized || !this.processor) return true;

    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0 && output.length > 0) {
      this.processor.process(input[0], output[0]);
    }

    return true;
  }
}

registerProcessor("limiter-processor", LimiterWorkletProcessor);
```

### Loading in Audio Runtime

```ts
// src/nodes/limiter/audio.ts
function createLimiterRuntime(ctx: AudioContext): AudioNodeInstance<LimiterNode> {
  const workletNode = new AudioWorkletNode(ctx, "limiter-processor");

  return {
    type: "limiter",

    updateState: (state) => {
      workletNode.port.postMessage({
        type: "params",
        ceiling: state.ceilingDb,
        release: state.releaseMs,
        // ...
      });
    },

    getAudioInput: (portId) => portId === "audio_in" ? workletNode : null,
    getAudioOutput: (portId) => portId === "audio_out" ? workletNode : null,

    onRemove: () => workletNode.disconnect(),
  };
}
```

### Registering Worklet Modules

Include the processor URL in your module:

```ts
// src/nodes/limiter/index.ts
import processorUrl from "./processor.ts?url";

export const limiterNode: NodeModule<any> = {
  type: "limiter",
  graph: limiterGraph,
  audioFactory: limiterAudioFactory,
  workletModules: [processorUrl],
};
```

The audio engine collects all `workletModules` and preloads them before starting audio.

## Rust Example

### Cargo.toml

```toml
[package]
name = "limiter"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = 3
lto = true
```

### Rust Source

```rust
// src/nodes/limiter/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct LimiterProcessor {
    sample_rate: f32,
    ceiling: f32,
    envelope: f32,
}

#[wasm_bindgen]
impl LimiterProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            ceiling: 1.0,
            envelope: 0.0,
        }
    }

    pub fn set_ceiling(&mut self, db: f32) {
        self.ceiling = 10.0_f32.powf(db / 20.0);
    }

    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        for (i, sample) in input.iter().enumerate() {
            // Simple limiter logic
            let abs = sample.abs();
            if abs > self.envelope {
                self.envelope = abs;
            } else {
                self.envelope *= 0.9999;  // Release
            }

            let gain = if self.envelope > self.ceiling {
                self.ceiling / self.envelope
            } else {
                1.0
            };

            output[i] = sample * gain;
        }
    }
}
```

## Performance Tips

1. **Minimize allocations**: Pre-allocate buffers in the constructor
2. **Use `#[inline]`**: For hot paths in Rust
3. **Batch operations**: Process full buffers, not sample-by-sample when possible
4. **Avoid branching**: Use branchless algorithms where performance-critical

## Debugging

1. **Console logging**: Use `web_sys::console::log_1` in Rust (requires `web-sys` dependency)
2. **Check WASM size**: Large modules slow down loading
3. **Profile in browser**: Use Chrome DevTools Performance tab
