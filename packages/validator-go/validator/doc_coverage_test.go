package validator

import (
	"go/ast"
	goparser "go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// TestSchemaDocCoverage enforces that every exported top-level declaration across
// the whole validator/model tree (functions, methods, types, and exported
// const/var) carries a doc comment. It is the model arm of the cross-language
// doc-coverage gate: adding an undocumented exported symbol anywhere under
// validator/model — the root model package or any subpackage (validate, compose,
// expr) — turns this test RED.
//
// The legacy gate (validator/doc_coverage_test.go) globs only its own directory,
// so it never sees model. This test closes that hole. It walks the entire model
// subtree recursively from this package's directory rather than a flat glob,
// because model spans several subpackages and each must be covered. The check uses
// go/ast and needs no external tooling, so it is deterministic and
// dependency-free.
//
// Scope follows Go convention: top-level exported declarations must be
// documented. Struct fields and interface methods are not individually required
// (documenting the enclosing type is sufficient), matching golint/revive
// behavior.
func TestSchemaDocCoverage(t *testing.T) {
	fset := token.NewFileSet()

	var files []string
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("doc-coverage: no model source files found")
	}

	var undocumented []string

	for _, file := range files {
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		f, err := goparser.ParseFile(fset, file, src, goparser.ParseComments)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}

		for _, decl := range f.Decls {
			switch d := decl.(type) {
			case *ast.FuncDecl:
				if !d.Name.IsExported() {
					continue
				}
				name := d.Name.Name
				if d.Recv != nil && len(d.Recv.List) > 0 {
					name = receiverName(d.Recv.List[0].Type) + "." + name
				}
				if d.Doc == nil || strings.TrimSpace(d.Doc.Text()) == "" {
					undocumented = append(undocumented, file+": func "+name)
				}
			case *ast.GenDecl:
				switch d.Tok {
				case token.TYPE:
					for _, spec := range d.Specs {
						ts, ok := spec.(*ast.TypeSpec)
						if !ok || !ts.Name.IsExported() {
							continue
						}
						// A doc may sit on the GenDecl (single-spec block) or the TypeSpec.
						doc := ts.Doc
						if doc == nil {
							doc = d.Doc
						}
						if doc == nil || strings.TrimSpace(doc.Text()) == "" {
							undocumented = append(undocumented, file+": type "+ts.Name.Name)
						}
					}
				case token.CONST, token.VAR:
					for _, spec := range d.Specs {
						vs, ok := spec.(*ast.ValueSpec)
						if !ok {
							continue
						}
						for _, n := range vs.Names {
							if !n.IsExported() {
								continue
							}
							doc := vs.Doc
							if doc == nil {
								doc = d.Doc
							}
							if doc == nil || strings.TrimSpace(doc.Text()) == "" {
								undocumented = append(undocumented, file+": "+strings.ToLower(d.Tok.String())+" "+n.Name)
							}
						}
					}
				}
			}
		}
	}

	if len(undocumented) > 0 {
		sort.Strings(undocumented)
		t.Errorf("doc-coverage: %d exported declaration(s) lack a doc comment:\n  %s",
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
