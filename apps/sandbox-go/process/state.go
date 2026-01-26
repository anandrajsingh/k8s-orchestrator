package process

type State string

const (
	StateCreated State = "created"
	StateRunning State = "running"
	StateExited State = "exited"
	StateFailed State = "failed"
)