package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ── constants ────────────────────────────────────────────────────────────────

const (
	logPrefix   = "[local]"
	envFileMode = 0o600
)

// ── service catalog ──────────────────────────────────────────────────────────
//
// Each entry is one compose profile. `envKeys` is the menu env keys
// the service provides — when the service is in --except, those keys
// land in .env.local as `<please_fill>` so the operator points them
// at a remote URL (homelab tunnel, prod, etc).
//
// `deps` mirrors compose's depends_on so --only behaves like the dev
// stack used to: selecting a leaf brings its prereqs along.

type service struct {
	name    string
	deps    []string
	envKeys []string
}

var allServices = []service{
	{name: "postgres", envKeys: []string{"DATABASE_URL", "CORE_DATABASE_URL"}},
	{name: "localstack", envKeys: []string{"S3_ENDPOINT", "S3_PUBLIC_URL"}},
	{name: "openobserve", deps: []string{"localstack"}, envKeys: []string{"OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS"}},
	// menu pulls in every infra service it consumes.
	{name: "menu", deps: []string{"postgres", "localstack", "openobserve"}},
}

func serviceNames() []string {
	out := make([]string, len(allServices))
	for i, s := range allServices {
		out[i] = s.name
	}
	return out
}

// expandDeps closes selected over service.deps.
func expandDeps(selected []string) []string {
	byName := map[string]service{}
	for _, s := range allServices {
		byName[s.name] = s
	}
	set := map[string]bool{}
	var dfs func(string)
	dfs = func(n string) {
		if set[n] {
			return
		}
		s, ok := byName[n]
		if !ok {
			fail("unknown service %q (known: %v)", n, serviceNames())
		}
		set[n] = true
		for _, d := range s.deps {
			dfs(d)
		}
	}
	for _, n := range selected {
		dfs(n)
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return sortedUnique(out)
}

// excludedEnvKeys returns env keys whose providing service is NOT in
// selected. Feeds the `<please_fill>` placeholder mechanism.
func excludedEnvKeys(selected []string) []string {
	var out []string
	for _, s := range allServices {
		if len(s.envKeys) == 0 || contains(selected, s.name) {
			continue
		}
		out = append(out, s.envKeys...)
	}
	return out
}

func withoutMenu(selected []string) []string {
	out := make([]string, 0, len(selected))
	for _, s := range selected {
		if s != "menu" {
			out = append(out, s)
		}
	}
	return out
}

// ── CLI ──────────────────────────────────────────────────────────────────────

type cliArgs struct {
	only    string
	except  string
	destroy bool
	resetDB string
}

func parseFlags() cliArgs {
	var a cliArgs
	flag.StringVar(&a.only, "only", "", "comma-separated services to start (+ deps)")
	flag.StringVar(&a.except, "except", "", "comma-separated services to skip; everything else starts")
	flag.BoolVar(&a.destroy, "destroy", false, "tear down: `docker compose down -v` + wipe .env.local")
	flag.StringVar(&a.resetDB, "reset-db", "", "drop+recreate one database (`menu` or `core`) without touching the rest")
	flag.Parse()
	if a.only != "" && a.except != "" {
		fail("--only and --except are mutually exclusive")
	}
	return a
}

func (a cliArgs) resolveSelection() ([]string, error) {
	if a.only != "" {
		return expandDeps(splitCSV(a.only)), nil
	}
	picked := serviceNames()
	if a.except != "" {
		skip := map[string]bool{}
		for _, n := range splitCSV(a.except) {
			if _, ok := serviceByName(n); !ok {
				return nil, fmt.Errorf("--except: unknown service %q (known: %v)", n, serviceNames())
			}
			skip[n] = true
		}
		picked = filterOut(picked, skip)
	}
	return expandDeps(picked), nil
}

func serviceByName(n string) (service, bool) {
	for _, s := range allServices {
		if s.name == n {
			return s, true
		}
	}
	return service{}, false
}

// ── docker compose helpers ───────────────────────────────────────────────────

func composeUp(ctx context.Context, composeDir string, profiles []string) {
	args := []string{"compose"}
	for _, p := range profiles {
		args = append(args, "--profile", p)
	}
	args = append(args, "up", "-d", "--wait")
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = composeDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fail("docker compose up: %v", err)
	}
}

func composeDown(ctx context.Context, composeDir string) {
	cmd := exec.CommandContext(ctx, "docker", "compose", "--profile", "*", "down", "-v", "--remove-orphans")
	cmd.Dir = composeDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run() // best-effort
}

// ── teardown + reset ─────────────────────────────────────────────────────────

func runDestroy(ctx context.Context, composeDir, envLocalPath string) {
	step(1, "docker compose down -v --remove-orphans")
	composeDown(ctx, composeDir)

	step(2, "wipe .env.local")
	_ = os.Remove(envLocalPath)
	fmt.Printf("%s ✓ destroyed\n", logPrefix)
}

func runResetDB(ctx context.Context, dbName string) {
	switch dbName {
	case "menu":
		fmt.Printf("%s reset-db: dropping + recreating menu\n", logPrefix)
		execPsql(ctx, `DROP DATABASE IF EXISTS menu;`)
		execPsql(ctx, `CREATE DATABASE menu;`)
	case "core":
		fmt.Printf("%s reset-db: dropping + recreating core\n", logPrefix)
		execPsql(ctx, `DROP DATABASE IF EXISTS core;`)
		execPsql(ctx, `CREATE DATABASE core;`)
		fmt.Printf("%s ✓ re-run go run ./dev/cmd/local-stack to re-apply auth migrations\n", logPrefix)
	default:
		fail("--reset-db: unknown db %q (want `menu` or `core`)", dbName)
	}
}

func execPsql(ctx context.Context, sql string) {
	cmd := exec.CommandContext(ctx, "docker", "exec", "-i", "infra-postgres",
		"psql", "-U", "postgres", "-d", "postgres", "-c", sql)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fail("psql: %v", err)
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func step(n int, label string) {
	fmt.Printf("%s [%d] %s\n", logPrefix, n, label)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "%s ✗ "+format+"\n", append([]any{logPrefix}, args...)...)
	os.Exit(1)
}

func printNextSteps(selected []string) {
	fmt.Printf("\n%s ✓ local stack ready\n", logPrefix)
	if contains(selected, "menu") {
		fmt.Printf("  → menu     http://localhost:3000\n")
	} else {
		fmt.Printf("  → menu     not in selection (HMR path: cd products/menu && bun run dev)\n")
	}
	if contains(selected, "openobserve") {
		fmt.Printf("  → o2       http://localhost:5080  (dev@iedora.local / Password1!)\n")
	}
}

func findRepoRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		fail("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			fail("findRepoRoot: no .git ancestor of %s", dir)
		}
		dir = parent
	}
}

func splitCSV(s string) []string {
	var out []string
	for _, t := range strings.Split(s, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func filterOut(haystack []string, skip map[string]bool) []string {
	out := make([]string, 0, len(haystack))
	for _, h := range haystack {
		if !skip[h] {
			out = append(out, h)
		}
	}
	return out
}

func sortedUnique(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1] > out[j]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}
