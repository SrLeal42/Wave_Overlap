package wfc

import (
	"encoding/json"
	"fmt"
)

// BuildModel extrai padrões do grid e constrói o Model otimizado para o solver.
// BuildModel é o orquestrador — monta o Model chamando as etapas.
func BuildModel(flat []uint8, rows, cols, P int, symmetry bool) (*Model, error) {
	// Validação
	if err := validateInput(flat, rows, cols, P); err != nil {
		return nil, err
	}

	// Reconstrói grid 2D
	grid := toGrid(flat, rows, cols)

	// Extrai padrões com wrapping + D4
	patterns, weights := extractPatterns(grid, rows, cols, P, symmetry)

	// Constrói propagator
	propagator := buildPropagator(patterns, P)

	return &Model{
		PatternSize: P,
		NumPatterns: len(patterns),
		Patterns:    patterns,
		Weights:     weights,
		PropBits:    propagator,
	}, nil
}

func validateInput(flat []uint8, rows, cols, P int) error {

	if P < 2 || P > rows || P > cols {
		return fmt.Errorf("invalid pattern size P=%d for grid %dx%d", P, rows, cols)
	}

	if len(flat) != rows*cols {
		return fmt.Errorf("flat array length %d doesn't match %dx%d=%d", len(flat), rows, cols, rows*cols)
	}

	return nil
}

func toGrid(flat []uint8, rows, cols int) [][]uint8 {

	grid := make([][]uint8, rows)
	for r := range rows {
		grid[r] = flat[r*cols : (r+1)*cols]
	}

	return grid
}

// extractPatterns extrai padrões P×P com wrapping periódico,
// gera variantes D4, e retorna padrões deduplicados com seus pesos.
func extractPatterns(grid [][]uint8, rows, cols, P int, symmetry bool) ([][]uint8, []float64) {
	patternIndex := make(map[string]int)
	var patterns [][]uint8
	var frequencies []int

	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {

			pat := make([]uint8, P*P)
			for pr := range P {
				for pc := range P {
					pat[pr*P+pc] = grid[(r+pr)%rows][(c+pc)%cols]
				}
			}

			if symmetry {

				for _, variant := range d4Variants(pat, P) {
					registerPattern(variant, patternIndex, &patterns, &frequencies)
				}

			} else {
				registerPattern(pat, patternIndex, &patterns, &frequencies)
			}

		}
	}

	// Converte frequências para pesos float64
	weights := make([]float64, len(patterns))
	for i, f := range frequencies {
		weights[i] = float64(f)
	}

	return patterns, weights
}

// registerPattern insere um padrão no mapa, incrementando frequência se já existe.
func registerPattern(pat []uint8, index map[string]int, patterns *[][]uint8, frequencies *[]int) {
	key := string(pat)

	if idx, exists := index[key]; exists {
		(*frequencies)[idx]++
	} else {
		index[key] = len(*patterns)
		*patterns = append(*patterns, pat)
		*frequencies = append(*frequencies, 1)
	}

}

// buildPropagator constrói a tabela de compatibilidade entre padrões.
func buildPropagator(patterns [][]uint8, P int) [4][]Bitset {
	numPatterns := len(patterns)
	var propBits [4][]Bitset

	for dir := 0; dir < 4; dir++ {
		propBits[dir] = make([]Bitset, numPatterns)
		dr, dc := dirOffsets[dir][0], dirOffsets[dir][1]

		for i, patA := range patterns {
			propBits[dir][i] = NewBitset(numPatterns)
			for j, patB := range patterns {
				if overlapsMatch(patA, patB, P, dr, dc) {
					propBits[dir][i].Set(j)
				}
			}
		}

	}

	return propBits
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

// Rotação 90° horário: (r, c) → (c, P-1-r)
func rotate90(pat []uint8, P int) []uint8 {
	rot := make([]uint8, P*P)

	for r := range P {
		for c := range P {
			rot[c*P+(P-1-r)] = pat[r*P+c]
		}
	}

	return rot
}

// Reflexão horizontal: (r, c) → (r, P-1-c)
func flipH(pat []uint8, P int) []uint8 {

	flip := make([]uint8, P*P)

	for r := range P {
		for c := range P {
			flip[r*P+(P-1-c)] = pat[r*P+c]
		}
	}

	return flip
}

func d4Variants(pat []uint8, P int) [][]uint8 {
	variants := make([][]uint8, 8)

	variants[0] = pat
	variants[1] = rotate90(pat, P)
	variants[2] = rotate90(variants[1], P) // rot180
	variants[3] = rotate90(variants[2], P) // rot270
	variants[4] = flipH(pat, P)
	variants[5] = rotate90(variants[4], P)
	variants[6] = rotate90(variants[5], P)
	variants[7] = rotate90(variants[6], P)

	return variants
}

// ExtractPatternsToJSON retorna o resultado da extração como JSON string.
// Uso exclusivo para debug — o fluxo principal usa BuildModel().
func ExtractPatternsToJSON(flat []uint8, rows, cols, P int) (string, error) {
	model, err := BuildModel(flat, rows, cols, P, true)
	if err != nil {
		return "", err
	}

	// Converte o propagator [4][][]int para o formato JSON legível
	dirNames := [4]string{"right", "down", "left", "up"}
	adjacency := make(map[string][][2]int)
	for dir := 0; dir < 4; dir++ {
		var pairs [][2]int
		for i, bs := range model.PropBits[dir] {
			bs.ForEachSet(func(j int) {
				pairs = append(pairs, [2]int{i, j})
			})
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
