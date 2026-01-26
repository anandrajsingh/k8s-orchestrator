import { ChildProcess } from "child_process"
import { Broadcaster } from "./broadcaster"

export interface ProcessHandle{
    id: string,
    process: ChildProcess,
    state: "running" | "exited" | "failed",
    stdout: Broadcaster<Buffer>,
    stderr: Broadcaster<Buffer>,
    exitCode? : number,
    error? : string
}