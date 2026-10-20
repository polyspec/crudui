package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestLoadFixtureReturnsWrongInputs checks that a fixture which is not valid JSON, or a spec which is not a
// JSON object, is returned as an error rather than panicking.
func TestLoadFixtureReturnsWrongInputs(t *testing.T) {
	cases := map[string]struct {
		spec, input string
		wantError   bool
	}{
		"spec is valid":     {`{"properties":{}}`, `{}`, false},
		"spec is not JSON":  {`{`, `{}`, true},
		"spec is an array":  {`[]`, `{}`, true},
		"input is not JSON": {`{"properties":{}}`, `{`, true},
	}
	for name, item := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "case.spec.json"), []byte(item.spec), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "case.input.json"), []byte(item.input), 0600); err != nil {
				t.Fatal(err)
			}
			_, _, err := loadFixture(dir, "case")
			if (err != nil) != item.wantError {
				t.Fatalf("loadFixture error = %v, want error: %v", err, item.wantError)
			}
		})
	}
}
