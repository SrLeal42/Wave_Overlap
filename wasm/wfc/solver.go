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
func NewSolver(model *Model, outW, outH int, numColors int, seed int64) *Solver {
	numCells := outW * outH
	N := model.NumPatterns

	s := &Solver{
		model:        model,
		outW:         outW,
		outH:         outH,
		wave:         make([]Bitset, numCells),
		numPoss:      make([]int, numCells),
		sumsOfW:      make([]float64, numCells),
		sumsOfWLogW:  make([]float64, numCells),
		stack:        make([]stackEntry, 0, numCells),
		toBanBuf:     make([]int, 0, N),
		checkpoints:  make([]deltaCheckpoint, 0, InitialCheckpointsCap),
		maxBacktrack: DefaultMaxBacktrack,
		pendingBans:  make([]banRecord, 0, InitialPendingBansCap),
		rng:          rand.New(rand.NewSource(seed)),
		maxSteps:     numCells * StepLimitFactor,
	}

	s.numColors = numColors
	s.bytesPerCell = (numColors + 7) / 8

	// Pré-computa wLogW (evita math.Log repetido no ban)
	s.wLogW = make([]float64, N)
	for p, w := range model.Weights {
		s.wLogW[p] = w * math.Log(w)
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
		s.wave[i] = NewBitset(N)
		s.wave[i].SetAll()
		s.numPoss[i] = N
		s.sumsOfW[i] = sumW
		s.sumsOfWLogW[i] = sumWLogW
	}

	// Pré-computa ruído e constrói heap
	s.noise = make([]float64, numCells)
	for i := range numCells {
		s.noise[i] = s.rng.Float64() * EntropyNoiseFactor
	}

	baseEntropy := math.Log(sumW) - sumWLogW/sumW
	s.entropyQ = newEntropyHeap(numCells)
	s.entropyQ.Rebuild(numCells, func(cell int) float64 {
		return baseEntropy + s.noise[cell]
	})

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

	s.stepCount++
	if s.stepCount > s.maxSteps {
		return StepContradiction
	}

	done, err := s.observe()

	if err != nil {

		s.consecutiveBacktracks++
		if s.consecutiveBacktracks > MaxConsecutiveBacktracks {
			return StepContradiction
		}

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

		s.consecutiveBacktracks++
		if s.consecutiveBacktracks > MaxConsecutiveBacktracks {
			return StepContradiction
		}

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

	bpc := (s.numColors + 7) / 8

	for i := range s.wave {

		offset := i * bpc
		// Limpa os bytes desta célula
		for b := range bpc {
			buf[offset+b] = 0
		}
		// Liga o bit de cada cor possível
		s.wave[i].ForEachSet(func(p int) {
			color := int(s.model.Patterns[p][0])
			buf[offset+color/8] |= 1 << (color % 8)
		})

	}

}

// --- Observe ---

// observe extrai a célula com menor entropia do heap e a colapsa.
// Retorna (true, nil) se todas as células já estão colapsadas (heap vazio).
func (s *Solver) observe() (bool, error) {
	for {

		if s.entropyQ.Empty() {
			return true, nil // todas as células colapsadas
		}

		minCell := s.entropyQ.Pop()
		if s.numPoss[minCell] == 0 {
			return false, ErrContradiction
		}

		// Safety: se por alguma razão a célula já está colapsada, pula
		if s.numPoss[minCell] == 1 {
			continue
		}

		chosen := s.choosePattern(minCell)
		s.saveCheckpoint(minCell, chosen)
		s.collapseToPattern(minCell, chosen)

		return false, nil
	}
}

// choosePattern faz amostragem ponderada e retorna o índice do padrão escolhido.
// Usa iteração manual sobre o Bitset para permitir early return.
func (s *Solver) choosePattern(cell int) int {
	r := s.rng.Float64() * s.sumsOfW[cell]
	cumulative := 0.0
	lastSet := -1

	wi, w := s.wave[cell].IterStart()
	for {
		p, nwi, nw, ok := s.wave[cell].Next(wi, w)
		if !ok {
			break
		}
		wi, w = nwi, nw
		lastSet = p

		cumulative += s.model.Weights[p]
		if cumulative >= r {
			return p
		}
	}

	// Fallback por imprecisão de float — retorna o último bit ligado
	if lastSet >= 0 {
		return lastSet
	}

	return -1 // nunca deveria chegar aqui
}

// collapseToPattern bane todos os padrões exceto o escolhido.
func (s *Solver) collapseToPattern(cell, chosen int) {

	// Coleta os padrões a banir antes de modificar o bitset
	// (ForEachSet itera sobre snapshot dos words, mas ban() modifica o bitset)
	s.toBanBuf = s.toBanBuf[:0]
	s.wave[cell].ForEachSet(func(p int) {
		if p != chosen {
			s.toBanBuf = append(s.toBanBuf, p)
		}
	})

	for _, p := range s.toBanBuf {
		s.ban(cell, p)
	}

}

// --- Propagate ---

// ban remove um padrão de uma célula, atualiza entropia e agenda propagação.
// Grava um banRecord antes de modificar, para possibilitar backtracking por delta.
func (s *Solver) ban(cell, pattern int) {
	// Grava delta ANTES de modificar o estado
	s.pendingBans = append(s.pendingBans, banRecord{
		cell:         cell,
		pattern:      pattern,
		prevSumW:     s.sumsOfW[cell],
		prevSumWLogW: s.sumsOfWLogW[cell],
	})

	s.wave[cell].Clear(pattern)
	s.numPoss[cell]--

	// Atualiza somas para entropia incremental
	s.sumsOfW[cell] -= s.model.Weights[pattern]
	s.sumsOfWLogW[cell] -= s.wLogW[pattern]

	// Atualiza heap de entropias
	if s.numPoss[cell] == 1 {
		// Célula colapsada → remove do heap
		s.entropyQ.Remove(cell)
	} else if s.numPoss[cell] > 1 && s.entropyQ.Contains(cell) {
		// Recalcula entropia e atualiza posição no heap
		entropy := math.Log(s.sumsOfW[cell]) - s.sumsOfWLogW[cell]/s.sumsOfW[cell]
		s.entropyQ.Update(cell, entropy+s.noise[cell])
	}
	// numPoss == 0: contradição, propagate() vai detectar

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

			opp := (d + 2) % 4

			// Itera sobre padrões que t1 sustentava na direção d
			// PropBits[d][t1] = padrões compatíveis com t1 na direção d
			s.model.PropBits[d][t1].ForEachSet(func(t2 int) {
				// t2 já foi banido? skip
				if !s.wave[i2].Test(t2) {
					return
				}
				// t2 ainda tem suporte vindo de i1?
				// PropBits[opp][t2] = padrões que podem estar na dir opp de t2
				//                   = padrões em i1 que sustentam t2
				if !s.wave[i1].AndAny(s.model.PropBits[opp][t2]) {
					s.ban(i2, t2)
				}
			})

			if s.numPoss[i2] == 0 {
				return ErrContradiction
			}

		}
	}

	return nil
}

