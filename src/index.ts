import express from "express"
import * as k8s from "@kubernetes/client-node"

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

app.listen(4001, () => console.log("App listening on port 4001"))