package main

import (
	"fmt"
	"syscall/js"
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

func main() {
	fmt.Println("[Go/WASM] Module loaded successfully")

	// Exporta a função "ping" para o escopo global do JS
	js.Global().Set("goPing", js.FuncOf(ping))

	// Mantém o programa vivo (necessário para WASM ficar disponível)
	select {}
}
