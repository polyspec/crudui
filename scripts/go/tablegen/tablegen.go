// Package tablegen holds the shared steps of the Go table generators: read a JSON contract of contracts/ and write the
// formatted Go source that a generator builds from it.
package tablegen

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
)

// Run parses the flags -contract and -out of a generator, reads the contract into contract and returns the output path.
// A generator that fails reports through Fail with its own name.
func Run(program string, contract any) (output string) {
	path := flag.String("contract", "", "the JSON contract to read")
	out := flag.String("out", "", "the Go file to write")
	flag.Parse()
	if *path == "" || *out == "" {
		Fail(program, fmt.Errorf("usage: %s -contract <file> -out <file>", program))
	}
	raw, err := os.ReadFile(*path)
	if err != nil {
		Fail(program, err)
	}
	if err := json.Unmarshal(raw, contract); err != nil {
		Fail(program, err)
	}
	return *out
}

// WriteSource formats the Go source in b and writes it to the file.
func WriteSource(program string, b *bytes.Buffer, file string) {
	source, err := format.Source(b.Bytes())
	if err != nil {
		Fail(program, err)
	}
	if err := os.WriteFile(file, source, 0o644); err != nil {
		Fail(program, err)
	}
}

// Fail reports an error of the generator and exits.
func Fail(program string, err error) {
	fmt.Fprintln(os.Stderr, program+":", err)
	os.Exit(1)
}
