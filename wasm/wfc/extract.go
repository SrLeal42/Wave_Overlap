package wfc

import (
	"encoding/json"
	"fmt"
)

// ExtractionResult é a saída serializada para o JS.
type ExtractionResult struct {
	PatternSize int                 `json:"patternSize"`
	Patterns    [][]uint8           `json:"patterns"`    // cada padrão é um array flat PxP (row-major)
	Frequencies []int               `json:"frequencies"` // contagem de ocorrências por padrão
	Adjacency   map[string][][2]int `json:"adjacency"`   // direção -> pares compatíveis [idA, idB]
	TotalFound  int                 `json:"totalFound"`  // total de janelas antes da deduplicação
}

// Offsets para cada direção de adjacência.
// "right" significa: padrão B está 1 célula à direita de A.
var directionOffsets = map[string][2]int{
	"right": {0, 1},
	"down":  {1, 0},
	"left":  {0, -1},
	"up":    {-1, 0},
}

// ExtractPatterns varre o grid com janela deslizante PxP,
// deduplica padrões, conta frequências e computa regras de adjacência.
//
// A adjacência usa o critério de sobreposição (overlap):
// dois padrões são compatíveis numa direção se a faixa de P-1
// células compartilhada entre eles for idêntica.
func ExtractPatterns(flat []uint8, rows, cols, P int) (ExtractionResult, error) {
	if P < 2 || P > rows || P > cols {
		return ExtractionResult{}, fmt.Errorf("invalid pattern size P=%d for grid %dx%d", P, rows, cols)
	}
	if len(flat) != rows*cols {
		return ExtractionResult{}, fmt.Errorf("flat array length %d doesn't match %dx%d=%d", len(flat), rows, cols, rows*cols)
	}

	// Reconstrói acesso 2D a partir do flat array (sem cópia, usa slices)
	grid := make([][]uint8, rows)
	for r := range rows {
		grid[r] = flat[r*cols : (r+1)*cols]
	}

	// --- 1. Extrair e deduplicar padrões ---
	patternIndex := make(map[string]int)
	var patterns [][]uint8
	var frequencies []int
	totalFound := 0

	for r := 0; r <= rows-P; r++ {
		for c := 0; c <= cols-P; c++ {
			pat := make([]uint8, P*P)
			for pr := range P {
				for pc := range P {
					pat[pr*P+pc] = grid[r+pr][c+pc]
				}
			}

			key := string(pat)
			if idx, exists := patternIndex[key]; exists {
				frequencies[idx]++
			} else {
				patternIndex[key] = len(patterns)
				patterns = append(patterns, pat)
				frequencies = append(frequencies, 1)
			}
			totalFound++
		}
	}

	// --- 2. Computar regras de adjacência ---
	adjacency := make(map[string][][2]int)

	for dirName, offset := range directionOffsets {
		dr, dc := offset[0], offset[1]
		var pairs [][2]int

		for i, patA := range patterns {
			for j, patB := range patterns {
				if overlapsMatch(patA, patB, P, dr, dc) {
					pairs = append(pairs, [2]int{i, j})
				}
			}
		}

		adjacency[dirName] = pairs
	}

	return ExtractionResult{
		PatternSize: P,
		Patterns:    patterns,
		Frequencies: frequencies,
		Adjacency:   adjacency,
		TotalFound:  totalFound,
	}, nil
}

// overlapsMatch verifica se patB pode ser colocado na posição (dr, dc)
// relativa a patA. A região de sobreposição (P-1 células na direção
// do deslocamento) deve ser idêntica.
//
// Exemplo para "right" (dr=0, dc=1):
//
//	As P-1 colunas mais à direita de A devem coincidir
//	com as P-1 colunas mais à esquerda de B.
func overlapsMatch(patA, patB []uint8, P, dr, dc int) bool {
	startR := max(0, dr)
	endR := min(P, P+dr)
	startC := max(0, dc)
	endC := min(P, P+dc)

	for i := startR; i < endR; i++ {
		for j := startC; j < endC; j++ {
			if patA[i*P+j] != patB[(i-dr)*P+(j-dc)] {
				return false
			}
		}
	}
	return true
}

// extractToJSON é o ponto de entrada chamado pela bridge JS.
// Retorna o resultado como string JSON.
func ExtractPatternsToJSON(flat []uint8, rows, cols, P int) (string, error) {
	result, err := ExtractPatterns(flat, rows, cols, P)
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("failed to marshal result: %w", err)
	}

	return string(data), nil
}
