package process

import (
	"errors"
	"os/exec"
	"sync"

	"github.com/google/uuid"
	"sandbox-go/executor"
	"sandbox-go/utils"
)

type Manager struct {
	executor  *executor.ProcessExecutor
	processes map[string]*Handle
	mu        sync.Mutex
}

func NewManager(exec *executor.ProcessExecutor) *Manager{
	return &Manager{
		executor: exec,
		processes: make(map[string]*Handle),
	}
}


func (m *Manager) Start(req utils.ExecRequest)(string, error){
	cmd, stdout, stderr, err := m.executor.Start(req)
	if err != nil{
		return "", err
	}

	id := uuid.NewString()

	handle := &Handle{
		ID: id,
		Cmd: cmd,
		State: StateRunning,
		Stdout: stdout,
		Stderr: stderr,
	}

	m.mu.Lock()
	m.processes[id] = handle
	m.mu.Unlock()

	go m.wait(handle)

	return id, nil
}

func(m *Manager) wait(h *Handle){
	err := h.Cmd.Wait()

	h.mu.Lock()
	defer h.mu.Unlock()

	if err != nil{
		if exitErr, ok := err.(*exec.ExitError); ok{
			h.ExitCode = exitErr.ExitCode()
			h.State = StateExited
		}else{
			h.State = StateFailed
			h.Err = err
		}
		return
	}
	h.ExitCode = 0
	h.State = StateExited
}

func (m *Manager) Status(id string) (*Handle, error){
	m.mu.Lock()
	defer m.mu.Unlock()

	h, ok := m.processes[id]
	if !ok {
		return nil, errors.New("process not found")
	}
	return h, nil
}

func (m *Manager) Kill(id string) error{
	m.mu.Lock()
	h, ok := m.processes[id]
	m.mu.Unlock()

	if !ok {
		return errors.New("process not found")
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.State != StateRunning{
		return errors.New("process not running")
	}
	return  h.Cmd.Process.Kill()
}