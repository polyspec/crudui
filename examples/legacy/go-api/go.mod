module github.com/crudui/crudui/examples/legacy/go-api

go 1.21

require (
	github.com/crudui/crudui/packages/validator-go v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/crudui/crudui/packages/validator-go => ../../../packages/validator-go
