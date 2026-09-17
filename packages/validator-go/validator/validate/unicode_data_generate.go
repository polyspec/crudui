//go:build ignore

// Command unicode_data_generate writes unicode_data.go from
// contracts/unicode-properties.json, the Unicode data every CRUDUI runtime embeds.
// Run it with `go generate` in this directory.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
)

// contractPath is the Unicode data contract relative to this directory.
var contractPath = filepath.Join("..", "..", "..", "..", "contracts", "unicode-properties.json")

// contract is the part of the contract the validator embeds.
type contract struct {
	UnicodeVersion    string              `json:"unicodeVersion"`
	WhiteSpace        [][2]int            `json:"whiteSpace"`
	GeneralCategories map[string][][2]int `json:"generalCategories"`
	Scripts           map[string][][2]int `json:"scripts"`
}

func main() {
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		fail(err)
	}
	var data contract
	if err := json.Unmarshal(raw, &data); err != nil {
		fail(err)
	}
	var b bytes.Buffer
	b.WriteString("// Code generated from contracts/unicode-properties.json by `go generate` (unicode_data_generate.go). DO NOT EDIT.\n\n")
	b.WriteString("package validate\n\n")
	fmt.Fprintf(&b, "// unicodeDataVersion is the Unicode version of the embedded data.\nconst unicodeDataVersion = %q\n\n", data.UnicodeVersion)
	b.WriteString("// unicodeWhiteSpace lists the White_Space code points as inclusive ranges.\nvar unicodeWhiteSpace = []codeRange{\n")
	writeRanges(&b, data.WhiteSpace)
	b.WriteString("}\n\n")
	b.WriteString("// unicodeGeneralCategories maps each general category of the pattern language to its inclusive ranges.\nvar unicodeGeneralCategories = map[string][]codeRange{\n")
	writeMap(&b, data.GeneralCategories)
	b.WriteString("}\n\n")
	b.WriteString("// unicodeScripts maps each script (Script property) to its inclusive ranges.\nvar unicodeScripts = map[string][]codeRange{\n")
	writeMap(&b, data.Scripts)
	b.WriteString("}\n")
	source, err := format.Source(b.Bytes())
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile("unicode_data.go", source, 0o644); err != nil {
		fail(err)
	}
}

// writeMap writes named range lists in name order.
func writeMap(b *bytes.Buffer, m map[string][][2]int) {
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		fmt.Fprintf(b, "%q: {\n", name)
		writeRanges(b, m[name])
		b.WriteString("},\n")
	}
}

// writeRanges writes ranges, eight to a line.
func writeRanges(b *bytes.Buffer, ranges [][2]int) {
	for i, r := range ranges {
		fmt.Fprintf(b, "{0x%X, 0x%X},", r[0], r[1])
		if i%8 == 7 || i == len(ranges)-1 {
			b.WriteByte('\n')
		} else {
			b.WriteByte(' ')
		}
	}
}

// fail reports an error and exits.
func fail(err error) {
	fmt.Fprintln(os.Stderr, "unicode_data_generate:", err)
	os.Exit(1)
}