// Reset reinicializa o solver para uma nova tentativa.
// Incrementa o seed para gerar um caminho diferente.
func (s *Solver) Reset(newSeed int64) {
	N := s.model.NumPatterns
	numCells := s.outW * s.outH

	s.rng = rand.New(rand.NewSource(newSeed))

	// Ação 2.3: Realoca slices que cresceram demais, senão apenas reslicia
	if cap(s.stack) > SliceShrinkThreshold {
		s.stack = make([]stackEntry, 0, numCells)
	} else {
		s.stack = s.stack[:0]
	}

	if cap(s.toBanBuf) > SliceShrinkThreshold {
		s.toBanBuf = make([]int, 0, N)
	} else {
		s.toBanBuf = s.toBanBuf[:0]
	}

	if cap(s.checkpoints) > SliceShrinkThreshold {
		s.checkpoints = make([]deltaCheckpoint, 0, InitialCheckpointsCap)
	} else {
		s.checkpoints = s.checkpoints[:0]
	}

	if cap(s.pendingBans) > SliceShrinkThreshold {
		s.pendingBans = make([]banRecord, 0, InitialPendingBansCap)
	} else {
		s.pendingBans = s.pendingBans[:0]
	}

	// Reseta contadores de controle
	s.stepCount = 0
	s.consecutiveBacktracks = 0

	sumW := 0.0
	sumWLogW := 0.0

	for _, w := range s.model.Weights {
		sumW += w
		sumWLogW += w * math.Log(w)
	}

	for i := range numCells {
		s.wave[i].SetAll()
		s.numPoss[i] = N
		s.sumsOfW[i] = sumW
		s.sumsOfWLogW[i] = sumWLogW
	}

	// Regenera ruído e reconstrói heap
	for i := range numCells {
		s.noise[i] = s.rng.Float64() * EntropyNoiseFactor
	}
	baseEntropy := math.Log(sumW) - sumWLogW/sumW
	s.entropyQ.Rebuild(numCells, func(cell int) float64 {
		return baseEntropy + s.noise[cell]
	})

}

