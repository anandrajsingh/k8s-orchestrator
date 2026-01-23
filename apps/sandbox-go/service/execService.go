package service

import (
	"sandbox-go/executor"
	"sandbox-go/utils"
)

type ExecService struct {
	executor *executor.ProcessExecutor
}

func NewExecService(executor *executor.ProcessExecutor) *ExecService{
	return &ExecService{executor: executor}
}

func (s *ExecService)Execute(req utils.ExecRequest) utils.ExecResponse{
	if req.Command == ""{
		return utils.ExecResponse{
			Stdout: "",
			Stderr: "",
			ExitCode: -1,
			Error: "Command is required",
		}
	}

	return s.executor.Exec(req)
}