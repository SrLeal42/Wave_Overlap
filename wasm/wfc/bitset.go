package wfc

import "math/bits"

// Bitset é um conjunto compacto de bits backed por []uint64.
// Reduz a representação de wave (antes []bool) em ~8x.
type Bitset struct {
	words []uint64
	n     int // número total de bits
}

// NewBitset cria um Bitset com n bits, todos desligados.
func NewBitset(n int) Bitset {
	nwords := (n + 63) / 64
	return Bitset{
		words: make([]uint64, nwords),
		n:     n,
	}
}

// SetAll liga todos os n bits (estado inicial do wave).
func (b *Bitset) SetAll() {
	nwords := len(b.words)
	for i := range nwords {
		b.words[i] = ^uint64(0)
	}

	// Limpa bits excedentes no último word
	rem := b.n % 64
	if rem != 0 {
		b.words[nwords-1] = (1 << rem) - 1
	}
}

// Set liga o bit i.
func (b *Bitset) Set(i int) {
	b.words[i/64] |= 1 << (i % 64)
}

// Clear desliga o bit i.
func (b *Bitset) Clear(i int) {
	b.words[i/64] &^= 1 << (i % 64)
}

// Test retorna true se o bit i está ligado.
func (b *Bitset) Test(i int) bool {
	return b.words[i/64]&(1<<(i%64)) != 0
}

// Count retorna o número de bits ligados (popcount).
// Usa math/bits.OnesCount64 que compila para POPCNT nativo.
func (b *Bitset) Count() int {
	count := 0
	for _, w := range b.words {
		count += bits.OnesCount64(w)
	}
	return count
}

// FirstSet retorna o índice do primeiro bit ligado, ou -1 se nenhum.
func (b *Bitset) FirstSet() int {
	for i, w := range b.words {
		if w != 0 {
			return i*64 + bits.TrailingZeros64(w)
		}
	}
	return -1
}

// ForEachSet chama fn para cada bit ligado, em ordem crescente.
func (b *Bitset) ForEachSet(fn func(int)) {
	for i, w := range b.words {
		base := i * 64
		for w != 0 {
			tz := bits.TrailingZeros64(w)
			fn(base + tz)
			w &= w - 1 // limpa o bit mais baixo
		}
	}
}

// Next retorna o próximo bit ligado a partir do estado (wi, w).
// Retorna (bitIndex, nextWi, nextW, ok).
func (b *Bitset) Next(wi int, w uint64) (int, int, uint64, bool) {
	for {
		if w != 0 {
			tz := bits.TrailingZeros64(w)
			idx := wi*64 + tz
			w &= w - 1 // limpa o bit mais baixo
			return idx, wi, w, true
		}
		wi++
		if wi >= len(b.words) {
			return 0, wi, 0, false
		}
		w = b.words[wi]
	}
}

// IterStart retorna o estado inicial para iteração com Next.
func (b *Bitset) IterStart() (int, uint64) {
	if len(b.words) == 0 {
		return 0, 0
	}
	return 0, b.words[0]
}

func (b *Bitset) AndAny(other Bitset) bool {

	for i, w := range b.words {
		if w&other.words[i] != 0 {
			return true
		}
	}

	return false
}

func (b *Bitset) OrWith(other Bitset) {
	for i := range b.words {
		b.words[i] |= other.words[i]
	}
}
