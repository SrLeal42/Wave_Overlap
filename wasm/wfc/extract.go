package wfc

import (
	"encoding/json"
	"fmt"
)

// BuildModel extrai padrões do grid e constrói o Model otimizado para o solver.
func BuildModel(flat []uint8, rows, cols, P int) (*Model, error) {
	if P < 2 || P > rows || P > cols {
		return nil, fmt.Errorf("invalid pattern size P=%d for grid %dx%d", P, rows, cols)
	}

	if len(flat) != rows*cols {
		return nil, fmt.Errorf("flat array length %d doesn't match %dx%d=%d", len(flat), rows, cols, rows*cols)
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

		}
	}

	// --- 2. Converter frequências para pesos float64 ---
	numPatterns := len(patterns)
	weights := make([]float64, numPatterns)
	for i, f := range frequencies {
		weights[i] = float64(f)
	}

	// --- 3. Construir propagator otimizado ---
	var propagator [4][][]int
	for dir := 0; dir < 4; dir++ {
		propagator[dir] = make([][]int, numPatterns)
		dr, dc := dirOffsets[dir][0], dirOffsets[dir][1]

		for i, patA := range patterns {
			for j, patB := range patterns {
				if overlapsMatch(patA, patB, P, dr, dc) {
					propagator[dir][i] = append(propagator[dir][i], j)
				}
			}
		}
	}

	return &Model{
		PatternSize: P,
		NumPatterns: numPatterns,
		Patterns:    patterns,
		Weights:     weights,
		Propagator:  propagator,
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

// ExtractPatternsToJSON retorna o resultado da extração como JSON string.
// Uso exclusivo para debug — o fluxo principal usa BuildModel().
func ExtractPatternsToJSON(flat []uint8, rows, cols, P int) (string, error) {
	model, err := BuildModel(flat, rows, cols, P)
	if err != nil {
		return "", err
	}

	// Converte o propagator [4][][]int para o formato JSON legível
	dirNames := [4]string{"right", "down", "left", "up"}
	adjacency := make(map[string][][2]int)
	for dir := 0; dir < 4; dir++ {
		var pairs [][2]int
		for i, compatible := range model.Propagator[dir] {
			for _, j := range compatible {
				pairs = append(pairs, [2]int{i, j})
			}
		}
		adjacency[dirNames[dir]] = pairs
	}

	debug := ExtractionDebug{
		PatternSize: model.PatternSize,
		NumPatterns: model.NumPatterns,
		Patterns:    model.Patterns,
		Weights:     model.Weights,
		Adjacency:   adjacency,
	}

	data, err := json.Marshal(debug)
	if err != nil {
		return "", fmt.Errorf("failed to marshal debug result: %w", err)
	}

	return string(data), nil
}
