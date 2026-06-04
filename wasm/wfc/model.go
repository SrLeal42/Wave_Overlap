package wfc

import "math/rand"

// --- Direções de adjacência ---
// Indexadas como constantes para acesso direto no array [4] do Propagator.
const (
	DirRight = 0
	DirDown  = 1
	DirLeft  = 2
	DirUp    = 3
)

// Offsets (dr, dc) para cada direção.
var dirOffsets = [4][2]int{
	DirRight: {0, 1},
	DirDown:  {1, 0},
	DirLeft:  {0, -1},
	DirUp:    {-1, 0},
}

// Model contém tudo que o solver precisa para executar o WFC.
// É construído uma vez a partir do input do usuário e consumido pelo solver.
type Model struct {
	PatternSize int
	NumPatterns int
	Patterns    [][]uint8 // [patternID][pixel] — flat PxP, row-major (para renderizar output)
	Weights     []float64 // frequência de cada padrão (para colapso probabilístico)

	// Propagator[dir][patternID] = slice de IDs de padrões compatíveis naquela direção.
	Propagator [4][][]int
}

// ExtractionDebug é a saída JSON para inspeção no console do browser.
type ExtractionDebug struct {
	PatternSize int                 `json:"patternSize"`
	NumPatterns int                 `json:"numPatterns"`
	Patterns    [][]uint8           `json:"patterns"`
	Weights     []float64           `json:"weights"`
	Adjacency   map[string][][2]int `json:"adjacency"`
}

// SOLVER

// stackEntry representa um padrão banido de uma célula, pendente de propagação.
type stackEntry struct {
	cell    int
	pattern int
}

// checkpoint armazena o estado completo do solver antes de uma decisão.
// Os slices internos são pré-alocados e reutilizados.
type checkpoint struct {
	cell        int
	pattern     int
	wave        [][]bool
	numPoss     []int
	sumsOfW     []float64
	sumsOfWLogW []float64
	compatible  [][][4]int
}

// checkpointRing é um stack circular de checkpoints com capacidade fixa.
// Push adiciona ao topo; se cheio, descarta o mais antigo.
// Pop remove do topo.
type checkpointRing struct {
	slots []checkpoint
	cap   int
	base  int // índice lógico do mais antigo
	top   int // índice lógico de um após o mais recente
}

// Solver executa o algoritmo Wave Function Collapse (Overlapping Model).
// Usa boundaries periódicos (wrapping) — o output é tileable.
type Solver struct {
	model *Model
	outW  int // largura do output em células
	outH  int // altura do output em células

	// wave[cell][pattern] = true se o padrão ainda é possível
	wave [][]bool

	// numPoss[cell] = quantidade de padrões possíveis
	numPoss []int

	// Somas para cálculo incremental de entropia de Shannon:
	// H = log(sumW) - sumWLogW / sumW
	sumsOfW     []float64
	sumsOfWLogW []float64

	// compatible[cell][pattern][dir] = contagem de suporte.
	// Quantos padrões na célula vizinha na direção oposta a dir
	// ainda sustentam que pattern seja possível nesta célula.
	//
	// Inicializado com len(Propagator[opposite(d)][pattern]) e
	// decrementado durante propagação. Quando chega a 0, o padrão é banido.
	compatible [][][4]int

	// Stack de propagação: (cell, pattern) que foram banidos
	stack []stackEntry

	cpRing       checkpointRing
	maxBacktrack int // profundidade máxima do checkpoints

	rng *rand.Rand
}

// StepStatus indica o resultado de um step do solver.
type StepStatus int

const (
	StepContinue      StepStatus = iota // Ainda tem células para colapsar
	StepDone                            // Todas as células colapsadas
	StepContradiction                   // Contradição — precisa de retry
)
