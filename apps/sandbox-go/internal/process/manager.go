package process

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"

	"sandbox-go/internal/executor"
	"sandbox-go/internal/filesystem"
	"sandbox-go/pkg/utils"

	"github.com/google/uuid"
)

type Manager struct {
	executor  *executor.ProcessExecutor
	processes map[string]*Handle
	mu        sync.Mutex
}

func NewManager(exec *executor.ProcessExecutor) *Manager {
	return &Manager{
		executor:  exec,
		processes: make(map[string]*Handle),
	}
}

func (m *Manager) Start(req utils.ExecRequest) (string, error) {
	cmd, stdin, stdout, stderr, err := m.executor.Start(req)
	if err != nil {
		return "", err
	}

	id := uuid.NewString()

	rootDir := filepath.Join("/tmp/envd", id)
	if err := os.MkdirAll(rootDir, 0755); err != nil {
		return "", err;
	}

	handle := &Handle{
		ID:     id,
		Cmd:    cmd,
		State:  StateRunning,
		Stdin:  stdin,
		Stdout: NewBroadcaster(),
		Stderr: NewBroadcaster(),
		FS: filesystem.New(rootDir),
	}

	m.mu.Lock()
	m.processes[id] = handle
	m.mu.Unlock()

	go streamPipe(stdout, handle.Stdout)
	go streamPipe(stderr, handle.Stderr)

	go m.wait(handle)

	return id, nil
}

func streamPipe(r io.ReadCloser, b *Broadcaster) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			b.Publish(buf[:n])
		}
		if err != nil {
			return
		}
	}
}

func (m *Manager) wait(h *Handle) {
	err := h.Cmd.Wait()

	code := 0

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			code = exitErr.ExitCode()
		}
	}

	m.markExited(h.ID, code, err)
}

func (m *Manager) markExited(id string, code int, err error) {
	m.mu.Lock()
	h, ok := m.processes[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.processes, id)
	m.mu.Unlock()

	h.mu.Lock()
	defer h.mu.Unlock()

	if h.Stdin != nil {
		h.Stdin.Close()
	}

	h.ExitCode = code
	if err != nil {
		h.Err = err
	}
	h.State = StateExited

	h.Stdout.Close()
	h.Stderr.Close()
}

func (m *Manager) Status(id string) (*Handle, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	h, ok := m.processes[id]
	if !ok {
		return nil, errors.New("process not found")
	}
	return h, nil
}

func (m *Manager) WriteInput(id string, data []byte) error {
	m.mu.Lock()
	h, ok := m.processes[id]
	m.mu.Unlock()

	if !ok {
		return errors.New("process not found")
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if h.State != StateRunning {
		return errors.New("process not running")
	}

	if h.Stdin == nil {
		return errors.New("stdin not available")
	}
	_, err := h.Stdin.Write(data)
	return err
}

func (m *Manager) Kill(id string, force bool) error {
	m.mu.Lock()
	h, ok := m.processes[id]
	m.mu.Unlock()

	if !ok {
		return errors.New("process not found")
	}
	h.mu.Lock()
	if h.State != StateRunning {
		h.mu.Unlock()
		return nil
	}
	h.State = StateKIlled
	h.mu.Unlock()

	sig := syscall.SIGTERM
	if force {
		sig = syscall.SIGKILL
	}
	_ = syscall.Kill(-h.Cmd.Process.Pid, sig)
	return nil
}
