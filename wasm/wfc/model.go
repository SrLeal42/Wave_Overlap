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

// banRecord registra um ban individual para poder desfazê-lo durante backtracking.
// Armazena os valores ANTES da modificação.
type banRecord struct {
	cell         int
	pattern      int
	prevSumW     float64
	prevSumWLogW float64
	prevCompat   [4]int
}

// deltaCheckpoint armazena apenas as mudanças (bans) desde a última decisão,
// em vez de copiar o estado inteiro do solver.
type deltaCheckpoint struct {
	observedCell  int
	chosenPattern int
	bans          []banRecord
}

// Solver executa o algoritmo Wave Function Collapse (Overlapping Model).
// Usa boundaries periódicos (wrapping) — o output é tileable.
type Solver struct {
	model *Model
	outW  int // largura do output em células
	outH  int // altura do output em células

	// wave[cell] é um Bitset onde o bit p está ligado se o padrão p ainda é possível.
	wave []Bitset

	// numPoss[cell] = quantidade de padrões possíveis
	numPoss      []int
	numColors    int
	bytesPerCell int

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

	// Delta checkpoints — armazena apenas os bans em vez do estado inteiro.
	checkpoints  []deltaCheckpoint
	maxBacktrack int         // profundidade máxima de checkpoints
	pendingBans  []banRecord // bans acumulados desde o último checkpoint

	rng *rand.Rand
}

// StepStatus indica o resultado de um step do solver.
type StepStatus int

const (
	StepContinue      StepStatus = iota // Ainda tem células para colapsar
	StepDone                            // Todas as células colapsadas
	StepContradiction                   // Contradição — precisa de retry
)
