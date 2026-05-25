package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/eduvhc/iedora/infra/internal/mode"
)

// TestReconcileModeFlags pins the four-cell truth table that bridges the
// legacy --no-bws bool to the new --mode flag. The deprecation warning
// is part of the contract — the dev orchestrator's migration relies on
// the warning surfacing during the cross-PR overlap.
func TestReconcileModeFlags(t *testing.T) {
	cases := []struct {
		name         string
		modeStr      string
		noBWS        bool
		modeExplicit bool
		want         mode.Mode
		wantWarn     bool
		wantErr      string // substring; "" means no error
	}{
		{
			name:    "default — both unset means live",
			modeStr: "live", noBWS: false, modeExplicit: false,
			want: mode.Live,
		},
		{
			name:    "--mode local (no --no-bws)",
			modeStr: "local", noBWS: false, modeExplicit: true,
			want: mode.Local,
		},
		{
			name:    "--no-bws alone — deprecated path, coerces to local + warns",
			modeStr: "live", noBWS: true, modeExplicit: false,
			want: mode.Local, wantWarn: true,
		},
		{
			name:    "--no-bws + --mode local — same intent, no warning",
			modeStr: "local", noBWS: true, modeExplicit: true,
			want: mode.Local, wantWarn: false,
		},
		{
			name:    "--no-bws + --mode live — contradictory, error",
			modeStr: "live", noBWS: true, modeExplicit: true,
			wantErr: "cannot be combined",
		},
		{
			name:    "--mode garbage rejected by mode.Resolve",
			modeStr: "staging", noBWS: false, modeExplicit: true,
			wantErr: "not a valid mode",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := stderr
			stderr = &buf
			defer func() { stderr = prev }()

			got, err := reconcileModeFlags(tc.modeStr, tc.noBWS, tc.modeExplicit)
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("err = nil, want substring %q", tc.wantErr)
				}
				if !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %q, want substring %q", err.Error(), tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("err = %v, want nil", err)
			}
			if got != tc.want {
				t.Fatalf("mode = %q, want %q", got, tc.want)
			}
			gotWarn := strings.Contains(buf.String(), "deprecated")
			if gotWarn != tc.wantWarn {
				t.Fatalf("warning emitted = %v, want %v (stderr = %q)", gotWarn, tc.wantWarn, buf.String())
			}
		})
	}
}

func TestModeFlagExplicit(t *testing.T) {
	cases := []struct {
		argv []string
		want bool
	}{
		{nil, false},
		{[]string{"--grants-only"}, false},
		{[]string{"--mode", "local"}, true},
		{[]string{"-mode", "live"}, true},
		{[]string{"--mode=local"}, true},
		{[]string{"-mode=live"}, true},
		{[]string{"--no-bws"}, false},
		{[]string{"--", "--mode", "local"}, false}, // after `--`, args are positional
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.argv, " "), func(t *testing.T) {
			if got := modeFlagExplicit(tc.argv); got != tc.want {
				t.Fatalf("modeFlagExplicit(%v) = %v, want %v", tc.argv, got, tc.want)
			}
		})
	}
}
