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
	if len(args) < 8 {
		return map[string]any{"error": "expected 8 args: flatGrid, rows, cols, P, outW, outH, seed, maxRetries"}
	}

	jsArray := args[0]
	rows := args[1].Int()
	cols := args[2].Int()
	P := args[3].Int()
	outW := args[4].Int()
	outH := args[5].Int()
	seed := int64(args[6].Int())
	maxRetries := args[7].Int()

	// 1. Copia input do JS
	length := jsArray.Get("length").Int()
	flat := make([]uint8, length)
	js.CopyBytesToGo(flat, jsArray)

	// 2. Extrai padrões e constrói model
	model, err := wfc.BuildModel(flat, rows, cols, P)
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

func main() {
	fmt.Println("[Go/WASM] Module loaded successfully")

	// Exporta funções para o escopo global do JS
	js.Global().Set("extractPatterns", js.FuncOf(extractPatterns))
	js.Global().Set("generateWFC", js.FuncOf(generateWFC))

	// fmt.Println("[Go/WASM] goExtractPatterns registered")

	// Mantém o programa vivo (necessário para WASM ficar disponível)
	select {}
}
