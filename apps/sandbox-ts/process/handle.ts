import { ChildProcess } from "child_process"
import { Broadcaster } from "./broadcaster"
import { Writable } from "stream"

export interface ProcessHandle{
    id: string,
    process: ChildProcess,
    state: "running" | "exited" | "failed",
    stdin: Writable
    stdout: Broadcaster<Buffer>,
    stderr: Broadcaster<Buffer>,
    exitCode? : number,
    error? : string
}