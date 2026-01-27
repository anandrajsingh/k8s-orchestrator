import { ChildProcess } from "child_process"
import { Broadcaster } from "./broadcaster"
import { Writable } from "stream"

export enum ProcessState {
  CREATED = "created",
  RUNNING = "running",
  EXITED = "exited",
  KILLED = "killed",
}

export interface ProcessHandle{
    id: string,
    process: ChildProcess,
    state: ProcessState,
    stdin: Writable
    stdout: Broadcaster<Buffer>,
    stderr: Broadcaster<Buffer>,
    exitCode? : number,
    error? : string
    cleanup: () => void
}