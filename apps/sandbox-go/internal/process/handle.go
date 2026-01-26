package process

import (
	"bytes"
	"os/exec"
	"sync"

)

type Handle struct {
	ID       string
	Cmd      *exec.Cmd
	Stdout   *bytes.Buffer
	Stderr   *bytes.Buffer
	ExitCode int
	State    State
	Err      error

	mu sync.Mutex
}
