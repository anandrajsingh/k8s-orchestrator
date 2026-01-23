import { IncomingMessage, ServerResponse } from "http";
import { ExecService } from "../service/execService";
import { ExecRequest } from "../utils/types";

export async function handleExec(req: IncomingMessage, res: ServerResponse, service: ExecService){
    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString()
    })

    req.on("end", async() => {
        const parsedBody = JSON.parse(body)

        const execReq : ExecRequest = {
            command: parsedBody.command,
            args: parsedBody.args ?? [],
            env: parsedBody.env ?? {},
            cwd: parsedBody.cwd
        }

        const result = await service.execute(execReq)
        res.writeHead(200, {"Content-Type": "application/json"})
        res.end(JSON.stringify(result))
    })
}