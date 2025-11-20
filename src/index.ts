import express from "express"
import * as k8s from "@kubernetes/client-node"
import { Writable } from "stream";
import http from "http"
import { WebSocketServer } from "ws"

const kc = new k8s.KubeConfig()
kc.loadFromDefault();

const client = kc.makeApiClient(k8s.CoreV1Api)

const app = express()
app.use(express.json())

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

app.listen(4001, () => console.log("App listening on port 4001"))