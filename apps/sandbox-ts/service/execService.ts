import { ProcessExecutor } from "../executor/processExecutor";
import { ExecRequest, ExecResponse } from "../utils/types";

export class ExecService {
    private executor: ProcessExecutor;

    constructor(executor:ProcessExecutor){
        this.executor = executor
    }

    async execute(req:ExecRequest): Promise<ExecResponse>{
        if(!req.command){
            return {
                stdout: "",
                stderr: "",
                exitCode: -1,
                error: "Command is required"
            }
        }
        return this.executor.exec(req)
    }
}