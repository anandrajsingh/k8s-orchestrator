import { ExecRequest, ExecResponse } from "../utils/types";
import { ChildProcess, spawn } from "child_process";

export interface StartedProcess {
    process: ChildProcess;
}

export class ProcessExecutor {

    start(req: ExecRequest): StartedProcess {
        const child = spawn(req.command, req.args, {
            env: { ...process.env, ...req.env },
            cwd: req.cwd,
            stdio: ["ignore", "pipe", "pipe"]
        });

        return {
            process: child,
        };
    }

    async exec(req: ExecRequest): Promise<ExecResponse> {
        return new Promise((resolve) => {
            const child = spawn(req.command, req.args, {
                env: { ...process.env, ...req.env },
                cwd: req.cwd
            })

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => {
                stdout += data.toString()
            })

            child.stderr.on("data", (data) => {
                stderr += data.toString()
            })

            child.on("error", (err) => {
                resolve({
                    stdout: "",
                    stderr: "",
                    exitCode: -1,
                    error: err.message
                })
            })

            child.on("close", (code) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code ?? -1
                })
            })
        })
    }
}