import WebSocket from "ws";
import { spawn } from "child_process";
import os from "os"
import path from "path";
import fs from "fs"

const MANAGER_WS_URL = process.env.MANAGER_WS_URL || "ws://localhost:4001/agent";
const SANDBOX_ID = process.env.SANDBOX_ID || process.env.HOSTNAME || os.hostname()
const DATA_ROOT = process.env.DATA_ROOT || "/data";

const MAX_CONCURRENT_RUN = Number(process.env.MAX_CONCURRENT_RUN || 2)
const MAX_QUEUE_LENGTH = Number(process.env.MAX_QUEUE_LENGTH || 50)

const DEFAULT_TIMEOUT_MS = Number(process.env.DEFAULT_TIMEOUT_MS || 15000)

type RunRequest = {
    type: "run_js" | "run",
    projectId: string,
    requestId: string,
    cmd?: string,
    code?: string,
    timeOutMs?: number
}

type CancelRequest = {
    type: "cancel_run",
    projectId: string,
    requestId: string
}

type QueueItem = {
    request: RunRequest;
}

type RunState = {
    requestId: string,
    projectId: string,
    proc: ReturnType<typeof spawn>,
    timeout: NodeJS.Timeout
}

type FsReadMessage = {
    type: "fs:read",
    projectId: string,
    requestId: string,
    path: string,
    binary?: boolean
}

type FsWriteMessage = {
    type: "fs:write",
    requestId: string,
    projectId: string,
    path: string,
    binary?: boolean,
    data: string
}

let ws: WebSocket | null = null;
const queue: QueueItem[] = []
const pendingQueue: any[] = [];

const activeRuns = new Map<string, RunState>();
const finishedRuns = new Set<string>();

let heartbeatInterval: NodeJS.Timeout | null = null;

function runKey(projectId: string, requestId: string) {
    return `${projectId}:${requestId}`;
}

function projectRoot(projectId:string){
    const safe = path.basename(projectId);
    return path.join(DATA_ROOT, safe, "files");
}

function resolvePath(projectId: string, urlPath: string): string {
    const base = projectRoot(projectId);
    const resolved = path.resolve(base, urlPath)

    if (!resolved.startsWith(base)) {
        throw new Error("Invalid path (escape attempt).")
    }

    const real = fs.realpathSync(resolved)
    if (!real.startsWith(base)) throw new Error("Invalid path (symlink escape)")
    return real;
}

function ensureProjectDirs(projectId: string){
    const projectDir = path.join(DATA_ROOT, path.basename(projectId))
    const filesDir = path.join(projectDir, "files");
    const runtimeDir = path.join(projectDir, "runtime");

    if(!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, {recursive: true});
    if(!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, {recursive: true});
    if(!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, {recursive: true})
}

function handleFsRead(msg: FsReadMessage) {
    try {
        ensureProjectDirs(msg.projectId);
        const filepath = resolvePath(msg.projectId, msg.path);

        if(msg.binary){
            fs.readFile(filepath, (err, buffer) => {
                if(err){
                    send({type: "fs:read:error", projectId: msg.projectId, requestId: msg.requestId, error: err.message})
                    return;
                }
                send({type: "fs:read:ok", projectId: msg.projectId, requestId: msg.requestId, data: buffer.toString("base64")})
            })
            return;
        }

        fs.readFile(filepath, "utf8", (err, data) => {
            if (err) {
                send({
                    type: "fs:read:error",
                    projectId: msg.projectId,
                    requestId: msg.requestId,
                    error: err.message
                })
                return;
            }
            send({
                type: "fs:read:ok",
                projectId: msg.projectId,
                requestId: msg.requestId,
                data
            })
        })
    } catch (e: any) {
        send({ type: "fs:read:error", projectId: msg.projectId, requestId: msg.requestId, error: e.message })
    }
}

function handleFsWrite(msg: FsWriteMessage ) {
    try {
        ensureProjectDirs(msg.projectId)
        const filepath = resolvePath(msg.projectId, msg.path);

        if (typeof msg.data !== "string") {
            send({
                type: "fs:write:error",
                projectId: msg.projectId,
                requestId: msg.requestId,
                error: "Data must be in string format"
            })
            return;
        }

        if (msg.binary) {
            const buffer = Buffer.from(msg.data, "base64");

            fs.writeFile(filepath, buffer, (err) => {
                if (err) {
                    send({
                        type: "fs:write:error",
                        projectId: msg.projectId,
                        requestId: msg.requestId,
                        error: err.message
                    })
                    return;
                }
                send({ type: "fs:write:ok", projectId: msg.projectId, requestId: msg.requestId })
            })
            return;
        }

        fs.writeFile(filepath, msg.data, "utf8", (err) => {
            if (err) {
                send({ type: "fs:write:error", projectId: msg.projectId, requestId: msg.requestId, error: err.message })
                return;
            }
            send({ type: "fs:write:ok", projectId: msg.projectId, requestId: msg.requestId });
        })
    } catch (error: any) {
        send({ type: "fs:write:error", projectId: msg.projectId, requestId: msg.requestId, error: error.message })
    }
}

