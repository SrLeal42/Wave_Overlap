package wfc

import (
	"errors"
	"fmt"
	"math"
	"math/rand"
)

// ErrContradiction é retornado quando uma célula fica sem padrões possíveis.
var ErrContradiction = errors.New("wfc: contradiction — a cell has no valid patterns")

// run é o loop interno observe→propagate.
func (s *Solver) run() ([]uint8, error) {

	for {

		switch s.Step() {
		case StepDone:
			return s.result(), nil
		case StepContradiction:
			return nil, ErrContradiction
		}
		// StepContinue → continua o loop
	}

}

// NewSolver cria um solver para gerar um output de outW×outH.
func NewSolver(model *Model, outW, outH int, seed int64) *Solver {
	numCells := outW * outH
	N := model.NumPatterns

	s := &Solver{
		model:        model,
		outW:         outW,
		outH:         outH,
		wave:         make([][]bool, numCells),
		numPoss:      make([]int, numCells),
		sumsOfW:      make([]float64, numCells),
		sumsOfWLogW:  make([]float64, numCells),
		compatible:   make([][][4]int, numCells),
		stack:        make([]stackEntry, 0, numCells),
		maxBacktrack: 8,
		rng:          rand.New(rand.NewSource(seed)),
	}

	s.cpRing = newCheckpointRing(s.maxBacktrack, numCells, N)

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

// Solve executa o WFC com até maxRetries tentativas.
// Retorna o output como flat array (row-major), onde cada valor
// é um índice de cor da paleta.
func (s *Solver) Solve(maxRetries int) ([]uint8, error) {

	for attempt := 0; attempt <= maxRetries; attempt++ {

		if attempt > 0 {
			s.Reset(s.rng.Int63())
		}

		output, err := s.run()
		if err == nil {
			return output, nil
		}

		// Só faz retry se for contradição
		if !errors.Is(err, ErrContradiction) {
			return nil, err
		}

		fmt.Printf("[WFC] Attempt %d/%d — contradiction, retrying...\n", attempt+1, maxRetries+1)
	}

	return nil, fmt.Errorf("wfc: failed after %d attempts — no valid configuration found", maxRetries+1)
}

func (s *Solver) Step() StepStatus {

	done, err := s.observe()

	if err != nil {
		// Contradição detectada no observe (numPoss == 0)
		if s.backtrack() {
			return StepContinue
		}

		return StepContradiction
	}

	if done {
		return StepDone
	}

	if err := s.propagate(); err != nil {
		// Contradição na propagação — tenta backtrack
		if s.backtrack() {
			return StepContinue
		}

		return StepContradiction
	}

	return StepContinue
}

// Snapshot escreve o estado atual da wave no buffer fornecido.
// Para células colapsadas, escreve a cor do padrão escolhido.
// Para células não-colapsadas, escreve a cor do padrão com maior peso
// (dá uma visualização coerente do progresso).
// O buffer deve ter tamanho outW * outH.
func (s *Solver) Snapshot(buf []uint8) {

	for i, possible := range s.wave {
		if s.numPoss[i] == 1 {

			// Colapsada — pega o padrão único
			for p, ok := range possible {
				if ok {
					buf[i] = s.model.Patterns[p][0]
					break
				}
			}

		} else if s.numPoss[i] > 1 {
			// Não colapsada — pega o padrão de maior peso
			bestWeight := -1.0
			bestColor := uint8(0)
			for p, ok := range possible {
				if ok && s.model.Weights[p] > bestWeight {
					bestWeight = s.model.Weights[p]
					bestColor = s.model.Patterns[p][0]
				}
			}
			buf[i] = bestColor
		}
		// numPoss == 0 → contradição, deixa o valor anterior
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

	// Separa: escolhe → salva → aplica
	chosen := s.choosePattern(minCell)
	// Só salva checkpoint se a decisão é arriscada
	// (poucas opções restantes → alto risco de contradição)
	if s.numPoss[minCell] <= 4 {
		s.saveCheckpoint(minCell, chosen)
	}
	s.collapseToPattern(minCell, chosen)

	return false, nil
}

// choosePattern faz amostragem ponderada e retorna o índice do padrão escolhido.
func (s *Solver) choosePattern(cell int) int {
	r := s.rng.Float64() * s.sumsOfW[cell]
	cumulative := 0.0

	for p, possible := range s.wave[cell] {

		if !possible {
			continue
		}

		cumulative += s.model.Weights[p]
		if cumulative >= r {
			return p
		}

	}

	// Fallback por imprecisão de float
	for p := len(s.wave[cell]) - 1; p >= 0; p-- {
		if s.wave[cell][p] {
			return p
		}
	}

	return -1 // nunca deveria chegar aqui
}

// collapseToPattern bane todos os padrões exceto o escolhido.
func (s *Solver) collapseToPattern(cell, chosen int) {

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

// reset reinicializa o solver para uma nova tentativa.
// Incrementa o seed para gerar um caminho diferente.
func (s *Solver) Reset(newSeed int64) {
	N := s.model.NumPatterns
	numCells := s.outW * s.outH

	s.rng = rand.New(rand.NewSource(newSeed))
	s.stack = s.stack[:0]
	s.cpRing.clear()

	sumW := 0.0
	sumWLogW := 0.0

	for _, w := range s.model.Weights {
		sumW += w
		sumWLogW += w * math.Log(w)
	}

	for i := range numCells {

		for p := range N {
			s.wave[i][p] = true
			for d := 0; d < 4; d++ {
				opp := (d + 2) % 4
				s.compatible[i][p][d] = len(s.model.Propagator[opp][p])
			}
		}

		s.numPoss[i] = N
		s.sumsOfW[i] = sumW
		s.sumsOfWLogW[i] = sumWLogW
	}
}

func (s *Solver) saveCheckpoint(cell, chosen int) {

	numCells := s.outW * s.outH

	cp := s.cpRing.push() // retorna slot pré-alocado
	cp.cell = cell
	cp.pattern = chosen

	copy(cp.numPoss, s.numPoss)
	copy(cp.sumsOfW, s.sumsOfW)
	copy(cp.sumsOfWLogW, s.sumsOfWLogW)

	for i := range numCells {
		copy(cp.wave[i], s.wave[i])
		copy(cp.compatible[i], s.compatible[i])
	}

}

func (s *Solver) restoreCheckpoint(cp *checkpoint) {

	fmt.Printf("[WFC] Checkpoint — Restaurando o checkpoint...\n")

	numCells := s.outW * s.outH

	copy(s.numPoss, cp.numPoss)
	copy(s.sumsOfW, cp.sumsOfW)
	copy(s.sumsOfWLogW, cp.sumsOfWLogW)

	for i := range numCells {
		copy(s.wave[i], cp.wave[i])
		copy(s.compatible[i], cp.compatible[i])
	}

	s.stack = s.stack[:0]
}

func (s *Solver) backtrack() bool {

	for {

		cp := s.cpRing.pop()
		if cp == nil {
			return false // ring esgotado
		}

		s.restoreCheckpoint(cp)
		s.ban(cp.cell, cp.pattern)

		if s.numPoss[cp.cell] == 0 {
			continue
		}

		if err := s.propagate(); err != nil {
			continue
		}

		return true
	}

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
