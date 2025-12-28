#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DSP_DIR="$ROOT_DIR/dsp"
OUT_WASM="$ROOT_DIR/limiter.wasm"

TARGET="wasm32-unknown-unknown"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found" >&2
  exit 1
fi

echo "Building limiter DSP (Rust -> WASM)..."

# Prefer rustup-managed toolchains so `rustup target add wasm32-unknown-unknown` works as expected
# even if Homebrew's `cargo/rustc` appear earlier in PATH.
if command -v rustup >/dev/null 2>&1; then
  TOOLCHAIN="${RUSTUP_TOOLCHAIN:-stable}"
  CARGO_BIN="$(rustup which cargo --toolchain "$TOOLCHAIN")"
  RUSTC_BIN="$(rustup which rustc --toolchain "$TOOLCHAIN")"
  TOOLCHAIN_BIN_DIR="$(dirname -- "$RUSTC_BIN")"
  (cd "$DSP_DIR" && PATH="$TOOLCHAIN_BIN_DIR:$PATH" RUSTC="$RUSTC_BIN" "$CARGO_BIN" build --release --target "$TARGET")
else
  (cd "$DSP_DIR" && cargo build --release --target "$TARGET")
fi

WASM_PATH="$DSP_DIR/target/$TARGET/release/webaudio_playground_limiter.wasm"
if [[ ! -f "$WASM_PATH" ]]; then
  echo "WASM output not found at: $WASM_PATH" >&2
  exit 1
fi

cp -f "$WASM_PATH" "$OUT_WASM"
echo "Wrote $OUT_WASM"
