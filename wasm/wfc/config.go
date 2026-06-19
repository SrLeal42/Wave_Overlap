package wfc

// ──────────────────────────────────────────────
// Constantes de controle do Solver
// ──────────────────────────────────────────────

const (
	// StepLimitFactor define o fator multiplicador para o limite de steps.
	// maxSteps = outW * outH * StepLimitFactor.
	// Se o solver exceder esse número de steps sem resolver, trata como contradição.
	StepLimitFactor = 100

	// MaxConsecutiveBacktracks é o número máximo de backtracks consecutivos
	// sem progresso (sem completar um step sem contradição).
	// Detecta "thrashing" — ciclos observe→propagate→backtrack.
	MaxConsecutiveBacktracks = 20

	// DefaultMaxBacktrack é a profundidade máxima de checkpoints mantidos.
	// Controla quantas decisões podem ser revertidas via backtracking.
	DefaultMaxBacktrack = 8

	// PendingBansCapLimit é o cap máximo ao alocar um novo slice de pendingBans
	// em saveCheckpoint. Evita que um slice enorme gere alocações igualmente enormes.
	PendingBansCapLimit = 4096

	// SliceShrinkThreshold é o limiar de capacity acima do qual o Reset()
	// realoca slices ao invés de apenas resliciar para [:0].
	SliceShrinkThreshold = 8192

	// InitialPendingBansCap é a capacity inicial do slice de pendingBans.
	InitialPendingBansCap = 256

	// InitialCheckpointsCap é a capacity inicial do slice de checkpoints.
	InitialCheckpointsCap = 8

	// SnapshotEvery define a cada quantos steps um snapshot é escrito no SAB
	// durante a geração live.
	SnapshotEvery = 64

	// EntropyNoiseFactor é a amplitude do ruído adicionado à entropia
	// para quebrar empates de forma aleatória.
	// Pré-computado por célula e mantido constante durante uma tentativa.
	EntropyNoiseFactor = 1e-6
)
