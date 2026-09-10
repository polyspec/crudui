package main

import (
	"go/ast"
	goparser "go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// TestDocCoverage requires a doc comment on every top-level function in the
// go-api example, including unexported helpers and route handler methods.
//
// The library check requires comments only for exported symbols. This example
// server checks every function. Struct type comments are outside this check.
//
// The check uses go/ast and needs no external tooling, so it is deterministic
// and dependency-free.
func TestDocCoverage(t *testing.T) {
	fset := token.NewFileSet()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}

	var undocumented []string

	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		f, err := goparser.ParseFile(fset, file, src, goparser.ParseComments)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}

		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			name := fn.Name.Name
			if fn.Recv != nil && len(fn.Recv.List) > 0 {
				name = receiverName(fn.Recv.List[0].Type) + "." + name
			}
			if fn.Doc == nil || strings.TrimSpace(fn.Doc.Text()) == "" {
				undocumented = append(undocumented, file+": func "+name)
			}
		}
	}

	if len(undocumented) > 0 {
		sort.Strings(undocumented)
		t.Errorf("doc-coverage: %d func declaration(s) lack a doc comment:\n  %s",
			len(undocumented), strings.Join(undocumented, "\n  "))
	}
}

// receiverName extracts the base type name from a method receiver expression
// (handling both value and pointer receivers).
func receiverName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.StarExpr:
		return receiverName(t.X)
	case *ast.Ident:
		return t.Name
	case *ast.IndexExpr:
		return receiverName(t.X)
	default:
		return "?"
	}
}
