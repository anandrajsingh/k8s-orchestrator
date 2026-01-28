package api

import (
	"encoding/json"
	"io"
	"net/http"
	"sandbox-go/internal/process"
)

func ReadFile(w http.ResponseWriter, r *http.Request, m *process.Manager, id string){
	h, err := m.Status(id)
	if err != nil{
		http.NotFound(w,r)
		return
	}

	p := r.URL.Query().Get("path")
	if p == ""{
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	data, err := h.FS.ReadFile(p)
	if err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func WriteFile(w http.ResponseWriter, r *http.Request, m *process.Manager, id string){
	h, err := m.Status(id)
	if err != nil{
		http.NotFound(w,r)
	}

	p := r.URL.Query().Get("path")
	if p == ""{
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.FS.WriteFile(p, body); err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func ListDir(w http.ResponseWriter, r *http.Request, m *process.Manager, id string){
	h, err := m.Status(id)
	if err != nil{
		http.NotFound(w,r)
		return
	}

	p := r.URL.Query().Get("path")
	if p == ""{
		p = "."
	}

	list, err := h.FS.ListDir(p)
	if err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_ = json.NewEncoder(w).Encode(list)
}

func StatPath(w http.ResponseWriter, r *http.Request, m *process.Manager, id string){
	h, err := m.Status(id)
	if err != nil{
		http.NotFound(w, r)
		return
	}

	p := r.URL.Query().Get("path")
	if p == ""{
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	info, err := h.FS.Stat(p)
	if err != nil{
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resp := map[string]interface{}{
		"size": info.Size(),
		"isDir": info.IsDir(),
		"mtime": info.ModTime(),
	}

	_ = json.NewEncoder(w).Encode(resp)
}