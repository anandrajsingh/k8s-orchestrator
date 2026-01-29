package process

import (
	"io"
	"os/exec"
	"sandbox-go/internal/filesystem"
	"sync"
	"time"
)

type Handle struct {
	ID  string
	Cmd *exec.Cmd

	CreatedAt time.Time
	LastIOAt  time.Time
	TTL       time.Duration

	Stdin  io.WriteCloser
	Stdout *Broadcaster
	Stderr *Broadcaster

	FS *filesystem.Filesystem

	ExitCode int
	State    State
	Err      error

	mu sync.Mutex
}
