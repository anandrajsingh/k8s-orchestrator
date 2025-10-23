import express from "express"
import * as k8s from "@kubernetes/client-node"

const kc = new k8s.KubeConfig()
kc.loadFromDefault();

const client = kc.makeApiClient(k8s.CoreV1Api)

const app = express()
app.use(express.json())

app.post("/pod/list", async (req, res) => {
    const { namespace } = req.body
    const pods = await client.listNamespacedPod({namespace})
    res.json(pods)
})

app.post("/pod/create", async (req, res) => {

    const {name, namespace, labels, containers, restartPolicy} = req.body

    const podManifest: k8s.V1Pod = {
        metadata: {
            name,
            namespace,
            labels,
        },
        spec: {
            containers,
            restartPolicy,
        },
    };

    const pod = await client.createNamespacedPod({namespace, body: podManifest})

    res.json(pod)
})

app.post("/pod/delete", async(req, res) => {
    const {namespace, name} = req.body
    const pod = await client.deleteNamespacedPod({namespace, name})
    res.json(pod)
})

app.listen(4001, () => console.log("App listening on port 4001"))