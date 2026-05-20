// Dev container orchestrator. Pure compose-generator + TF seed + env
// file emitter — does NOT launch any host app (next dev, astro dev,
// etc.). A menu-team dev shouldn't have to install Bun/Astro just to
// have this script able to run house, and vice versa. Each product
// owns its own `bun run dev` and runs it from its product dir AFTER
// `just dev`.
//
// Same shape as prod: shared infra (postgres, localstack, zitadel,
// openobserve) sits at `infra/dev/`. Products (`menu`, `house`) are
// listed in the service graph as consumer presets — picking one
// expands to the union of infra it depends on.
//
// Default: bring up everything — `just dev`.
//
// Subset selection (deps auto-resolved):
//   just dev -i                  interactive TUI per category
//   just dev --only menu         everything menu needs (postgres + zitadel + ...)
//   just dev --only zitadel      zitadel + postgres only
//   just dev --except openobserve  everything else, deps preserved unless blocked
//
// When the user opts out of zitadel, dev.go does NOT write
// `products/menu/.env.local` — they're responsible for hand-providing
// those keys (or pointing them at an alternate IdP).
//
// Stdlib only except for `github.com/charmbracelet/huh` (one Charm dep
// for the grouped multi-select TUI). go.mod committed.

package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/huh"
)

// ── Service graph ───────────────────────────────────────────────────────────

type category string

const (
	catInfra    category = "infra"
	catProducts category = "products"
)

type service struct {
	name        string   // selection key + label
	composeName []string // docker-compose service names; empty for host-run apps
	deps        []string // transitive selection deps (other service.name values)
	cat         category
}

// Ordered for deterministic UI rendering.
//
// Products are presets — selecting one expands to the infra services
// it depends on. They have no compose entries of their own (the host
// app is launched by the product's own `bun run dev`, separately).
var allServices = []service{
	{name: "postgres", composeName: []string{"postgres"}, cat: catInfra},
	{name: "localstack", composeName: []string{"localstack"}, cat: catInfra},
	{name: "zitadel", composeName: []string{"zitadel", "zitadel-login"}, deps: []string{"postgres"}, cat: catInfra},
	{name: "openobserve", composeName: []string{"openobserve"}, deps: []string{"localstack"}, cat: catInfra},
	{name: "menu", deps: []string{"postgres", "localstack", "zitadel", "openobserve"}, cat: catProducts},
	// House is a static Astro site — no docker dependencies. Listed so
	// the TUI shows it in the products group; selecting it alone is a
	// no-op orchestration-wise (the dev still runs `cd products/house
	// && bun run dev` from their own terminal).
	{name: "house", deps: []string{}, cat: catProducts},
}

func serviceByName(n string) (service, bool) {
	for _, s := range allServices {
		if s.name == n {
			return s, true
		}
	}
	return service{}, false
}

func defaultSelection() []string {
	out := make([]string, 0, len(allServices))
	for _, s := range allServices {
		out = append(out, s.name)
	}
	return out
}