function send(msg: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        while (pendingQueue.length > 0) {
            const item = pendingQueue.shift()
            try {
                ws.send(JSON.stringify(item))
            } catch (error) {
                pendingQueue.unshift(item)
                break;
            }
        }
        try {
            ws.send(JSON.stringify(msg))
        } catch (error) {
            pendingQueue.push(msg)
        }
    } else {
        pendingQueue.push(msg)
    }
}

function tryStartNextRun() {
    while (activeRuns.size < MAX_CONCURRENT_RUN && queue.length > 0) {
        const item = queue.shift()
        if (!item) break;
        startRun(item.request)
    }
}

function enqueue(req: RunRequest) {
    if (!req.projectId || !req.requestId) {
        send({ type: "run_result", projectId: req.projectId, requestId: req.requestId, success: false, exitCode: null, error: "Missing projectId or requestId" });
        return;
    }
    const key = runKey(req.projectId, req.requestId);

    if (finishedRuns.has(key)) {
        send({ type: "run_result", projectId: req.projectId, requestId: req.requestId, success: false, exitCode: null, error: "Duplicate requestId (already completed)" });
        return;
    }

    if (activeRuns.has(key)) {
        send({ type: "run_result", projectId: req.projectId, requestId: req.requestId, success: false, exitCode: null, error: "Duplicate requestId (already running)" });
        return;
    }
    if (queue.length >= MAX_QUEUE_LENGTH) {
        console.log("Rejecting run overload: ", req.projectId, ": ", req.requestId)
        send({
            type: "run_result",
            projectId: req.projectId,
            requestId: req.requestId,
            success: false,
            exitCode: null,
            error: "Agent overloaded (queue full)"
        })
        return;
    }

    ensureProjectDirs(req.projectId)
    console.log("Enquing run:", req.requestId);
    queue.push({ request: req })

    tryStartNextRun()
}

function startRun(req: RunRequest) {
    const { requestId, projectId, code } = req;
    const key = runKey(projectId, requestId);

    const cwd = path.join(DATA_ROOT, path.basename(projectId));
    const timeOutMs = req.timeOutMs ?? DEFAULT_TIMEOUT_MS;

    let command = req.cmd;
    let args: string[] = [];

    if (req.type === "run_js" && code) {
        command = "node";
        args = ["-e", code]
    }

    if (!command) {
        send({ type: "run_result", projectId, requestId, success: false, exitCode: null, error: "No command provided" });
        finishedRuns.add(key);
        return;
    }

    console.log('Starting run: ', requestId);
    send({
        type: "run_started",
        projectId,
        requestId
    })

    const proc = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            NODE_OPTIONS: "--max-old-space-size=256"
        }
    })

    const timeout = setTimeout(() => {
        console.log("Timeout reached, killing run: ", projectId, ": ", requestId)
        proc.kill("SIGKILL")
    }, timeOutMs)

    const state: RunState = {
        projectId,
        requestId,
        proc,
        timeout
    }

    activeRuns.set(key, state)

    proc.stdout.on("data", (chunk) => {
        const text = chunk.toString()
        // process.stdout.write(chunk)

        send({
            type: "run_output",
            projectId,
            requestId,
            stream: "stdout",
            chunk: text
        })
    })

    proc.stderr.on("data", (chunk) => {
        const text = chunk.toString()
        // process.stderr.write(text)

        send({
            type: "run_output",
            projectId,
            requestId,
            stream: "stderr",
            chunk: text
        })
    })

    proc.on("close", (code, signal) => {
        clearTimeout(timeout)
        activeRuns.delete(key)

        const killedByTimeout = signal === "SIGKILL";
        const success = code === 0 && !killedByTimeout;

        console.log({
            "Run finished": requestId,
            "code": code,
            "signal": signal,
            "success": success
        })

        send({
            type: "run_result",
            projectId,
            requestId,
            success,
            exitCode: code,
            error: killedByTimeout
                ? "Killed by timeout"
                : success
                    ? null
                    : `Process exited with code ${code}`
        })

        finishedRuns.add(key)
        tryStartNextRun()
    })
}

