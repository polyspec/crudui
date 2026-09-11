module github.com/polyspec/crudui/examples/form-comparison/servers/go

go 1.22

require (
	github.com/ordered-json/go v0.0.0
	github.com/polyspec/crudui/packages/generator-go v0.0.1
	github.com/polyspec/crudui/packages/validator-go v0.0.1
)

replace github.com/polyspec/crudui/packages/generator-go => ../../../../packages/generator-go

replace github.com/polyspec/crudui/packages/validator-go => ../../../../packages/validator-go

replace github.com/ordered-json/go => ../../../../.form-comparison/sources/ordered-json/go
