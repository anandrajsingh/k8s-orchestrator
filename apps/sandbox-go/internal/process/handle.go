package process

import (
	"io"
	"os/exec"
	"sync"
)

type Handle struct {
	ID       string
	Cmd      *exec.Cmd
	Stdin    io.WriteCloser
	Stdout   *Broadcaster
	Stderr   *Broadcaster
	ExitCode int
	State    State
	Err      error

	mu sync.Mutex
}
