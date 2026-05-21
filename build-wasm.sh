#!/bin/bash
# Build script for compiling Go to WebAssembly
# Output goes to public/ so Vite can serve it

set -e

echo "[build] Compiling Go -> WASM..."
cd "$(dirname "$0")/wasm"

GOOS=js GOARCH=wasm go build -o ../public/wasm/main.wasm .

echo "[build] Done! Output: public/wasm/main.wasm"
