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

        try {
            const id = await manager.start(execReq);
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ id }))
        } catch (error:any) {
            res.statusCode = 500
            res.end(error.message)
        }
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
        error: handle.error,
    };

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(response))
    return;
}

export async function deleteProcess(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string, force: boolean) {

    try {
        manager.kill(id, force)
    } catch (error) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: (error as Error).message }))
        return
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ message: "Kill Requested" }))
}

export async function streamProcess(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const handle = manager.get(id)
    if (!handle) {
        res.statusCode = 404;
        res.end("Process Not found")
        return
    }

    res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked"
    });

    const unsubStdout = handle.stdout.subscribe((chunk) => {
        res.write(chunk)
    })
    const unsubStderr = handle.stderr.subscribe((chunk) => {
        res.write(chunk)
    })

    const cleanup = () => {
        unsubStdout();
        unsubStderr();
        res.end()
    };

    req.on("close", cleanup)

    handle.stdout.onClose(cleanup);
    handle.stderr.onClose(cleanup);
}

export async function writeInput(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => {
        chunks.push(chunk)
    })
    req.on("end", () => {
        try {
            const data = Buffer.concat(chunks)
            manager.writeInput(id, data);
            res.statusCode = 204;
            res.end()
        } catch (err: any) {
            res.statusCode = 400
            res.end(err.message)
        }
    })
}