// saveCheckpoint fecha os pendingBans num deltaCheckpoint e empilha.
func (s *Solver) saveCheckpoint(cell, chosen int) {

	cp := deltaCheckpoint{
		observedCell:  cell,
		chosenPattern: chosen,
		bans:          s.pendingBans,
	}

	newCap := cap(cp.bans)
	if newCap > PendingBansCapLimit {
		newCap = PendingBansCapLimit
	}
	if newCap < InitialPendingBansCap {
		newCap = InitialPendingBansCap
	}

	// Aloca novo slice para os próximos bans
	s.pendingBans = make([]banRecord, 0, newCap)

	// Se excedeu a capacidade, descarta o mais antigo
	if len(s.checkpoints) >= s.maxBacktrack {
		// Shift left — descarta checkpoints[0]
		copy(s.checkpoints, s.checkpoints[1:])
		s.checkpoints[len(s.checkpoints)-1] = cp
	} else {
		s.checkpoints = append(s.checkpoints, cp)
	}

}

// restoreFromBans desfaz uma lista de bans em ordem reversa.
func (s *Solver) restoreFromBans(bans []banRecord) {

	for i := len(bans) - 1; i >= 0; i-- {
		b := bans[i]

		s.wave[b.cell].Set(b.pattern)
		s.numPoss[b.cell]++

		s.sumsOfW[b.cell] = b.prevSumW
		s.sumsOfWLogW[b.cell] = b.prevSumWLogW

		// Atualiza heap: se a célula voltou a ter >1 possibilidade,
		// ela precisa estar no heap com a entropia atualizada
		if s.numPoss[b.cell] > 1 {
			entropy := math.Log(s.sumsOfW[b.cell]) - s.sumsOfWLogW[b.cell]/s.sumsOfW[b.cell]

			if s.entropyQ.Contains(b.cell) {
				s.entropyQ.Update(b.cell, entropy+s.noise[b.cell])
			} else {
				s.entropyQ.Push(b.cell, entropy+s.noise[b.cell])
			}

		}

	}

}

// restoreCheckpoint desfaz todas as mudanças até o estado salvo no checkpoint.
func (s *Solver) restoreCheckpoint(cp *deltaCheckpoint) {

	// fmt.Printf("[WFC] Delta Checkpoint — Restaurando (%d pending + %d checkpoint bans)...\n",
	// 	len(s.pendingBans), len(cp.bans))

	// 1. Desfaz bans pendentes (pós-checkpoint) em ordem reversa
	s.restoreFromBans(s.pendingBans)

	// 2. Desfaz bans do próprio checkpoint em ordem reversa
	s.restoreFromBans(cp.bans)

	s.pendingBans = s.pendingBans[:0]
	s.stack = s.stack[:0]
}

func (s *Solver) backtrack() bool {

	for {

		if len(s.checkpoints) == 0 {
			return false // stack esgotado
		}

		// Pop do topo
		cp := s.checkpoints[len(s.checkpoints)-1]
		s.checkpoints = s.checkpoints[:len(s.checkpoints)-1]

		s.restoreCheckpoint(&cp)
		s.ban(cp.observedCell, cp.chosenPattern)

		if s.numPoss[cp.observedCell] == 0 {
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

	for i := range s.wave {
		p := s.wave[i].FirstSet()
		if p >= 0 {
			output[i] = s.model.Patterns[p][0]
		}
	}

	return output
}
