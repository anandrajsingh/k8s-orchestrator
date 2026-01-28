package filesystem

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Filesystem struct{
	root string
}

func New(root string) *Filesystem{
	return &Filesystem{root: root}
}

func (fs *Filesystem) resolve(userpath string) (string, error){
	if(filepath.IsAbs(userpath)){
		return "", errors.New("absolute path not allowed")
	}
	clean := filepath.Clean(userpath)
	full := filepath.Join(fs.root, clean)

	rootWithSep := fs.root
	if !strings.HasSuffix(rootWithSep, string(os.PathSeparator)){
		rootWithSep += string(os.PathSeparator)
	}

	if !strings.HasPrefix(full, rootWithSep){
		return "", errors.New("path escapes process root")
	}
	return full , nil
}

func(fs *Filesystem) ReadFile(p string) ([]byte, error){
	full, err := fs.resolve(p)
	if err != nil{
		return nil, err
	}
	return os.ReadFile(full)
}

func(fs *Filesystem) WriteFile(p string, data []byte) error{
	full, err := fs.resolve(p)
	if err != nil{
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil{
		return err
	}
	return os.WriteFile(full, data, 0644)
}

func(fs *Filesystem) ListDir(p string) ([]string, error){
	full, err := fs.resolve(p)
	if err != nil{
		return nil, err
	}
	entries, err := os.ReadDir(full)
	if err != nil{
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _,e := range entries {
		names = append(names, e.Name())
	}
	return names, nil
}

func (fs *Filesystem) Stat(p string)(os.FileInfo, error){
	full, err := fs.resolve(p)
	if err != nil{
		return nil, err
	}
	return os.Stat(full)
}