import http from "http";
import { deleteProcess, getProcess, handleExec, handleProcessStart, streamProcess, writeInput } from "./execApi";
import { ExecService } from "../service/execService";
import { ProcessExecutor } from "../executor/processExecutor";
import { ProcessManager } from "../process/processManager";

const executor = new ProcessExecutor()
const service = new ExecService(executor);
const manager = new ProcessManager(executor);

const server = http.createServer((req,res) => {
    if (!req.url || !req.method) {
        res.statusCode = 400;
        res.end();
        return;
    }

    if (req.method === "POST" && req.url === "/exec") {
        handleExec(req, res, service)
        return
    }

    const parts = req.url.split("/").filter(Boolean);

    if (req.method === "POST" && parts.length === 2 && parts[0] === "exec" && parts[1] === "start") {
        handleProcessStart(req, res, manager)
        return
    }

    if (req.method === "GET" && parts.length === 2 && parts[0] === "exec") {
        const id = parts[1];
        if (!id) return;
        getProcess(req, res, manager, id)
        return
    }

    if (req.method === "POST" &&
        parts.length === 3 &&
        parts[0] === "exec" &&
        parts[2] === "kill"
    ) {
        const id = parts[1];
        if (!id) return;

        deleteProcess(req, res, manager, id)
        return
    }

    if(req.method === "GET" &&
        parts.length === 3 &&
        parts[0] === "exec" &&
        parts[2] === "stream"
    ){
        const id = parts[1]
        if(!id) return;

        streamProcess(req, res, manager, id)
        return;
    }

    if(req.method === "POST" &&
        parts.length === 3 &&
        parts[0] === "exec" &&
        parts[2] === "input"
    ){
        const id = parts[1]
        if(!id) return;

        writeInput(req, res, manager, id)
        return;
    }
    res.statusCode = 404;
    res.end("Not found")
})

server.listen(3000, () => {
    console.log("API listening on port 3000")
})