// expandDeps closes `selected` over `service.deps`. Result is sorted.
func expandDeps(selected []string) []string {
	set := map[string]bool{}
	var dfs func(string)
	dfs = func(n string) {
		if set[n] {
			return
		}
		set[n] = true
		s, ok := serviceByName(n)
		if !ok {
			fail("unknown service %q", n)
		}
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
	sort.Strings(out)
	return out
}

// composeServiceNames maps the selection to docker-compose service names.
// Skips entries with no compose presence (e.g. menu — host-run via Next).
func composeServiceNames(selected []string) []string {
	out := []string{}
	for _, n := range selected {
		s, _ := serviceByName(n)
		out = append(out, s.composeName...)
	}
	sort.Strings(out)
	return out
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// ── Main ─────────────────────────────────────────────────────────────────────

func main() {
	interactive := flag.Bool("i", false, "interactive selection (TUI per category)")
	flag.BoolVar(interactive, "interactive", false, "alias for -i")
	only := flag.String("only", "", "comma-separated services to start (+ their deps); skips everything else")
	except := flag.String("except", "", "comma-separated services to skip; everything else (+ their deps) starts")
	flag.Parse()

	selected, err := resolveSelection(*interactive, *only, *except)
	if err != nil {
		fail("%v", err)
	}
	selected = expandDeps(selected)
	// `--except` must win over dep-expansion: a user saying
	// `--except openobserve` doesn't want it back through menu's deps.
	// The menu app boots either way — when OTLP_ENDPOINT can't reach
	// the collector, the observability SDK degrades to a no-op silently.
	if *except != "" {
		blocked := map[string]bool{}
		for _, n := range splitCSV(*except) {
			blocked[n] = true
		}
		filtered := selected[:0]
		for _, n := range selected {
			if !blocked[n] {
				filtered = append(filtered, n)
			}
		}
		selected = filtered
	}
	if len(selected) == 0 {
		fail("empty selection — pick at least one service")
	}

	repoRoot := findRepoRoot()
	devInfraDir := filepath.Join(repoRoot, "infra/dev")
	devTofuDir := filepath.Join(repoRoot, "infra/dev/tofu")
	menuDir := filepath.Join(repoRoot, "products/menu")

	fmt.Printf("[dev] selection: %s\n", strings.Join(selected, ", "))

	composeServices := composeServiceNames(selected)
	if len(composeServices) > 0 {
		step(1, "docker compose up -d --wait")
		args := append([]string{"compose", "up", "-d", "--wait"}, composeServices...)
		runIn(devInfraDir, "docker", args...)
	} else {
		fmt.Println("[dev] no docker services in this selection — skipping compose")
	}

	// Zitadel-bound steps. Skip when the user opted out — they're
	// responsible for providing the dynamic Zitadel keys in
	// products/menu/.env.local (or hitting a remote IdP).
	if contains(selected, "zitadel") {
		step(2, "waiting for .zitadel-bootstrap/menu-sa.pat")
		patPath := filepath.Join(devInfraDir, ".zitadel-bootstrap/menu-sa.pat")
		if err := waitForFile(patPath, 60*time.Second); err != nil {
			fail("%v\nhint: docker compose -f infra/dev/docker-compose.yml logs zitadel", err)
		}
		patBytes, _ := os.ReadFile(patPath)
		pat := strings.TrimSpace(string(patBytes))

		step(3, "tofu apply (seed Zitadel + emit env files)")
		runIn(devTofuDir, "tofu", "init", "-upgrade", "-input=false")
		runIn(devTofuDir, "tofu", "apply", "-auto-approve", "-input=false", "-var", "zitadel_pat="+pat)

		step(4, "write products/menu/{.env,.env.local}")
		writeEnvFile(filepath.Join(menuDir, ".env"),
			captureIn(devTofuDir, "tofu", "output", "-raw", "env_committable_file"),
			false, 0o644)
		writeEnvFile(filepath.Join(menuDir, ".env.local"),
			captureIn(devTofuDir, "tofu", "output", "-raw", "env_dynamic_file"),
			true, 0o600)
	} else if contains(selected, "menu") {
		warn("zitadel opted out — products/menu/.env.local is NOT updated. Make sure ZITADEL_OAUTH_CLIENT_ID/SECRET/MANAGEMENT_TOKEN point at a real IdP, or auth flows will 500.")
	}

	printNextSteps(selected)
}

// printNextSteps tells the user how to launch the host apps for the
// products they selected. The orchestrator never runs them directly —
// each product owns its own `bun run dev` and the dev launches it
// from a separate terminal.
func printNextSteps(selected []string) {
	fmt.Println()
	fmt.Println("[dev] infra is up. Next:")
	if contains(selected, "menu") {
		fmt.Println("  cd products/menu  && bun run dev   # Next.js on :3000")
	}
	if contains(selected, "house") {
		fmt.Println("  cd products/house && bun run dev   # Astro on :3002")
	}
	if !contains(selected, "menu") && !contains(selected, "house") {
		fmt.Println("  (no product selected — compose stack stays running for ad-hoc work)")
	}
}

// ── Selection: flags + interactive ──────────────────────────────────────────

func resolveSelection(interactive bool, only, except string) ([]string, error) {
	if interactive {
		return runTUI()
	}
	if only != "" && except != "" {
		return nil, fmt.Errorf("--only and --except are mutually exclusive")
	}
	if only != "" {
		return splitCSV(only), nil
	}
	if except != "" {
		excluded := map[string]bool{}
		for _, n := range splitCSV(except) {
			excluded[n] = true
		}
		out := []string{}
		for _, s := range allServices {
			if !excluded[s.name] {
				out = append(out, s.name)
			}
		}
		return out, nil
	}
	return defaultSelection(), nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// runTUI presents a per-category multi-select. Returns the selection
// the user confirmed (Enter on the last group).
func runTUI() ([]string, error) {
	groups := map[category][]huh.Option[string]{}
	for _, s := range allServices {
		groups[s.cat] = append(groups[s.cat], huh.NewOption(s.name, s.name).Selected(true))
	}

	var infraSelected, productsSelected []string
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewMultiSelect[string]().
				Title("infra").
				Description("Backing services. Postgres + LocalStack required for any menu use; Zitadel optional if pointing at a remote IdP; OpenObserve optional.").
				Options(groups[catInfra]...).
				Value(&infraSelected),
		),
		huh.NewGroup(
			huh.NewMultiSelect[string]().
				Title("products").
				Description("Host-run apps. Menu boots Next.js after the infra it depends on is up.").
				Options(groups[catProducts]...).
				Value(&productsSelected),
		),
	)
	if err := form.Run(); err != nil {
		return nil, err
	}
	return append(infraSelected, productsSelected...), nil
}

// ── File helpers ─────────────────────────────────────────────────────────────

func writeEnvFile(path, body string, dynamic bool, mode os.FileMode) {
	header := envHeader(dynamic)
	if err := os.WriteFile(path, []byte(header+body+"\n"), mode); err != nil {
		fail("write %s: %v", path, err)
	}
}

func envHeader(dynamic bool) string {
	if dynamic {
		return "# AUTO-GENERATED by `bun run dev` (infra/modules/menu_env).\n" +
			"# Holds the dynamic dev secrets (Zitadel client + session key) —\n" +
			"# rewritten on every run. Hand-edits survive until the next run;\n" +
			"# permanent overrides go in `.env` (committed).\n\n"
	}
	return "# AUTO-GENERATED by `bun run dev` (infra/modules/menu_env).\n" +
		"# Static dev defaults + Zod-valid placeholders for the dynamic keys.\n" +
		"# Real values for the dynamic keys live in `.env.local` (gitignored,\n" +
		"# regenerated by every `bun run dev`).\n" +
		"# Commit changes here when the env schema evolves.\n\n"
}

// ── Process helpers ──────────────────────────────────────────────────────────

func findRepoRoot() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		fail("runtime.Caller failed")
	}
	// <repo>/infra/dev/dev.go → two levels up.
	return filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
}

func step(n int, msg string) {
	fmt.Printf("[dev] %d/4  %s\n", n, msg)
}

func warn(msg string) {
	fmt.Fprintf(os.Stderr, "[dev] WARN: %s\n", msg)
}

func runIn(dir, name string, args ...string) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fail("%s %v: %v", name, args, err)
	}
}

func captureIn(dir, name string, args ...string) string {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		fail("%s %v: %v", name, args, err)
	}
	return strings.TrimSpace(string(out))
}

func waitForFile(path string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		info, err := os.Stat(path)
		if err == nil && info.Size() > 0 {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timed out after %s waiting for %s", timeout, path)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[dev] "+format+"\n", args...)
	os.Exit(1)
}
