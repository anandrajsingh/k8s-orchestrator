import { IncomingMessage, ServerResponse } from "http"
import { ProcessManager } from "../process/processManager";


function getPathParam(req: IncomingMessage): string | null {
    const url = new URL(req.url!, "http://localhost");
    return url.searchParams.get("path")
}

export async function readFile(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const handle = manager.get(id)
    if (!handle) {
        res.statusCode = 404;
        res.end("Process not found")
        return
    }

    const p = getPathParam(req)
    if (!p) {
        res.statusCode = 400;
        res.end("path required")
        return
    }

    try {
        const data = await handle.fs.readFile(p);
        res.writeHead(200, { "Content-Type": "application/octet-stream" })
        res.end(data)
    } catch (error: any) {
        res.statusCode = 400
        res.end(error.message)
    }
}

export async function writeFile(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const handle = manager.get(id)
    if (!handle) {
        res.statusCode = 404
        res.end("process not found")
        return;
    }

    const p = getPathParam(req)
    if (!p) {
        res.statusCode = 400
        res.end("path required")
        return
    }

    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", async () => {
        try {
            await handle.fs.writeFile(p, Buffer.concat(chunks))
            res.statusCode = 204
            res.end()
        } catch (error: any) {
            res.statusCode = 400;
            res.end(error.message)
        }
    })
}

export async function listDir(req: IncomingMessage, res: ServerResponse, manager: ProcessManager, id: string) {
    const handle = manager.get(id)
    if (!handle) {
        res.statusCode = 404
        res.end("process not found")
        return
    }
    const p = getPathParam(req) ?? ".";
    try {
        const entries = await handle.fs.listDir(p);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(entries));
    } catch (err: any) {
        res.statusCode = 400;
        res.end(err.message)
    }
}

export async function statPath(
    req:IncomingMessage,
    res:ServerResponse,
    manager: ProcessManager,
    id: string
){
    const handle = manager.get(id)
    if(!handle){
        res.statusCode = 404
        res.end("process not found")
        return
    }

    const p = getPathParam(req)
    if(!p){
        res.statusCode = 400
        res.end("path required")
        return
    }

    try {
        const s = await handle.fs.stat(p)
        res.writeHead(200, {"Content-Type":"application/json"})
        res.end(JSON.stringify({
            size: s.size,
            isFile: s.isFile(),
            isDir: s.isDirectory(),
            mtime: s.mtimeMs
        }))
    } catch (err:any) {
        res.statusCode = 400
        res.end(err.message)
    }
}