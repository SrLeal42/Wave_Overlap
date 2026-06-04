package wfc

func newCheckpointRing(capacity, numCells, numPatterns int) checkpointRing {
	ring := checkpointRing{
		slots: make([]checkpoint, capacity),
		cap:   capacity,
	}

	// Pré-aloca TODOS os buffers internos uma única vez
	for i := range capacity {
		cp := &ring.slots[i]
		cp.wave = make([][]bool, numCells)
		cp.numPoss = make([]int, numCells)
		cp.sumsOfW = make([]float64, numCells)
		cp.sumsOfWLogW = make([]float64, numCells)
		cp.compatible = make([][][4]int, numCells)

		for j := range numCells {
			cp.wave[j] = make([]bool, numPatterns)
			cp.compatible[j] = make([][4]int, numPatterns)
		}
	}

	return ring
}

func (r *checkpointRing) count() int {
	return r.top - r.base
}

// push retorna um ponteiro para o próximo slot (já alocado) para escrita.
// O caller copia os dados para dentro.
func (r *checkpointRing) push() *checkpoint {
	idx := r.top % r.cap
	r.top++

	// Se excedeu a capacidade, descarta o mais antigo
	if r.top-r.base > r.cap {
		r.base++
	}

	return &r.slots[idx]
}

// pop retorna um ponteiro para o checkpoint mais recente, ou nil se vazio.
func (r *checkpointRing) pop() *checkpoint {
	if r.top == r.base {
		return nil
	}
	r.top--
	idx := r.top % r.cap
	return &r.slots[idx]
}

func (r *checkpointRing) clear() {
	r.base = 0
	r.top = 0
}
