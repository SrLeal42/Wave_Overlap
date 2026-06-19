package wfc

// entropyHeap é um min-heap indexado de células por entropia.
// Suporta: Push O(log N), Pop O(log N), Update O(log N), Remove O(log N).
//
// A indexação (array `pos`) permite localizar qualquer célula no heap em O(1),
// viabilizando updates e remoções eficientes durante propagação e backtracking.
type entropyHeap struct {
	heap []int     // heap[i] = cellIndex na posição i do heap
	pos  []int     // pos[cellIndex] = posição no heap, ou -1 se não está no heap
	keys []float64 // keys[cellIndex] = valor de entropia (chave de ordenação)
	size int
}

func newEntropyHeap(numCells int) *entropyHeap {
	h := &entropyHeap{
		heap: make([]int, numCells),
		pos:  make([]int, numCells),
		keys: make([]float64, numCells),
		size: 0,
	}

	for i := range numCells {
		h.pos[i] = -1
	}

	return h
}

func (h *entropyHeap) Len() int    { return h.size }
func (h *entropyHeap) Empty() bool { return h.size == 0 }

func (h *entropyHeap) Contains(cell int) bool {
	return h.pos[cell] != -1
}

func (h *entropyHeap) less(i, j int) bool {
	return h.keys[h.heap[i]] < h.keys[h.heap[j]]
}

func (h *entropyHeap) swap(i, j int) {
	h.heap[i], h.heap[j] = h.heap[j], h.heap[i]
	h.pos[h.heap[i]] = i
	h.pos[h.heap[j]] = j
}

func (h *entropyHeap) siftUp(i int) {
	for i > 0 {
		parent := (i - 1) / 2
		if !h.less(i, parent) {
			break
		}
		h.swap(i, parent)
		i = parent
	}
}

func (h *entropyHeap) siftDown(i int) {
	for {
		smallest := i
		left := 2*i + 1
		right := 2*i + 2

		if left < h.size && h.less(left, smallest) {
			smallest = left
		}

		if right < h.size && h.less(right, smallest) {
			smallest = right
		}

		if smallest == i {
			break
		}

		h.swap(i, smallest)
		i = smallest
	}
}

// Push insere uma célula no heap com a chave dada.
func (h *entropyHeap) Push(cell int, key float64) {
	h.keys[cell] = key
	h.heap[h.size] = cell
	h.pos[cell] = h.size
	h.size++
	h.siftUp(h.size - 1)
}

// Pop remove e retorna a célula com menor entropia.
func (h *entropyHeap) Pop() int {
	cell := h.heap[0]

	h.size--
	if h.size > 0 {
		h.heap[0] = h.heap[h.size]
		h.pos[h.heap[0]] = 0
		h.siftDown(0)
	}

	h.pos[cell] = -1

	return cell
}

// Update atualiza a chave de uma célula já no heap.
func (h *entropyHeap) Update(cell int, newKey float64) {
	i := h.pos[cell]

	if i == -1 {
		return
	}

	oldKey := h.keys[cell]
	h.keys[cell] = newKey
	if newKey < oldKey {
		h.siftUp(i)
	} else {
		h.siftDown(i)
	}
}

// Remove remove uma célula do heap.
func (h *entropyHeap) Remove(cell int) {
	i := h.pos[cell]

	if i == -1 {
		return
	}

	h.size--
	if i == h.size {
		// Era o último elemento, só remove
		h.pos[cell] = -1
		return
	}

	// Move o último para a posição i
	h.heap[i] = h.heap[h.size]
	h.pos[h.heap[i]] = i
	h.pos[cell] = -1
	// Rebalanceia (pode precisar subir ou descer)
	h.siftUp(i)
	h.siftDown(i)
}

// Rebuild reinicializa o heap com n células usando heapify O(n),
// mais eficiente que n × Push O(n log n).
// keyFn recebe o índice da célula e retorna a chave de entropia.
func (h *entropyHeap) Rebuild(n int, keyFn func(cell int) float64) {
	h.size = n
	for i := range n {
		h.heap[i] = i
		h.pos[i] = i
		h.keys[i] = keyFn(i)
	}
	// Heapify bottom-up
	for i := n/2 - 1; i >= 0; i-- {
		h.siftDown(i)
	}
}
