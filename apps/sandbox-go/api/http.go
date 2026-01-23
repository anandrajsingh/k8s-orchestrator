package api

import (
	"encoding/json"
	"net/http"
	"sandbox-go/service"
	"sandbox-go/utils"
)

func HandleExec(svc *service.ExecService)http.HandlerFunc{

	return func(w http.ResponseWriter, r *http.Request){
		if r.Method != http.MethodPost{
			w.WriteHeader(http.StatusMethodNotAllowed)
			return;
		}

		var req utils.ExecRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		result := svc.Execute(req)
		

		w.Header().Set("Content-type","application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}