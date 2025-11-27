import express from "express"
import * as k8s from "@kubernetes/client-node"
import { Writable } from "stream";
import http from "http"
import { WebSocketServer, WebSocket } from "ws"

const kc = new k8s.KubeConfig()
kc.loadFromDefault();

const client = kc.makeApiClient(k8s.CoreV1Api)

const app = express()
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({server})

type AgentInfo = {
    id: string,
    ws: WebSocket,
    lastHeartbeat: number,
    activeRuns: number,
    queueLength: number,
    capabilities? : string[]
}

const agents = new Map<string, AgentInfo>();
const projectAgents = new Map<string, string>();
const pendingRequests = new Map<string, (result: any)=> void>()

function genId(){
    return Math.random().toString(36).slice(2)
}

function pickBestAgent(){
    let best: AgentInfo | null = null;

    for (const agent of agents.values()){
        if(!best){
            best = agent;
            continue;
        }
        if(agent.activeRuns < best.activeRuns){
            best = agent;
        }else if (
            agent.activeRuns === best.activeRuns && agent.queueLength < best.queueLength
        ){
            best = agent
        }
    }
    return best;
}

function getAgentForProject(projectId: string){
    const existingAgentId = projectAgents.get(projectId)
    if(existingAgentId){
        const agent = agents.get(existingAgentId)
        if(agent) return agent;

        projectAgents.delete(projectId)
    }

    const newAgent = pickBestAgent()
    if(!newAgent) return null;

    projectAgents.set(projectId, newAgent.id)
    return newAgent;
}

async function runJsOnAgent(params: {
    agent: AgentInfo,
    projectId: string,
    code: string,
    timeOutMs?:number
}): Promise<any>{
    const { agent, projectId, code, timeOutMs = 15000 } = params;

    if(agent.ws.readyState !== WebSocket.OPEN){
        throw new Error ("Agent WebSocket is not open.")
    }

    const requestId = genId();

    const payload = {
        type: "run_js",
        projectId,
        requestId,
        code,
        timeOutMs
    }

    agent.ws.send(JSON.stringify(payload))

    const result = await new Promise((resolve) => {
        pendingRequests.set(requestId, resolve);

        setTimeout(() => {
            if(pendingRequests.has(requestId)){
                pendingRequests.delete(requestId);
                resolve({
                    type: "run_result",
                    projectId,
                    requestId,
                    success: false,
                    exitCode: null,
                    error: "Timeout in manager wile waiting for run result."
                })
            }
        }, timeOutMs + 3000)
    })

    return result;
}

app.get("/sandbox/list", async (req, res) => {
    const { namespace } = req.body
    const pods = await client.listNamespacedPod({namespace})
    res.json(pods)
})

app.post("/sandbox/create", async (req, res) => {

    const {name, namespace, labels, containers, restartPolicy} = req.body;

    const extendedLabels = {
        ...labels,
        sandboxttl : String(Date.now() + 1800*1000)
    }

    console.log(extendedLabels)

    const podManifest: k8s.V1Pod = {
        metadata: {
            name,
            namespace,
            labels: extendedLabels,
        },
        spec: {
            containers,
            restartPolicy,
        },
    };

    const pod = await client.createNamespacedPod({namespace, body: podManifest})

    res.json(pod)
})

app.post("/sandbox/status", async(req, res) => {
    const {name, namespace} = req.body;

    const pod = await client.readNamespacedPodStatus({name, namespace})
    const phase = pod.status?.phase
    console.log(pod.status)

    const events = await client.listNamespacedEvent({namespace, fieldSelector: `involvedObject.name=${name}`})
    res.json(phase)
})

app.post("/sandbox/delete", async(req, res) => {
    const {namespace, name} = req.body
    const pod = await client.deleteNamespacedPod({namespace, name})
    res.json(pod)
})

