import http from "http";

const server = http.createServer((req,res) => {
    if(req.method === "POST" && req.url === "/exec"){
        res.end(JSON.stringify({res: "exec url"}))
    }
    return
})

server.listen(3000, () => {
    console.log("API listening on port 3000")
})