package main

import (
	"log"
	"net/http"

	"sandbox-go/api"
	"sandbox-go/executor"
	"sandbox-go/service"
)

func main(){
	exec := executor.NewProcessExecutor()
	svc := service.NewExecService(exec)

	mux := http.NewServeMux()
	mux.Handle("/exec", api.HandleExec(svc))

	log.Println("Sandbox listening on port 3000");
	log.Fatal(http.ListenAndServe(":3000", mux))
}