function cancelRun(request: CancelRequest) {
    const { projectId, requestId } = request;
    const key = runKey(projectId, requestId);
    const state = activeRuns.get(key)
    if (!state) {
        send({ type: "cancel_request", projectId, requestId, success: false, error: "Not found or already finished." })
        return;
    }

    console.log("Cancelling run: ", projectId, " : ", requestId)
    state.proc.kill("SIGKILL")
    clearTimeout(state.timeout)
    activeRuns.delete(key)
    finishedRuns.add(key)

    send({
        type: "cancel_result",
        projectId,
        requestId,
        success: true,
    })

    tryStartNextRun()
}

function startHeartBeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    heartbeatInterval = setInterval(() => {
        send({
            type: "heartbeat",
            sandboxId: SANDBOX_ID,
            ts: Date.now(),
            activeRuns: activeRuns.size,
            queueLength: queue.length,
        })
    }, 5000)
}


function handleMessage(raw: any) {
    let msg: any;
    try {
        msg = JSON.parse(raw.toString())
    } catch (error) {
        console.log("Failed to parse message.")
        return;
    }

    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
        case "run_js": {
            const req: RunRequest = {
                type: "run_js",
                projectId: msg.projectId,
                requestId: msg.requestId,
                code: msg.code,
                timeOutMs: msg.timeOutMs
            }

            if (!req.requestId || typeof req.code !== "string") {
                send({
                    type: "run_result",
                    projectId: req.projectId,
                    requestId: req.requestId || "unknown",
                    success: false,
                    exitCode: null,
                    error: "Invalid run_js payload",
                })
                return;
            }
            enqueue(req)
            break;
        }
        case "fs:read": {
            const req: FsReadMessage = {
                type: "fs:read",
                projectId: msg.projectId,
                requestId: msg.requestId,
                path: msg.path
            }

            if (!req.requestId || typeof req.path !== "string") {
                send({
                    type: "run_result",
                    projectId: req.projectId,
                    requestId: req.requestId || "unknown",
                    success: false,
                    exitCode: null,
                    error: "Invalid fs:read payload"
                })
                return
            }
            handleFsRead(req)
            break;
        }
        case "fs:write": {
            const req: FsWriteMessage = {
                type: "fs:write",
                projectId: msg.projectId,
                requestId: msg.requestId,
                path: msg.path,
                data: msg.data
            }
            if (!req.requestId || typeof req.path !== "string") {
                send({
                    type: "run_result",
                    projectId: req.projectId,
                    requestId: req.requestId || "unknown",
                    success: false,
                    exitCode: null,
                    error: "Invalid fs:write payload"
                })
                return;
            }
            handleFsWrite(req)
            break;
        }
        case "cancel_run": {
            const cancelReq: CancelRequest = { type: "cancel_run", projectId: msg.projectId, requestId: msg.requestId }
            if (!cancelReq.requestId) return;
            cancelRun(cancelReq)
            break;
        }
        default:
            console.log("Unknow message type: ", msg.type)
    }
}

function killAllActiveRuns() {
    for (const [key, state] of activeRuns.entries()) {
        try {
            state.proc.kill("SIGKILL")
        } catch (err) {

        }
        clearTimeout(state.timeout)
        activeRuns.delete(key)
        finishedRuns.add(key)
    }
}

function connect() {
    console.log("Connecting to manger : ", MANAGER_WS_URL)

    ws = new WebSocket(MANAGER_WS_URL);

    ws.on("open", () => {
        console.log("Connected to manager")
        send({
            type: "register",
            sandboxId: SANDBOX_ID,
            protocolVersion: 1,
            capabilities: ["run_js", "run", "stream_output", 'cancel_run', "fs"]
        })

        while (pendingQueue.length > 0){
            try{
                ws!.send(JSON.stringify(pendingQueue.shift()));
            }catch(e){
                break;
            }
        }

        startHeartBeat()
    })

    ws.on("message", (data) => {
        handleMessage(data)
    })

    ws.on("close", () => {
        console.log("Ws closed, reconnecting in 2s...")
        killAllActiveRuns()
        setTimeout(connect, 2000)
    })

    ws.on("error", (err) => {
        console.log("WS err: ", (err as Error).message)
    })
}

process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down...");
    killAllActiveRuns()
    process.exit(0)
})

process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    killAllActiveRuns()
    process.exit(0)
})

connect()