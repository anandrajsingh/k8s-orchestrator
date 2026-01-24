import { ChildProcess } from "child_process"

export interface ProcessHandle{
    id: string,
    process: ChildProcess,
    state: "running" | "exited" | "failed",
    stdout: string,
    stderr: string,
    exitCode? : number,
    error? : string
}