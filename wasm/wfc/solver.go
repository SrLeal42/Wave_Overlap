package wfc

import (
	"errors"
	"math"
	"math/rand"
)

// ErrContradiction é retornado quando uma célula fica sem padrões possíveis.
var ErrContradiction = errors.New("wfc: contradiction — a cell has no valid patterns")

// NewSolver cria um solver para gerar um output de outW×outH.
func NewSolver(model *Model, outW, outH int, seed int64) *Solver {
	numCells := outW * outH
	N := model.NumPatterns

	s := &Solver{
		model:       model,
		outW:        outW,
		outH:        outH,
		wave:        make([][]bool, numCells),
		numPoss:     make([]int, numCells),
		sumsOfW:     make([]float64, numCells),
		sumsOfWLogW: make([]float64, numCells),
		compatible:  make([][][4]int, numCells),
		stack:       make([]stackEntry, 0, numCells),
		rng:         rand.New(rand.NewSource(seed)),
	}

	// Somas iniciais (todos os padrões possíveis)
	sumW := 0.0
	sumWLogW := 0.0
	for _, w := range model.Weights {
		sumW += w
		sumWLogW += w * math.Log(w)
	}

	// Inicializa cada célula com todos os padrões possíveis
	for i := range numCells {
		s.wave[i] = make([]bool, N)
		s.compatible[i] = make([][4]int, N)

		for p := range N {
			s.wave[i][p] = true

			// Contagem de suporte inicial por direção.
			// compatible[i][p][d] = len(Propagator[opposite(d)][p])
			// porque com todos os padrões possíveis, o suporte é máximo.
			for d := 0; d < 4; d++ {
				opp := (d + 2) % 4
				s.compatible[i][p][d] = len(model.Propagator[opp][p])
			}
		}

		s.numPoss[i] = N
		s.sumsOfW[i] = sumW
		s.sumsOfWLogW[i] = sumWLogW
	}

	return s
}

// Solve executa o WFC até completar ou encontrar contradição.
// Retorna o output como flat array (row-major), onde cada valor
// é um índice de cor da paleta.
func (s *Solver) Solve() ([]uint8, error) {
	for {
		done, err := s.observe()

		if err != nil {
			return nil, err
		}

		if done {
			return s.result(), nil
		}

		if err := s.propagate(); err != nil {
			return nil, err
		}
	}
}

// --- Observe ---

// observe encontra a célula não-colapsada com menor entropia de Shannon,
// colapsa ela para um único padrão (ponderado por peso).
// Retorna (true, nil) se todas as células já estão colapsadas.
func (s *Solver) observe() (bool, error) {
	minEntropy := math.MaxFloat64
	minCell := -1

	for i, n := range s.numPoss {
		if n == 0 {
			return false, ErrContradiction
		}

		if n == 1 {
			continue // já colapsada
		}

		// Entropia de Shannon + ruído para desempate aleatório
		entropy := math.Log(s.sumsOfW[i]) - s.sumsOfWLogW[i]/s.sumsOfW[i]
		entropy += s.rng.Float64() * 1e-6

		if entropy < minEntropy {
			minEntropy = entropy
			minCell = i
		}
	}

	if minCell == -1 {
		return true, nil // tudo colapsado
	}

	s.collapse(minCell)

	return false, nil
}

// collapse escolhe um padrão para a célula baseado nos pesos (frequências)
// e bane todos os outros.
func (s *Solver) collapse(cell int) {
	// Amostragem ponderada
	r := s.rng.Float64() * s.sumsOfW[cell]
	cumulative := 0.0
	chosen := -1

	for p, possible := range s.wave[cell] {

		if !possible {
			continue
		}

		cumulative += s.model.Weights[p]
		if cumulative >= r {
			chosen = p
			break
		}
	}

	// Fallback por imprecisão de float: pega o último possível
	if chosen == -1 {
		for p := len(s.wave[cell]) - 1; p >= 0; p-- {
			if s.wave[cell][p] {
				chosen = p
				break
			}
		}
	}

	// Bane todos exceto o escolhido
	for p := range s.wave[cell] {
		if p != chosen && s.wave[cell][p] {
			s.ban(cell, p)
		}
	}
}

// --- Propagate ---

// ban remove um padrão de uma célula, atualiza entropia e agenda propagação.
func (s *Solver) ban(cell, pattern int) {
	s.wave[cell][pattern] = false
	s.numPoss[cell]--

	// Atualiza somas para entropia incremental
	w := s.model.Weights[pattern]
	s.sumsOfW[cell] -= w
	s.sumsOfWLogW[cell] -= w * math.Log(w)

	// Zera compatibilidade (padrão já removido, não precisa mais rastrear)
	for d := 0; d < 4; d++ {
		s.compatible[cell][pattern][d] = 0
	}

	s.stack = append(s.stack, stackEntry{cell, pattern})
}

// propagate processa a stack usando constraint propagation (AC-3).
// Quando um padrão é banido de uma célula, os vizinhos perdem
// suporte e podem ter seus padrões banidos em cascata.
func (s *Solver) propagate() error {
	for len(s.stack) > 0 {
		// Pop
		entry := s.stack[len(s.stack)-1]
		s.stack = s.stack[:len(s.stack)-1]

		i1 := entry.cell
		t1 := entry.pattern
		x1 := i1 % s.outW
		y1 := i1 / s.outW

		for d := 0; d < 4; d++ {
			dr := dirOffsets[d][0]
			dc := dirOffsets[d][1]

			// Vizinho com wrapping periódico
			x2 := (x1 + dc + s.outW) % s.outW
			y2 := (y1 + dr + s.outH) % s.outH
			i2 := y2*s.outW + x2

			// t1 sustentava esses padrões no vizinho — decrementar suporte
			for _, t2 := range s.model.Propagator[d][t1] {
				comp := &s.compatible[i2][t2]
				comp[d]--

				if comp[d] == 0 && s.wave[i2][t2] {
					s.ban(i2, t2)

					if s.numPoss[i2] == 0 {
						return ErrContradiction
					}
				}
			}
		}
	}

	return nil
}

// --- Result ---

// result constrói o output final.
// Cada célula recebe a cor do pixel top-left (índice 0) do padrão atribuído.
// Funciona porque no Overlapping Model com boundaries periódicos,
// todos os padrões que cobrem um pixel concordam no valor.
func (s *Solver) result() []uint8 {
	output := make([]uint8, s.outW*s.outH)

	for i, possible := range s.wave {
		for p, ok := range possible {
			if ok {
				output[i] = s.model.Patterns[p][0]
				break
			}
		}
	}

	return output
}
