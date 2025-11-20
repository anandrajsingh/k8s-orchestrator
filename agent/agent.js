const WebSocket = require("ws")
const {spawn} = require("child_process")

const MANAGER_WS_URL = process.env.MANAGER_WS_URL || "ws://localhost:4001/agent";
const SANDBOX_ID = process.env.SANDBOX_ID || process.env.HOSTNAME || "unknown-sandbox";
const NAMESPACE = process.env.NAMESPACE || "default"

console.log("Agent starting, connecting to manager: ", MANAGER_WS_URL);

const ws = new WebSocket(MANAGER_WS_URL)

ws.on("open", () => {
    console.log("Agent connected to manager")

    ws.send(
        JSON.stringify({
            type: "register",
            sandboxId: SANDBOX_ID,
            namespace: NAMESPACE
        })
    )
})

ws.on("message", async(raw) => {
    let msg;
    try {
        msg = JSON.parse(raw.toString())
    } catch (error) {
        console.error("Agent invalid message: ", raw.toString())
        return;
    }

    if(msg.type === "ping"){
        ws.send(JSON.stringify({type: "pong"}))
    }

    if(msg.type === "run_js"){
        const { requestId, code } = msg;
        console.log("Agent run_js request", {requestId})

        try {
            const result = await runJs(code)
            ws.send(
                JSON.stringify({
                    type: "run_result",
                    requestId,
                    success: true,
                    stdout: result.stdout,
                    stderr:result.stderr,
                    exitCode: result.exitCode
                })
            )
        } catch (error) {
            ws.send(
                JSON.stringify({
                    type: "run_result",
                    requestId,
                    success: false,
                    error: error.message || String(err)
                })
            )
        }
    }
})

ws.on("close", () => {
    console.log("Agent connection closed, exiting")
    process.exit(1)
})

ws.on("error", (err) => {
    console.error("Agent ws error: ", err.message)
})

function runJs(code){
    return new Promise((resolve, reject) => {
        let stdout = ""
        let stderr = ""

        const child = spawn("node", ["-e", code], {
            env: {
                ...process.env
            }
        })

        child.stdout.on("data", (d) => (stdout += d.toString()))
        child.stderr.on("data", (d) => (stderr += d.toString()))

        child.on("error", (err) => reject(err));

        child.on("close", (exitCode) => {
            resolve({stdout, stderr, exitCode})
        })
    })
}