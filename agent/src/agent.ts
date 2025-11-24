import WebSocket from "ws";
import { spawn } from "child_process";
import os from "os"
import path from "path";
import fs from "fs"

const MANAGER_WS_URL = process.env.MANAGER_WS_URL || "ws://localhost:4001/agent";
const SANDBOX_ID = process.env.SANDBOX_ID || process.env.HOSTNAME || os.hostname()

const MAX_CONCURRENT_RUN = Number(process.env.MAX_CONCURRENT_RUN || 2)
const MAX_QUEUE_LENGTH = Number(process.env.MAX_QUEUE_LENGTH || 50)

const DEFAULT_TIMEOUT_MS = Number(process.env.DEFAULT_TIMEOUT_MS || 15000)

type RunRequest = {
    type: "run_js",
    requestId: string,
    code: string,
    timeOutMs?: number
}

type CancelRequest = {
    type: "cancel_run",
    requestId: string
}

type QueueItem = {
    request: RunRequest;
}

type RunState = {
    requestId: string,
    proc: ReturnType<typeof spawn>,
    timeout: NodeJS.Timeout
}

type FsReadMessage = {
    type: "fs:read",
    requestId: string,
    path: string
}

type FsWriteMessage = {
    type: "fs:write",
    requestId: string,
    path: string,
    data: string
}

let ws: WebSocket | null = null;
const queue: QueueItem[] = []

const activeRuns = new Map<string, RunState>();
let heartbeatInterval: NodeJS.Timeout | null = null;

function resolvePath(urlPath: string): string {
    const base = "/sandbox";
    const resolved = path.resolve(base, urlPath)

    if (!resolved.startsWith(base)) {
        throw new Error("Invalid path.")
    }

    const real = fs.realpathSync(resolved)
    if(!real.startsWith(base)) throw new Error("Invalid path")
    return real;
}

function handleFsRead(msg: FsReadMessage) {
    try {
        const filepath = resolvePath(msg.path);

        fs.readFile(filepath, "utf8", (err, data) => {
            if (err) {
                send({
                    type: "fs:read:error",
                    requestId: msg.requestId,
                    error: err.message
                })
                return;
            }
            send({
                type: "fs:read:ok",
                requestId: msg.requestId,
                data
            })
        })
    } catch (e: any) {
        send({ type: "fs:read:error", requestId: msg.requestId, error: e.message })
    }
}

function handleFsWrite(msg: FsWriteMessage & {binary?:boolean}) {
    try {
        const filepath = resolvePath(msg.path);

        if(typeof msg.data !== "string"){
            send({
                type: "fs:write:error",
                requestId: msg.requestId,
                error: "Data must be in string format"
            })
            return;
        }

        if(msg.binary){
            const buffer = Buffer.from(msg.data, "base64");

            fs.writeFile(filepath, buffer, (err) => {
                if(err){
                    send({
                        type: "fs:write:error",
                        requestId: msg.requestId,
                        error: err.message
                    })
                    return;
                }
                send({type: "fs:write:ok", requestId: msg.requestId})
            })
            return;
        }

        fs.writeFile(filepath, msg.data, "utf8", (err) => {
            if (err) {
                send({ type: "fs:write:error", requestId: msg.requestId, error: err.message })
                return;
            }
            send({ type: "fs:write:ok", requestId: msg.requestId });
        })
    } catch (error: any) {
        send({type: "fs:write:error", requestId: msg.requestId, error: error.message})
    }
}

function send(msg: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
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
    if (queue.length >= MAX_QUEUE_LENGTH) {
        console.log("Rejecting run overload: ", req.requestId)
        send({
            type: "run_result",
            requestId: req.requestId,
            success: false,
            exitCode: null,
            error: "Agent overloaded (queue full)"
        })
        return;
    }

    console.log("Enquing run:", req.requestId);
    queue.push({ request: req })

    tryStartNextRun()
}