app.post("/sandbox/create-agent", async( req, res) => {
    const { name, namespace, labels, containers, restartPolicy} = req.body;

    const extendedLabels = {
        ...labels,
        sandboxttl: String(Date.now() + 1800*1000)
    }

    const podManifest: k8s.V1Pod = {
        metadata: {
            name,
            namespace,
            labels: extendedLabels
        },
        spec: {
            containers,
            restartPolicy
        }
    }

    const pod = await client.createNamespacedPod({namespace, body: podManifest})
    res.json(pod)
})

app.post("/sandbox/:name/run-js", async(req, res)=> {
    const { code, projectId } = req.body;
    const { name } = req.params;

    const ws = agents.get(name)?.ws
    if(!ws || ws.readyState !== ws.OPEN){
        return res.status(400).json({error: "Agent not connected"})
    }

    const agent = agents.get(name)!;
    const effectiveProjectId = projectId || `sandbox-${name}`;

    try {
        const result = await runJsOnAgent({
            agent,
            projectId: effectiveProjectId,
            code,
        })
        res.json(result)
    } catch (error:any) {
        res.status(500).json({error: error.message || "Run failed in manager"})
    }
})

app.post("sandbox/:projectId/run-js", async (req, res) => {
    const { projectId } = req.params;
    const { code, timeOutMs } = req.body;

    if(typeof code !== "string"){
        return res.status(400).json({error: "Code must be in string format"})
    }

    const agent = getAgentForProject(projectId);
    if (!agent) {
        return res.status(503).json({error: "No Agents available"})
    }

    try {
        const result = await runJsOnAgent({
            agent,
            projectId,
            code,
            timeOutMs
        })
        res.json(result)
    } catch (error: any) {
        res.status(500).json({error: error.message || "Run failed in manager"})
    }
})

app.post("/sandbox/:projectId/fs/read", async(req, res) => {
    const {projectId} = req.params;
    const { path, binary } = req.body;

    const agent = getAgentForProject(projectId)
    if(!agent){
        return res.json(503).json({error: "No agent available"})
    }

    if(agent.ws.readyState !==WebSocket.OPEN){
        return res.json(500).json({error: "Agent websocket not open"})
    }

    const requestId = genId()

    const payload = {
        type: "fs:read",
        projectId,
        requestId,
        path,
        binary
    }

    agent.ws.send(JSON.stringify(payload))

    try {
        const result = await new Promise((resolve) => {
            pendingRequests.set(requestId, resolve)

            setTimeout(() => {
                if(pendingRequests.has(requestId)){
                    pendingRequests.delete(requestId);
                    resolve({
                        type: "fs:read:error",
                        projectId,
                        requestId,
                        error: "Timeout in manager while waiting for fs:read response."
                    })
                }
            }, 15000)
        })

        res.json(result)
    } catch (err: any) {
        res.json({error: err.message || "fs:read failed in manager"})
    }
})

app.post("/sandbox/:projectId/fs/write", async(req, res) => {
    const { projectId } = req.params;
    const { path, data, binary } = req.body;

    const agent = getAgentForProject(projectId);
    if (!agent) {
    return res.status(503).json({ error: "No agents available" });
  }

  if (agent.ws.readyState !== WebSocket.OPEN) {
    return res.status(500).json({ error: "Agent WebSocket not open" });
  }

    const requestId = genId()

    const payload = {
        type: "fs:write",
        projectId,
        path,
        data,
        binary
    }

    agent.ws.send(JSON.stringify(payload))

    try {
        const result = await new Promise((resolve) => {
            pendingRequests.set(requestId,resolve)

            setTimeout(() => {
                if(pendingRequests.has(requestId)){
                    pendingRequests.delete(requestId);
                    resolve({
                        type: "fs:write:error",
                        projectId,
                        requestId,
                        error: "Timeout in manager while waiting for fs:write response"
                    })
                }
            }, 15000)
        })

        res.json(result)
    } catch (err:any) {
        res.status(500).json({error: err.message || "fs:write failed in manager"})
    }
})

