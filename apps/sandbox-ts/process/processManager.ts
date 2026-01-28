import {randomUUID} from "crypto"
import { ProcessExecutor } from "../executor/processExecutor"
import { ProcessHandle, ProcessState } from "./handle";
import { ExecRequest } from "../utils/types";
import { Broadcaster } from "./broadcaster";
import * as fs from "fs/promises"
import path from "path"
import { FileSystem } from "../fs/filesystem";

export class ProcessManager {
    private executor : ProcessExecutor;
    private processes : Map<string, ProcessHandle>;

    constructor(executor: ProcessExecutor){
        this.executor = executor;
        this.processes = new Map()
    }

    async start(req: ExecRequest):Promise<string> {
        const { process } = this.executor.start(req);
        const id = randomUUID();

        const stdoutBroadcaster = new Broadcaster<Buffer>();
        const stderrBroadcaster = new Broadcaster<Buffer>();

        process.stdout?.on("data", (chunk:Buffer) => {
            stdoutBroadcaster.publish(chunk)
        })

        process.stderr?.on("data", (chunk:Buffer) => {
            stderrBroadcaster.publish(chunk)
        })

        const rootDir = path.join("/tmp/envd", id);
        await fs.mkdir(rootDir, {recursive: true});

        const handle: ProcessHandle = {
            id,
            process,
            state: ProcessState.RUNNING,
            stdin: process.stdin!,
            stdout: stdoutBroadcaster,
            stderr: stderrBroadcaster,
            fs: new FileSystem(rootDir),

            cleanup: () => {
                process.stdin?.destroy()
                stdoutBroadcaster.close()
                stderrBroadcaster.close()
            }
        }

        this.processes.set(id,handle);

        process.on("close", (code) => {
            this.markExit(id, code ?? -1)
        })

        process.on("error", (err) => {
            this.markError(id, err.message)
        })

        return id
    }

    private markExit(id:string, code:number){
        const h = this.processes.get(id)
        if(!h) return;

        if(h.state === ProcessState.EXITED || h.state === ProcessState.KILLED){
            return
        }

        h.state = ProcessState.EXITED
        h.exitCode = code

        h.cleanup()
        this.processes.delete(id)
    }

    private markError(id:string, message: string){
        const h = this.processes.get(id)
        if(!h) return

        if(h.state === ProcessState.EXITED || h.state === ProcessState.KILLED){
            return
        }

        h.state = ProcessState.EXITED
        h.error = message

        h.cleanup()
        this.processes.delete(id)
    }

    get(id:string): ProcessHandle | undefined{
        return this.processes.get(id)
    }

    writeInput(id:string, data: Buffer | string): void{
        const h = this.processes.get(id);
        if(!h) throw new Error("Process Not Found")

        if(h.state !== "running"){
            throw new Error("Process Not in running state.")
        }

        if(h.stdin.destroyed){
            throw new Error("Stdin is closed.")
        }
        const ok = h.stdin.write(data)
        if(!ok){
            console.warn("stdin backpressure")
        }
    }

    kill(id:string, force = false): void{
        const h = this.processes.get(id);
        if(!h) throw new Error("Process Not Found")

        if (h.state === ProcessState.EXITED || h.state === ProcessState.KILLED) throw new Error("Process is not running")

        h.state = ProcessState.KILLED
        const signal = force ? "SIGKILL":"SIGTERM"
        try {
            h.process.kill(signal)
        } catch (error) {
        }

        h.cleanup()
        this.processes.delete(id)
    }
}
