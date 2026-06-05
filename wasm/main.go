package main

import (
	"fmt"
	"syscall/js"

	"Wave_Overlap_Wasm/wfc"
)

// extractPatternsJS é a bridge JS → Go para extração de padrões.
//
// Chamada no JS:
//
//	goExtractPatterns(flatGrid: Uint8Array, rows: number, cols: number, patternSize: number) → string (JSON)
//
// Retorna JSON com padrões, frequências e adjacências, ou um objeto { error: "..." }.
func extractPatterns(this js.Value, args []js.Value) any {
	if len(args) < 4 {
		return map[string]any{"error": "expected 4 arguments: flatGrid (Uint8Array), rows, cols, patternSize"}
	}

	jsArray := args[0]
	rows := args[1].Int()
	cols := args[2].Int()
	P := args[3].Int()

	// Copia o Uint8Array do JS para um slice Go
	length := jsArray.Get("length").Int()
	flat := make([]uint8, length)
	js.CopyBytesToGo(flat, jsArray)

	result, err := wfc.ExtractPatternsToJSON(flat, rows, cols, P)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	return result
}

// generateWFC é a bridge JS → Go para a geração completa.
//
// Chamada no JS:
//
//	generateWFC(flatGrid: Uint8Array, rows, cols, patternSize, outW, outH, seed) → Uint8Array | { error: string }
func generateWFC(this js.Value, args []js.Value) any {
	if len(args) < 9 {
		return map[string]any{"error": "expected 8 args: flatGrid, rows, cols, P, outW, outH, seed, maxRetries, symmetry"}
	}

	jsArray := args[0]
	rows := args[1].Int()
	cols := args[2].Int()
	P := args[3].Int()
	outW := args[4].Int()
	outH := args[5].Int()
	seed := int64(args[6].Int())
	maxRetries := args[7].Int()
	symmetry := args[8].Bool()

	// 1. Copia input do JS
	length := jsArray.Get("length").Int()
	flat := make([]uint8, length)
	js.CopyBytesToGo(flat, jsArray)

	// 2. Extrai padrões e constrói model
	model, err := wfc.BuildModel(flat, rows, cols, P, symmetry)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	// 3. Cria solver e executa
	solver := wfc.NewSolver(model, outW, outH, seed)
	output, err := solver.Solve(maxRetries)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	// 4. Copia output para JS como Uint8Array
	jsOutput := js.Global().Get("Uint8Array").New(len(output))
	js.CopyBytesToJS(jsOutput, output)

	return jsOutput
}

// generateWFCLive é a versão com preview em tempo real via SharedArrayBuffer.
//
// Chamada no JS:
//
//	generateWFCLive(flatGrid, rows, cols, P, outW, outH, seed, maxRetries, sabView) → { status: string } | { error: string }
//
// sabView é um Uint8Array backed by SharedArrayBuffer. O Go escreve
// snapshots diretamente nele a cada step do solver.
func generateWFCLive(this js.Value, args []js.Value) any {

	if len(args) < 10 {
		return map[string]any{"error": "expected 9 args: flatGrid, rows, cols, P, outW, outH, seed, maxRetries, symmetry, sabView"}
	}

	jsArray := args[0]
	rows := args[1].Int()
	cols := args[2].Int()
	P := args[3].Int()
	outW := args[4].Int()
	outH := args[5].Int()
	seed := int64(args[6].Int())
	maxRetries := args[7].Int()
	symmetry := args[8].Bool()
	sabView := args[9] // Uint8Array sobre SharedArrayBuffer

	// 1. Copia input
	length := jsArray.Get("length").Int()
	flat := make([]uint8, length)
	js.CopyBytesToGo(flat, jsArray)

	// 2. Build model
	model, err := wfc.BuildModel(flat, rows, cols, P, symmetry)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	// 3. Buffer Go para snapshot (reutilizado a cada step)
	snapshot := make([]uint8, outW*outH)

	// 4. Solve com retries e snapshots
	solver := wfc.NewSolver(model, outW, outH, seed)

	for attempt := 0; attempt <= maxRetries; attempt++ {

		if attempt > 0 {
			fmt.Printf("[WFC] Attempt %d/%d — contradiction, retrying...\n", attempt+1, maxRetries+1)
			solver.Reset(seed + int64(attempt))
		}

		for {
			status := solver.Step()

			switch status {

			case wfc.StepDone:
				// Snapshot final
				solver.Snapshot(snapshot)
				js.CopyBytesToJS(sabView, snapshot)
				return map[string]any{"status": "done"}

			case wfc.StepContradiction:
				goto nextAttempt

			case wfc.StepContinue:
				// Escreve snapshot no SAB
				solver.Snapshot(snapshot)
				js.CopyBytesToJS(sabView, snapshot)
			}

		}

	nextAttempt:
	}

	return map[string]any{"error": fmt.Sprintf("wfc: failed after %d attempts", maxRetries+1)}
}

func main() {
	fmt.Println("[Go/WASM] Module loaded successfully")

	// Exporta funções para o escopo global do JS
	js.Global().Set("extractPatterns", js.FuncOf(extractPatterns))
	js.Global().Set("generateWFC", js.FuncOf(generateWFC))
	js.Global().Set("generateWFCLive", js.FuncOf(generateWFCLive))

	// fmt.Println("[Go/WASM] goExtractPatterns registered")

	// Mantém o programa vivo (necessário para WASM ficar disponível)
	select {}
}