app.post("/sandbox/:name/logs", async(req, res) => {
    const {name} = req.params;
    const {namespace, containerName} = req.body;
    const log = new k8s.Log(kc)

    let logs = '';
    const writabeStream = new Writable({
        write(chunk, encoding, callback){
            logs += chunk.toString()
            callback()
        }
    })

    await log.log(
    namespace,
    name,
    containerName,
    writabeStream,
    { follow: false }
  );
  await new Promise(res => setTimeout(res, 100))
    res.json(logs)
})

app.post("/sandbox/:name/exec", async(req, res) => {
    const {name} = req.params;
    const {namespace, containerName, command} = req.body;
    const exec = new k8s.Exec(kc);

    // await exec.exec(namespace, name, containerName,command, process.stdout, process.stderr, process.stdin, false )

    let stdOut = ''
    let stdErr = ''

    const stdOutStream = new Writable({
        write(chunk, encoding, callback){
            stdOut += chunk.toString()
            process.stdout.write(chunk.toString())
            callback()
        }
    })
    const stdErrStream = new Writable({
        write(chunk, encoding, callback){
            stdErr += chunk.toString()
            process.stderr.write(chunk.toString())
            callback()
        }
    })
    await exec.exec(
        namespace, 
        name, 
        containerName, 
        command,
        stdOutStream, 
        stdErrStream, 
        null, 
        false
    )
    await new Promise(res => setTimeout(res, 100));
    res.json({stdOut, stdErr})
})

wss.on("connection", (ws) => {
    console.log("Agent WS connected")

    let agentId:string;

    ws.on("message", raw => {
        let msg;
        try {
            msg = JSON.parse(raw.toString())
        } catch (error) {
            console.log("Failed to parse WS message from agent.")
            return
        }

        if(msg.type === "register"){
            agentId = msg.sandboxId;
            console.log("Agent registered: ", agentId)

            const info : AgentInfo = {
                id: agentId,
                ws,
                lastHeartbeat: Date.now(),
                activeRuns: 0,
                queueLength: 0,
                capabilities: msg.capabilities || []
            }
            agents.set(agentId, info)
            return;
        }

        if(msg.type === "heartbeat"){
            if(!msg.sandboxId) return;
            const info = agents.get(msg.sandboxId)
            if(info){
                info.lastHeartbeat = Date.now()
                if(typeof msg.activeRuns === "number"){
                    info.activeRuns = msg.activeRuns;
                }
                if(typeof msg.queueLength === "number"){
                    info.queueLength = msg.queueLength;
                }
            }
            return;
        }

        if(msg.type === "run_result"){
            const resolve = pendingRequests.get(msg.requestId);
            if(resolve){
                resolve(msg)
                pendingRequests.delete(msg.requestId)
            }
            return
        }

        if(msg.type === "fs:read:ok" || msg.type === "fs:read:error"){
            const resolve = pendingRequests.get(msg.requestId);
            if(resolve){
                resolve(msg)
                pendingRequests.delete(msg.requestId)
            }
            return;
        }

        if(msg.type === "fs:write:ok" || msg.type === "fs:write:error"){
            const resolve = pendingRequests.get(msg.requestId)
            if(resolve){
                resolve(msg)
                pendingRequests.delete(msg.requestId)
            }
            return;
        }

        if(msg.type === "run_output"){
            const stream = msg.stream || "stdout";
            const chunk = msg.chunk || "";
            console.log(`Agent run output ${stream}`,chunk)
            return;
        }
    })

    ws.on("close", () => {
        console.log("Agent WS closed")
        if(agentId){
            agents.delete(agentId)

            for(const [projectId, mappedAgentId] of projectAgents.entries()){
                if(mappedAgentId === agentId){
                    projectAgents.delete(projectId)
                }
            }
        }
    })
})

server.listen(4001, () => console.log("Manager running on port 4001"))