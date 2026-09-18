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
// --spec, --fixtures. The counts follow the rule of ../arguments.js.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"time"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	validator "github.com/polyspec/crudui/packages/validator-go/validator/validate"
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

// convertInput mirrors the cross-check console's Go validator process: a group spec receives the input
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

func loadFixture(dir, name string) (*compose.OMap, map[string]interface{}) {
	specBytes, err := os.ReadFile(filepath.Join(dir, name+".spec.json"))
	if err != nil {
		panic(err)
	}
	specAny, err := compose.DecodeOrdered(specBytes)
	if err != nil {
		panic(err)
	}
	spec := specAny.(*compose.OMap)

	inputBytes, err := os.ReadFile(filepath.Join(dir, name+".input.json"))
	if err != nil {
		panic(err)
	}
	var rawInput interface{}
	if err := json.Unmarshal(inputBytes, &rawInput); err != nil {
		panic(err)
	}
	return spec, convertInput(true, rawInput)
}

func benchSpec(dir, name string, iters, warmup int) report {
	spec, input := loadFixture(dir, name)

	// Build the validator once; reuse across iterations.
	properties, _ := spec.Get("properties")
	v, err := validator.NewValidator(properties.(*compose.OMap))
	if err != nil {
		panic(err)
	}

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

	result, err := v.Validate(input)
	if err != nil {
		panic(err)
	}
	var errPtr, fieldPtr *string
	if !result.Valid && len(result.Errors) > 0 {
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
		Valid:  result.Valid,
		Error:  errPtr,
		Field:  fieldPtr,
	}
}

func round3(f float64) float64 { return float64(int64(f*1000+0.5)) / 1000 }
func round4(f float64) float64 { return float64(int64(f*10000+0.5)) / 10000 }

const maxCount = 10000000

var countPattern = regexp.MustCompile(`^[0-9]{1,8}$`)

// countArgument returns the count a flag names, or exits with the shared message (../arguments.js).
func countArgument(flag string, args []string, index int) int {
	minimum := 0
	if flag == "--iters" {
		minimum = 1
	}
	if index < len(args) && countPattern.MatchString(args[index]) {
		if n, err := strconv.Atoi(args[index]); err == nil && n >= minimum && n <= maxCount {
			return n
		}
	}
	fmt.Fprintf(os.Stderr, "%s must be a whole number from %d to %d\n", flag, minimum, maxCount)
	os.Exit(2)
	return 0
}

func main() {
	iters, warmup, spec, dir := 50000, 5000, "", "../fixtures"
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--iters":
			i++
			iters = countArgument("--iters", args, i)
		case "--warmup":
			i++
			warmup = countArgument("--warmup", args, i)
		case "--spec":
			i++
			if i < len(args) {
				spec = args[i]
			}
		case "--fixtures":
			i++
			if i < len(args) {
				dir = args[i]
			}
		}
	}

	specs := []string{"contact", "large"}
	if spec != "" {
		specs = []string{spec}
	}

	for _, name := range specs {
		r := benchSpec(dir, name, iters, warmup)
		out, _ := json.Marshal(r)
		fmt.Println(string(out))
	}
}
