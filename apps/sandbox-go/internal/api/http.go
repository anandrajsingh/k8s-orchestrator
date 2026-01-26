package api

import (
	"encoding/json"
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
		"stdout":   h.Stdout.String(),
		"stderr":   h.Stderr.String(),
		"error":    h.Err,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func DeleteProcess(
	w http.ResponseWriter,
	r *http.Request,
	manager *process.Manager,
	id string,
) {
	if err := manager.Kill(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
