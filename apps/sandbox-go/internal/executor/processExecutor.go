package executor

import (
	"bytes"
	"io"
	"os/exec"
	"sandbox-go/pkg/utils"
	"syscall"
)

type ProcessExecutor struct{}

func NewProcessExecutor() *ProcessExecutor{
	return  &ProcessExecutor{}
}

func (e *ProcessExecutor) Exec(req utils.ExecRequest) utils.ExecResponse{
	cmd := exec.Command(req.Command, req.Args...)

	if req.Cwd != ""{
		cmd.Dir = req.Cwd
	}

	env := make([]string, 0, len(req.Env))
	for k,v := range req.Env {
		env = append(env, k+"="+v)
	}
	if len(env) > 0 {
		cmd.Env = append(cmd.Env, env...)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	exitCode := 0

	if err != nil{
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}else{
			return utils.ExecResponse{
				Stdout: "",
				Stderr: "",
				ExitCode: -1,
				Error: err.Error(),
			}
		}
	}
	return utils.ExecResponse{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
	}
}

func (e *ProcessExecutor) Start(req utils.ExecRequest) (*exec.Cmd, io.WriteCloser, io.ReadCloser, io.ReadCloser, error){
	cmd := exec.Command(req.Command, req.Args...)

	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	if req.Cwd != ""{
		cmd.Dir = req.Cwd
	}

	if len(req.Env) > 0{
	env := make([]string, 0, len(req.Env))
	for k,v := range req.Env {
		env = append(env, k+"="+v)
	}
	cmd.Env = append(cmd.Env, env...)
	}

	stdin, err := cmd.StdinPipe();
	if err != nil{
		return nil, nil, nil, nil, err
	}	

	stdout, err := cmd.StdoutPipe(); 
	if err != nil{
		return nil,nil,nil,nil, err
	}
	stderr, err := cmd.StderrPipe();
	if err != nil{
		return nil,nil,nil,nil, err
	}
	
	if err := cmd.Start(); err != nil{
		return nil,nil,nil,nil,err
	}

	return cmd,stdin, stdout, stderr, nil
}