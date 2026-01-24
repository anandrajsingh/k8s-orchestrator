import {randomUUID} from "crypto"
import { ProcessExecutor } from "../executor/processExecutor"
import { ProcessHandle } from "./handle";
import { ExecRequest } from "../utils/types";

export class ProcessManager {
    private executor : ProcessExecutor;
    private processes : Map<string, ProcessHandle>;

    constructor(executor: ProcessExecutor){
        this.executor = executor;
        this.processes = new Map()
    }

    start(req: ExecRequest):string {
        const { process, stdout, stderr } = this.executor.start(req);
        const id = randomUUID();

        const handle: ProcessHandle = {
            id,
            process,
            state: "running",
            stdout: "",
            stderr: ""
        }

        this.processes.set(id,handle);

        process.on("close", (code) => {
            handle.stdout = stdout()
            handle.stderr = stderr()
            handle.exitCode = code ?? -1
            handle.state = "exited"
        })

        process.on("error", (err) => {
            handle.error = err.message;
            handle.state = "failed"
        })

        return id
    }

    get(id:string): ProcessHandle | undefined{
        return this.processes.get(id)
    }

    kill(id:string): void{
        const h = this.processes.get(id);
        if(!h) throw new Error("Process Not Found")

        if (h.state !== "running") throw new Error("Process is not running")
        h.process.kill()
    }
}
