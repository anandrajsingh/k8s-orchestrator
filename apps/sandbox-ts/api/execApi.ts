import { IncomingMessage, ServerResponse } from "http";
import { ExecService } from "../service/execService";
import { ExecRequest } from "../utils/types";
import { ProcessManager } from "../process/processManager";

export async function handleExec(req: IncomingMessage, res: ServerResponse, service: ExecService) {
    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString()
    })

    req.on("end", async () => {
        let parsedBody: any;

        try {
            parsedBody = JSON.parse(body);
        } catch {
            res.statusCode = 400;
            res.end("Invalid JSON");
            return;
        }

        const execReq: ExecRequest = {
            command: parsedBody.command,
            args: parsedBody.args ?? [],
            env: parsedBody.env ?? {},
            cwd: parsedBody.cwd
        }

        const result = await service.execute(execReq)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
    })
}

export async function handleProcessStart(req: IncomingMessage, res: ServerResponse, manager: ProcessManager) {
    let body = "";
    req.on("data", (chunk) => {
        body += chunk.toString()
    })

    req.on("end", async () => {
        let parsedBody: any;

        try {
            parsedBody = JSON.parse(body)
        } catch {
            res.statusCode = 400;
            res.end("Invalid JSON")
            return;
        }

        const execReq: ExecRequest = {
            command: parsedBody.command,
            args: parsedBody.args ?? [],
            env: parsedBody.env ?? {},
            cwd: parsedBody.cwd,
        };

        const id = manager.start(execReq);

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ id }))
    })
}

export async function getProcess(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const handle = manager.get(id)

    if (!handle) {
        res.statusCode = 404;
        res.end("Process Not Found.")
        return
    }

    const response = {
        id: handle.id,
        state: handle.state,
        exitCode: handle.exitCode,
        stdout: handle.stdout,
        stderr: handle.stderr,
        error: handle.error,
    };

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(response))
    return;
}

export async function deleteProcess(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {

    try {
        manager.kill(id)
    } catch (error) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: (error as Error).message }))
        return
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ message: "Process killed" }))
}