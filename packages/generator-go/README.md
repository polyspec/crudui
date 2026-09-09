# CRUDUI Go generator

[한국어](README.ko.md).

The Go package compiles form templates, binds data, manages keyed rows, and
renders form and list HTML. Generation executes in Go and shares specification
composition and expression evaluation with the Go validator.

## Use

```go
import generator "github.com/crudui/crudui/packages/generator-go"

spec := generator.NewObject("type", "group", "properties",
    generator.NewObject("name", generator.NewObject("type", "text", "label", "Name")))
template, err := generator.CompileForm(spec, generator.CompileOptions{})
if err != nil { return err }
form, err := generator.NewForm(template,
    generator.NewObject("name", "Ada"), generator.BindOptions{Language: "en"})
if err != nil { return err }
html, err := generator.RenderForm(form)
```

`CompileForm` resolves composition without record data. The template can be
serialized with `encoding/json` and decoded into `FormTemplate`. `BindForm`
returns complete field models without modifying the template or record.
`NewForm` creates an instance with a detached template and record.

`Form.SetData` replaces a record. `GetData`, `GetValue`, `Fields` and `Template`
return detached values. `SetValue` updates one field. Row operations are
`AddRow`, `CopyRow`, `RemoveRow`, `MoveRow` and `RekeyRow`; collection paths are
relative to the record root. A failed operation preserves record data, field
models and revision. `RenderForm` renders the current instance without changing it.

`BuildList` returns list models. `RenderList` accepts `ListOptions.Layout` as
`table` or `card`. List data is supplied by the caller; generation does not query
a database. Built-in image cells produce deduplicated preload links in first-use
order. Raw HTML content does not create resource links.

Date controls, datetime controls and date list cells use UTC. Accepted ISO and
RFC 2822 values are parsed by one strict parser; invalid or unsupported strings
remain unchanged. Rendering converts explicit offsets and retains original
instance data. Datetime controls include seconds.

## Ordered values

Objects use `*generator.Object`, the shared insertion-ordered object type. Build
them with `NewObject(key, value, ...)` or decode with `DecodeJSON`. Arrays use
`[]any`; `nil` is JSON null. Native unordered maps and recursive values are rejected.
The example's validation map is a separate lookup-only value; stored data retains
its ordered representation.

Repeated fields use keyed objects. `SequenceRowKey(42)` returns
`__0000000000042__`; `CreateRowKey()` generates a random 13-character hexadecimal
key. Keys remain scoped to their parent collection. Missing repeated data creates
one default row; an explicit empty object creates zero rows. Arrays and null
cannot replace a repeated collection.

`AddRowOptions.Value` supplies row data. Set `ValueProvided: true` when supplying
an explicit null scalar row; leaving both fields unset applies field defaults.
`Key` sets a row key and `AfterKey` selects its insertion position.

Set `CompileOptions.KeyPrefixProvided` or `BindOptions.KeyPrefixProvided` when
supplying an explicit empty `KeyPrefix`. An omitted instance prefix uses the
template prefix. Compilation without a prefix and an explicit empty instance
prefix both omit that name segment.

## Run and verify

From this package directory:

```sh
go test ./...
go run ./examples/server -data /tmp/crudui-go-record.json
```

Open `http://127.0.0.1:8087/`. Go compiles the template once, renders saved records,
validates submitted form or JSON data, saves valid records to the explicit JSON
file and reloads them. `/template` returns the reusable template and `/data`
returns the stored record. The example uses two scalar fields; it does not
provide the React, Vue and Svelte comparison matrix.

```sh
curl -H 'Content-Type: application/json' \
  --data '{"name":"Ada","email":"ada@example.test"}' \
  http://127.0.0.1:8087/
```

The `cmd/generate` CLI accepts one JSON request on stdin and returns one JSON
value. Supported operations are `compileForm`, `bindForm`, `form`, and
`renderList`. The `form` operation executes actions and records complete state
after both successful and rejected operations. It is a conformance adapter;
applications call the library directly.
