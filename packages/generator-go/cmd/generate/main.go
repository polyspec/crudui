package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	gen "github.com/polyspec/crudui/packages/generator-go"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

func val(o *gen.Object, k string) any {
	if o == nil {
		return nil
	}
	v, _ := o.Get(k)
	return v
}
func obj(v any) *gen.Object { o, _ := v.(*gen.Object); return o }
func str(v any) string      { s, _ := v.(string); return s }
func compileOptions(o *gen.Object) gen.CompileOptions {
	files := map[string]*gen.Object{}
	if f := obj(val(o, "files")); f != nil {
		for _, k := range f.Keys() {
			files[k] = obj(val(f, k))
		}
	}
	return gen.CompileOptions{Files: files, Basepath: str(val(o, "basepath")), KeyPrefix: str(val(o, "keyPrefix")), KeyPrefixProvided: o != nil && o.Has("keyPrefix")}
}
func bindOptions(o *gen.Object) gen.BindOptions {
	// Decoded values are passed unchanged; BindForm defaults nil and rejects non-string values.
	return gen.BindOptions{IDPrefix: val(o, "idPrefix"), Language: val(o, "language"), KeyPrefix: val(o, "keyPrefix"), Unsupported: val(o, "unsupported")}
}
func errorObject(err error) *gen.Object {
	code, message, at := "INVALID_FORM_INPUT", err.Error(), ""
	if e, ok := err.(*compose.ComposeLoadError); ok {
		code, message = string(e.Code), e.Message
		if len(e.Trace) > 0 {
			at = strings.Join(e.Trace, ".")
		}
	}
	if e, ok := err.(*gen.UnsupportedFieldTypeError); ok {
		code, at = e.Code(), e.Path
	}
	return gen.NewObject("code", code, "message", message, "at", at)
}
func snapshot(f *gen.Form) (*gen.Object, error) {
	html, err := gen.RenderForm(f)
	if err != nil {
		return nil, err
	}
	return gen.NewObject("data", f.GetData(), "fields", f.Fields(), "html", html, "revision", f.Revision()), nil
}
func arg(args []any, n int) any {
	if n >= len(args) {
		return nil
	}
	return args[n]
}
func addOptions(v any) gen.AddRowOptions {
	o := obj(v)
	provided := o != nil && o.Has("value")
	return gen.AddRowOptions{Key: str(val(o, "key")), AfterKey: str(val(o, "afterKey")), Value: val(o, "value"), ValueProvided: provided}
}
func action(f *gen.Form, method string, args []any) (any, error) {
	switch method {
	case "setData":
		o := obj(arg(args, 0))
		if o == nil {
			return nil, fmt.Errorf("Form data must be an object")
		}
		return nil, f.SetData(o)
	case "getData":
		return f.GetData(), nil
	case "setValue":
		return nil, f.SetValue(str(arg(args, 0)), arg(args, 1))
	case "getValue":
		return f.GetValue(str(arg(args, 0)))
	case "addRow":
		return f.AddRow(str(arg(args, 0)), addOptions(arg(args, 1)))
	case "copyRow":
		return f.CopyRow(str(arg(args, 0)), str(arg(args, 1)), addOptions(arg(args, 2)))
	case "removeRow":
		return nil, f.RemoveRow(str(arg(args, 0)), str(arg(args, 1)))
	case "moveRow":
		n, ok := arg(args, 2).(float64)
		if !ok || float64(int(n)) != n {
			return nil, fmt.Errorf("Invalid row position")
		}
		return nil, f.MoveRow(str(arg(args, 0)), str(arg(args, 1)), int(n))
	case "rekeyRow":
		return nil, f.RekeyRow(str(arg(args, 0)), str(arg(args, 1)), str(arg(args, 2)))
	default:
		return nil, fmt.Errorf("Unknown form method: %s", method)
	}
}
func run(request *gen.Object) (any, error) {
	options := obj(val(request, "options"))
	if options == nil && request.Has("options") {
		return nil, fmt.Errorf("Options must be an object")
	}
	switch str(val(request, "operation")) {
	case "compileForm":
		return gen.CompileForm(obj(val(request, "spec")), compileOptions(options))
	case "renderList":
		rows := []*gen.Object{}
		if a, ok := val(request, "rows").([]any); ok {
			for _, v := range a {
				o := obj(v)
				if o == nil {
					return nil, fmt.Errorf("List rows must be objects")
				}
				rows = append(rows, o)
			}
		} else if request.Has("rows") {
			return nil, fmt.Errorf("List rows must be an array")
		}
		c := compileOptions(options)
		return gen.RenderList(obj(val(request, "spec")), rows, gen.ListOptions{Language: str(val(options, "language")), Data: obj(val(options, "data")), PageMeta: obj(val(options, "pageMeta")), Files: c.Files, Basepath: c.Basepath, Layout: str(val(options, "layout"))})
	case "buildDetail", "renderDetail":
		c := compileOptions(options)
		record := obj(val(request, "record"))
		if record == nil && request.Has("record") {
			return nil, fmt.Errorf("Detail record must be an object")
		}
		detailOptions := gen.DetailOptions{Language: str(val(options, "language")), Data: obj(val(options, "data")), Files: c.Files, Basepath: c.Basepath}
		if str(val(request, "operation")) == "buildDetail" {
			return gen.BuildDetail(obj(val(request, "spec")), record, detailOptions)
		}
		return gen.RenderDetail(obj(val(request, "spec")), record, detailOptions)
	case "bindForm", "form":
		b, e := json.Marshal(val(request, "template"))
		if e != nil {
			return nil, e
		}
		var template gen.FormTemplate
		if e = json.Unmarshal(b, &template); e != nil {
			return nil, e
		}
		data := obj(val(request, "data"))
		if data == nil && request.Has("data") {
			return nil, fmt.Errorf("Form data must be an object")
		}
		if str(val(request, "operation")) == "bindForm" {
			return gen.BindForm(&template, data, bindOptions(options))
		}
		f, e := gen.NewForm(&template, data, bindOptions(options))
		if e != nil {
			return nil, e
		}
		steps := []*gen.Object{}
		if a, ok := val(request, "actions").([]any); ok {
			for _, raw := range a {
				a := obj(raw)
				if a == nil {
					return nil, fmt.Errorf("Action must be an object")
				}
				args, _ := val(a, "args").([]any)
				result, e := action(f, str(val(a, "method")), args)
				step := gen.NewObject("result", result, "error", nil)
				if e != nil {
					step.Set("result", nil)
					step.Set("error", errorObject(e))
				}
				state, e := snapshot(f)
				if e != nil {
					return nil, e
				}
				for _, k := range state.Keys() {
					step.Set(k, val(state, k))
				}
				steps = append(steps, step)
			}
		} else if request.Has("actions") {
			return nil, fmt.Errorf("Actions must be an array")
		}
		out, e := snapshot(f)
		if e != nil {
			return nil, e
		}
		out.Set("steps", steps)
		return out, nil
	default:
		return nil, fmt.Errorf("Unknown generator operation")
	}
}
func main() {
	data, e := io.ReadAll(os.Stdin)
	var result any
	if e == nil {
		v, decodeErr := gen.DecodeJSON(data)
		e = decodeErr
		if e == nil {
			if request := obj(v); request != nil {
				result, e = run(request)
			} else {
				e = fmt.Errorf("Request must be an object")
			}
		}
	}
	if e != nil {
		result = gen.NewObject("error", errorObject(e))
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if e != nil {
		os.Exit(1)
	}
}
