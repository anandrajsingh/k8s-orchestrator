package main

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"sandbox-go/internal/api"
	"sandbox-go/internal/executor"

	"sandbox-go/internal/process"
	"sandbox-go/internal/service"
)

func main() {
	exec := executor.NewProcessExecutor()
	svc := service.NewExecService(exec)
	manager := process.NewManager(exec)

	mux := http.NewServeMux()
	mux.Handle("/exec", api.HandleExec(svc))

	mux.HandleFunc("/exec/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if r.Method == http.MethodPost && len(parts) == 2 && parts[1] == "start" {
			api.HandleProcessStart(w, r, manager)
			return
		}

		if r.Method == http.MethodGet && len(parts) == 2 {
			api.GetProcess(w, r, manager, parts[1])
			return
		}

		if r.Method == http.MethodPost && len(parts) == 3 && parts[2] == "kill" {
			force := false
			if v := r.URL.Query().Get("force"); v!=""{
				force, _ = strconv.ParseBool(v)
			}
			api.DeleteProcess(w, r, manager, parts[1], force)
			return
		}

		if r.Method == http.MethodGet && len(parts) == 3 && parts[2] == "stream"{
			api.StreamProces(w,r,manager,parts[1])
			return
		}

		if r.Method == http.MethodPost && len(parts) == 3 && parts[2] == "input"{
			api.WriteInput(w, r, manager, parts[1])
			return
		}

		http.NotFound(w, r)
	})

	log.Println("Sandbox listening on port 3000")
	log.Fatal(http.ListenAndServe(":3000", mux))
}
