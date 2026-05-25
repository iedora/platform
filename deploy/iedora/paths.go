package main

import (
	"os"
	"path/filepath"
)

// infraDir returns the absolute path to `infra/`. We need this to call
// `tofu -chdir=tofu …` regardless of where the binary was invoked from.
// Resolution strategy, in order:
//
//  1. INFRA_DIR env var (highest precedence — CI uses this).
//  2. cwd contains `infra/tofu/` → cwd + "infra" (running from repo root,
//     which is how `bin/iedora` invokes us via `go run -C $REPO_ROOT`).
//  3. cwd IS `infra/` (legacy path: anything that pre-cd's into infra).
//  4. Walk up from the executable looking for an `infra/tofu/` descendant.
//
// Falls back to "infra" so tofu emits a clear chdir error.
func infraDir() string {
	if d := os.Getenv("INFRA_DIR"); d != "" {
		return d
	}
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(filepath.Join(cwd, "infra", "tofu")); err == nil {
			return filepath.Join(cwd, "infra")
		}
		if _, err := os.Stat(filepath.Join(cwd, "tofu")); err == nil {
			return cwd
		}
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for i := 0; i < 6; i++ {
			if _, err := os.Stat(filepath.Join(dir, "infra", "tofu")); err == nil {
				return filepath.Join(dir, "infra")
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return "infra"
}

// repoRoot is `<infraDir>/..` — the home of `bin/`, `app-state/`, etc.
func repoRoot() string { return filepath.Dir(infraDir()) }
