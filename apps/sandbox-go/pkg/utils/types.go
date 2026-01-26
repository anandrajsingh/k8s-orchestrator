package utils

type ExecRequest struct{
	Command string `json:"command"`
	Args []string `json:"args"`
	Env map[string]string `json:"env"`
	Cwd string `json:"cwd,omitempty"`
	TimeoutMs string `json:"timeoutMs,omitempty"`
}

type ExecResponse struct{
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	ExitCode int`json:"exitCode"`
	Error string `json:"error,omitempty"`
}