// bench-go — in-process throughput benchmark for validator-go.
//
// Mirrors bench-js.js / bench-php.php: parse the spec once via the same
// validator.ParseSpec the CLI uses, build the Validator once per spec, then
// loop Validate(input) N times. Binary startup, spec parse, and fixture I/O
// all happen BEFORE timing — the measured window is Validate-only.
//
// stdout: one JSON line per spec (same shape as the other drivers).
//
// Run via `go run .` from tools/bench/go (its own module with a replace
// directive to the local packages/validator-go). Flags: --iters, --warmup,
// --spec.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	validator "github.com/crudui/crudui/packages/validator-go/validator/legacy"
)

type report struct {
	Lang   string  `json:"lang"`
	Spec   string  `json:"spec"`
	Iters  int     `json:"iters"`
	Ms     float64 `json:"ms"`
	OpsSec int64   `json:"opsSec"`
	AvgUs  float64 `json:"avgUs"`
	Valid  bool    `json:"valid"`
	Error  *string `json:"error"`
	Field  *string `json:"field"`
}

// convertInput mirrors cmd/validate/main.go: a group spec receives the input
// object as-is; everything else is wrapped under "value".
func convertInput(isGroup bool, input interface{}) map[string]interface{} {
	if isGroup {
		if m, ok := input.(map[string]interface{}); ok {
			return m
		}
		return make(map[string]interface{})
	}
	if s, ok := input.(string); ok && s == "__undefined__" {
		return map[string]interface{}{"value": nil}
	}
	return map[string]interface{}{"value": input}
}

func loadFixture(dir, name string) (validator.ParsedSpec, map[string]interface{}) {
	specBytes, err := os.ReadFile(filepath.Join(dir, name+".spec.json"))
	if err != nil {
		panic(err)
	}
	parsed, err := validator.ParseSpec(specBytes)
	if err != nil {
		panic(err)
	}

	inputBytes, err := os.ReadFile(filepath.Join(dir, name+".input.json"))
	if err != nil {
		panic(err)
	}
	var rawInput interface{}
	if err := json.Unmarshal(inputBytes, &rawInput); err != nil {
		panic(err)
	}
	return parsed, convertInput(parsed.IsGroup, rawInput)
}

func benchSpec(dir, name string, iters, warmup int) report {
	parsed, input := loadFixture(dir, name)

	// Build the validator once; reuse across iterations.
	v := validator.NewValidator(parsed.Spec)

	// Warmup.
	for i := 0; i < warmup; i++ {
		v.Validate(input)
	}

	start := time.Now()
	for i := 0; i < iters; i++ {
		v.Validate(input)
	}
	elapsed := time.Since(start)

	ns := float64(elapsed.Nanoseconds())
	ms := ns / 1e6
	opsSec := int64((float64(iters) / ns) * 1e9)
	avgUs := ns / 1000.0 / float64(iters)

	result := v.Validate(input)
	var errPtr, fieldPtr *string
	if !result.IsValid && len(result.Errors) > 0 {
		r := result.Errors[0].Rule
		f := result.Errors[0].Field
		errPtr = &r
		fieldPtr = &f
	}

	return report{
		Lang:   "go",
		Spec:   name,
		Iters:  iters,
		Ms:     round3(ms),
		OpsSec: opsSec,
		AvgUs:  round4(avgUs),
		Valid:  result.IsValid,
		Error:  errPtr,
		Field:  fieldPtr,
	}
}

func round3(f float64) float64 { return float64(int64(f*1000+0.5)) / 1000 }
func round4(f float64) float64 { return float64(int64(f*10000+0.5)) / 10000 }

func main() {
	iters := flag.Int("iters", 50000, "measured iterations")
	warmup := flag.Int("warmup", 5000, "warmup iterations")
	spec := flag.String("spec", "", "single spec name (default: contact + large-form)")
	fixtures := flag.String("fixtures", "../fixtures", "path to the fixtures directory")
	flag.Parse()

	dir := *fixtures

	specs := []string{"contact", "large-form"}
	if *spec != "" {
		specs = []string{*spec}
	}

	for _, name := range specs {
		r := benchSpec(dir, name, *iters, *warmup)
		out, _ := json.Marshal(r)
		fmt.Println(string(out))
	}
}
