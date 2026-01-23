import http from "http";
import { handleExec } from "./execApi";
import { ExecService } from "../service/execService";
import { ProcessExecutor } from "../executor/processExecutor";

const executor = new ProcessExecutor()
const service = new ExecService(executor);

const server = http.createServer((req,res) => {
    if(req.method === "POST" && req.url === "/exec"){
        handleExec(req, res, service)
        return
    }

    res.statusCode = 404;
    res.end("Not found")
})

server.listen(3000, () => {
    console.log("API listening on port 3000")
})