function startRun(req: RunRequest) {
    const { requestId, code } = req;
    const timeOutMs = req.timeOutMs ?? DEFAULT_TIMEOUT_MS;

    console.log('Starting run: ', requestId);
    send({
        type: "run_started",
        requestId
    })

    const proc = spawn("node", ["-e", code], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            NODE_OPTIONS: "--max-old-space-size=256"
        }
    })

    const timeout = setTimeout(() => {
        console.log("Timeout reached, killing run: ", requestId)
        proc.kill("SIGKILL")
    }, timeOutMs)

    const state: RunState = {
        requestId,
        proc,
        timeout
    }

    activeRuns.set(requestId, state)

    proc.stdout.on("data", (chunk) => {
        const text = chunk.toString()
        // process.stdout.write(chunk)

        send({
            type: "run_output",
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
            requestId,
            stream: "stderr",
            chunk: text
        })
    })

    proc.on("close", (code, signal) => {
        clearTimeout(timeout)
        activeRuns.delete(requestId)

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
            requestId,
            success,
            exitCode: code,
            error: killedByTimeout
                ? "Killed by timeout"
                : success
                    ? null
                    : `Process exited with code ${code}`
        })

        tryStartNextRun()
    })
}

function cancelRun(requestId: string) {
    const state = activeRuns.get(requestId)
    if (!state) {
        console.log("Cancel requested but not found: ", requestId)
        return;
    }

    console.log("Cancelling run: ", requestId)
    state.proc.kill("SIGKILL")
    clearTimeout(state.timeout)
    activeRuns.delete(requestId)

    send({
        type: "run_result",
        requestId,
        success: false,
        exitCode: null,
        error: "Run Cancelled"
    })

    tryStartNextRun()
}

function startHeartBeat() {
    if(heartbeatInterval) clearInterval(heartbeatInterval)
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
                requestId: msg.requestId,
                code: msg.code,
                timeOutMs: msg.timeOutMs
            }

            if (!req.requestId || typeof req.code !== "string") {
                send({
                    type: "run_result",
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
                requestId: msg.requestId,
                path: msg.path
            }

            if(!req.requestId || typeof req.path !== "string"){
                send({
                    type: "run_result",
                    requestId: req.requestId || "unknown",
                    success: false,
                    exitCode : null,
                    error: "Invalid fs:read payload"
                })
                return
            }
            handleFsRead(req)
            break;
        }
        case "fs:write": {
            const req: FsWriteMessage = {
                type : "fs:write",
                requestId: msg.requestId,
                path: msg.path,
                data: msg.data
            }
            if(!req.requestId || typeof req.path !== "string" ){
                send({
                    type: "run_result",
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
            const cancelReq: CancelRequest = { type: "cancel_run", requestId: msg.requestId}
            if(!cancelReq.requestId) return;
            cancelRun(cancelReq.requestId)
            break;
        }
        default:
            console.log("Unknow message type: ", msg.type)
    }
}

function connect(){
    console.log("Connecting to manger : ", MANAGER_WS_URL)

    ws = new WebSocket(MANAGER_WS_URL);

    ws.on("open", () => {
        console.log("Connected to manager")
        send({
            type: "register",
            sandboxId: SANDBOX_ID,
            protocolVersion: 1,
            capabilities: ["run_js", "stream_output", 'cancel_run', "fs"]
        })

        startHeartBeat()
    })

    ws.on("message", (data) => {
        handleMessage(data)
    })

    ws.on("close", () => {
        console.log("Ws closed, reconnecting in 2s...")
        
        for (const [requestId, state] of activeRuns.entries()){
            state.proc.kill("SIGKILL")
            clearTimeout(state.timeout)
            activeRuns.delete(requestId)
        }

        setTimeout(connect, 2000)
    })

    ws.on("error", (err) => {
        console.log("WS err: ", (err as Error).message)
    })
}

connect()