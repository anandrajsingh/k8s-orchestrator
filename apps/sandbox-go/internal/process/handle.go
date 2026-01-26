package process

import (
	"os/exec"
	"sync"

)

type Handle struct {
	ID       string
	Cmd      *exec.Cmd
	Stdout   *Broadcaster
	Stderr   *Broadcaster
	ExitCode int
	State    State
	Err      error

	mu sync.Mutex
}
