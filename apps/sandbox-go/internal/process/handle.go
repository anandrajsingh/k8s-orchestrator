package process

import (
	"io"
	"os/exec"
	"sandbox-go/internal/filesystem"
	"sync"
)

type Handle struct {
	ID     string
	Cmd    *exec.Cmd

	Stdin  io.WriteCloser
	Stdout *Broadcaster
	Stderr *Broadcaster

	FS       *filesystem.Filesystem
	
	ExitCode int
	State    State
	Err      error

	mu sync.Mutex
}
