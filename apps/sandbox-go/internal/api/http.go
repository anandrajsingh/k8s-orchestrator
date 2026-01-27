package api

import (
	"encoding/json"
	"io"
	"net/http"
	"sandbox-go/internal/process"
	"sandbox-go/internal/service"
	"sandbox-go/pkg/utils"
)

func HandleExec(svc *service.ExecService) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var req utils.ExecRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		result := svc.Execute(req)

		w.Header().Set("Content-type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}

func HandleProcessStart(w http.ResponseWriter, r *http.Request, manager *process.Manager) {
	var req utils.ExecRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	id, err := manager.Start(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := map[string]string{
		"id": id,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func GetProcess(w http.ResponseWriter, r *http.Request, manager *process.Manager, id string) {
	h, err := manager.Status(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	resp := map[string]interface{}{
		"id":       h.ID,
		"state":    h.State,
		"exitCode": h.ExitCode,
		"error":    h.Err,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func StreamProces(w http.ResponseWriter, r *http.Request, manager *process.Manager, id string) {
	h, err := manager.Status(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	stdoutCh, unsubOut := h.Stdout.Subscribe()
	stderrCh, unsubErr := h.Stderr.Subscribe()
	defer unsubOut()
	defer unsubErr()

	flusher, _ := w.(http.Flusher)

	for {
		select{
		case data, ok := <-stdoutCh:
			if !ok {
				w.Write([]byte{})
				return
			}
			w.Write(data)
			flusher.Flush()

		case data, ok := <-stderrCh:
			if !ok {
				w.Write([]byte{})
				return
			}
			w.Write(data)
			flusher.Flush()

		case <-r.Context().Done():
			return
		}
	}
}

func WriteInput(w http.ResponseWriter, r *http.Request, manager *process.Manager, id string){
	body, err := io.ReadAll(r.Body)
	if err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := manager.WriteInput(id, body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func DeleteProcess(
	w http.ResponseWriter,
	r *http.Request,
	manager *process.Manager,
	id string,
	force bool,
) {
	if err := manager.Kill(id, force); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
