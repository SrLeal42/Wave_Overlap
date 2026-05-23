package main

import (
	"fmt"
	"syscall/js"

	"Wave_Overlap_Wasm/wfc"
)

// ping é uma função de teste exposta para o JavaScript.
// Recebe uma string e retorna uma saudação.
func ping(this js.Value, args []js.Value) any {
	name := "WASM"
	if len(args) > 0 {
		name = args[0].String()
	}
	return fmt.Sprintf("Pong from Go/WASM! Hello, %s 🎉", name)
}

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

func main() {
	fmt.Println("[Go/WASM] Module loaded successfully")

	// Exporta funções para o escopo global do JS
	js.Global().Set("goPing", js.FuncOf(ping))
	js.Global().Set("extractPatterns", js.FuncOf(extractPatterns))

	// fmt.Println("[Go/WASM] goExtractPatterns registered")

	// Mantém o programa vivo (necessário para WASM ficar disponível)
	select {}
}
